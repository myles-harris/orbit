import { prisma } from '../db/prisma.js';
import { notifications } from './notifications.js';
import type { CallLiveActivityState } from './notifications.js';

/** Kill switch. Default on; set PRESENCE_ENABLED=false to stop the fan-out. */
const PRESENCE_ENABLED = process.env.PRESENCE_ENABLED !== 'false';

/** Trailing debounce so one pruner sweep does not fan out once per vacated participant. */
const DEBOUNCE_MS = 1000;

/**
 * A call that ended more than this long ago is not worth broadcasting for. The window
 * exists because a spontaneous call is CLOSED in the same request that vacates its last
 * participant (calls.ts:398, scheduler.ts:493, svc.ts), so the debounced broadcast always
 * observes status 'ended'. Bailing on that would mean the count never reaches 0.
 */
const ENDED_GRACE_MS = 60 * 1000;

/** Spontaneous calls have no ends_at; their surface expires this long after start. */
export const SPONTANEOUS_TTL_MS = 60 * 60 * 1000;

const pending = new Map<string, NodeJS.Timeout>();
const lastCount = new Map<string, number>();
const inFlight = new Set<string>();

export function expiryFor(call: {
  call_type: string;
  started_at: Date | null;
  ends_at: Date | null;
}): Date | null {
  if (call.call_type === 'scheduled') return call.ends_at;
  return call.started_at ? new Date(call.started_at.getTime() + SPONTANEOUS_TTL_MS) : null;
}

/**
 * Recompute the participant count for a call and push it to every non-muted member's
 * live surface. Idempotent, safe from any trigger site, debounced per call.
 */
export function broadcastCallPresence(callId: string): void {
  if (!PRESENCE_ENABLED) return;
  const existing = pending.get(callId);
  if (existing) clearTimeout(existing);
  pending.set(callId, setTimeout(() => {
    pending.delete(callId);
    if (inFlight.has(callId)) {
      // A run is still awaiting APNs. Re-arm rather than racing it — the trailing
      // debounce means the newer count is the one that must land last.
      broadcastCallPresence(callId);
      return;
    }
    inFlight.add(callId);
    void runBroadcast(callId)
      .catch(err => console.error(`[presence] Broadcast failed for call ${callId}:`, err))
      .finally(() => inFlight.delete(callId));
  }, DEBOUNCE_MS));
}

async function loadCall(callId: string) {
  return prisma.callSession.findUnique({
    where: { id: callId },
    select: {
      id: true, group_id: true, call_type: true, status: true,
      started_at: true, ends_at: true, ended_at: true,
    },
  });
}

function buildState(
  groupName: string,
  call: { call_type: string; ends_at: Date | null },
  count: number,
): CallLiveActivityState {
  return {
    groupName,
    callType: call.call_type as 'scheduled' | 'spontaneous',
    endsAtMs: call.ends_at ? call.ends_at.getTime() : undefined,
    participantCount: count,
  };
}

async function runBroadcast(callId: string): Promise<void> {
  const call = await loadCall(callId);
  if (!call) { forgetCallPresence(callId); return; }

  // [fix 1] Do NOT bail on status 'ended': the last leave closes the call in the same
  // request, so that guard would freeze the surface at 1 and the "rests at 0" behaviour
  // would never happen. Bail only on calls that ended long enough ago to be irrelevant.
  if (call.ended_at && Date.now() - call.ended_at.getTime() > ENDED_GRACE_MS) {
    forgetCallPresence(callId);
    return;
  }

  // [fix 8] Count first, compare, and return before paying for the group and token reads.
  const inCall = await prisma.callParticipant.findMany({
    where: { call_id: callId, left_at: null },
    select: { user_id: true },
  });
  const count = inCall.length; // [fix 7] no separate count() query, same data

  const previous = lastCount.get(callId);
  if (previous === count) return;
  lastCount.set(callId, count);

  try {
    const [group, activityTokens] = await Promise.all([
      prisma.group.findUnique({
        where: { id: call.group_id },
        include: { members: { include: { user: { select: { id: true, devices: true } } } } },
      }),
      prisma.callLiveActivityToken.findMany({
        where: { call_id: callId }, select: { push_token: true, user_id: true },
      }),
    ]);
    if (!group) return;

    const expiry = expiryFor(call);
    const state = buildState(group.name, call, count);
    const mutedUserIds = new Set(
      group.members.filter(m => m.is_muted).map(m => m.user_id),
    );

    // iOS: silent Live Activity update to every registered activity token for this call.
    // Muted members are excluded here as well as on Android. A member who mutes the
    // group after the call starts keeps a running activity, and pushing to it is the
    // opposite of what muting means on every other surface.
    const iosTokens = activityTokens
      .filter(t => !mutedUserIds.has(t.user_id))
      .map(t => t.push_token);
    if (iosTokens.length > 0) {
      const r = await notifications.updateLiveActivities(iosTokens, state, expiry ?? undefined);
      if (r.stale.length > 0) {
        await prisma.callLiveActivityToken.deleteMany({
          where: { call_id: callId, push_token: { in: r.stale } },
        });
      }
    }

    // Android: data-only push, split by whether the recipient is in the call. A
    // participant's card stays ongoing, a non-participant's must be dismissible.
    //
    // Skipped once the call is actually ended: endLiveActivitiesForCall (scheduler.ts
    // closeCall) already sent call_ended and CallNotificationHelper.cancel()'d the
    // notification by the time this debounced broadcast — deliberately left armed by
    // forgetCallPresence, see its own comment — fires a moment later. Resending
    // call_presence here would re-post the just-cancelled card with a stale "ongoing"
    // state and undo the cancellation.
    if (!call.ended_at) {
      const inCallIds = new Set(inCall.map(p => p.user_id));
      const base: Record<string, string> = {
        type: 'call_presence',
        callId,
        groupId: call.group_id,
        groupName: group.name,
        count: String(count),
        ...(call.ends_at ? { endsAtMs: String(call.ends_at.getTime()) } : {}),
        ...(expiry ? { timeoutAtMs: String(expiry.getTime()) } : {}),
      };

      // The two buckets target disjoint token sets, so send them concurrently.
      await Promise.all([true, false].map(ongoing => {
        const tokens = group.members
          .filter(m => !m.is_muted && inCallIds.has(m.user_id) === ongoing)
          .flatMap(m => m.user.devices.filter(d => d.platform === 'android').map(d => d.token));
        return tokens.length > 0
          ? notifications.sendExpoData(tokens, { ...base, ongoing: String(ongoing) })
          : undefined;
      }));
    }

    console.log(`[presence] Call ${callId} -> ${count} in call; ${iosTokens.length} iOS token(s)`);
  } catch (err) {
    // Roll the recorded count back. Setting lastCount before the sends means a failed
    // fan-out permanently suppresses every later broadcast at that same count, and the
    // count sits wrong on every device until it happens to change twice.
    if (previous === undefined) lastCount.delete(callId);
    else lastCount.set(callId, previous);
    throw err;
  }
}

/**
 * [fix 3] Seed one freshly-registered activity token with the current count.
 * Broadcasts only fire on a count CHANGE, so without this a token that registers
 * mid-call renders whatever push-to-start seeded until the count next moves.
 */
export async function sendPresenceToToken(callId: string, pushToken: string): Promise<void> {
  if (!PRESENCE_ENABLED) return;
  const call = await loadCall(callId);
  if (!call || call.status !== 'active') return;

  const [count, group] = await Promise.all([
    prisma.callParticipant.count({ where: { call_id: callId, left_at: null } }),
    prisma.group.findUnique({ where: { id: call.group_id }, select: { name: true } }),
  ]);
  if (!group) return;

  const r = await notifications.updateLiveActivities(
    [pushToken],
    buildState(group.name, call, count),
    expiryFor(call) ?? undefined,
  );
  if (r.stale.length > 0) {
    await prisma.callLiveActivityToken.deleteMany({
      where: { call_id: callId, push_token: { in: r.stale } },
    });
  }
}

/**
 * Drop the cached count for a call. Called from the end job and from scheduler.closeCall.
 *
 * Deliberately does NOT cancel a pending debounced broadcast. pruneStaleParticipants, the
 * Daily webhook, and /me/calls/leave all call broadcastCallPresence for a call's last leave
 * and then, moments later in that same request, call scheduler.closeCall for the same call —
 * which used to reach here and clearTimeout the just-armed broadcast, silently dropping the
 * final participantCount=0 update that [fix 1] exists to guarantee. Leaving the timer alone
 * is safe: it still fires ~1s later, finds the call ended-but-within-grace via runBroadcast,
 * and delivers the 0. If the call is fully gone by then, runBroadcast's own `if (!call)`
 * guard cleans up pending/lastCount itself.
 */
export function forgetCallPresence(callId: string): void {
  lastCount.delete(callId);
}

/**
 * Ends every registered Live Activity for a call and clears its token rows. Runs
 * regardless of PRESENCE_ENABLED, deliberately: that flag stops the fan-out, but must
 * not strand activities on lock screens forever. endLiveActivities sends `event: 'end'`
 * and is not a presence update.
 */
export async function endLiveActivitiesForCall(callId: string): Promise<void> {
  const call = await loadCall(callId);
  if (!call) { forgetCallPresence(callId); return; }

  const [tokens, group, count] = await Promise.all([
    prisma.callLiveActivityToken.findMany({ where: { call_id: callId }, select: { push_token: true } }),
    prisma.group.findUnique({
      where: { id: call.group_id },
      include: { members: { include: { user: { select: { id: true, devices: true } } } } },
    }),
    prisma.callParticipant.count({ where: { call_id: callId, left_at: null } }),
  ]);

  if (tokens.length > 0 && group) {
    await notifications.endLiveActivities(
      tokens.map(t => t.push_token),
      buildState(group.name, call, count),
      new Date(),
    );
  }

  // Android has no push-driven Live Activity equivalent — CallNotificationHelper anchors
  // its ongoing notification's dismissal on timeoutAtMs/endsAtMs, which for a spontaneous
  // call is up to an hour away. This data push lets OrbitFirebaseMessagingService cancel
  // it immediately, the Android counterpart to the iOS end push above.
  if (group) {
    // Muted members never received call_started or call_presence for this call in the
    // first place (both are filtered on !m.is_muted elsewhere in this file and in
    // scheduler.ts/calls.ts), so they have nothing to cancel — filtered here to match
    // every other push path in this file, not because sending it would itself be unsafe.
    const androidTokens = group.members
      .filter(m => !m.is_muted)
      .flatMap(m => m.user.devices.filter(d => d.platform === 'android').map(d => d.token));
    if (androidTokens.length > 0) {
      await notifications.sendExpoData(androidTokens, {
        type: 'call_ended',
        callId,
        groupId: call.group_id,
      });
    }
  }

  await prisma.callLiveActivityToken.deleteMany({ where: { call_id: callId } });
  forgetCallPresence(callId);
  console.log(`[presence] Ended ${tokens.length} Live Activity/ies for call ${callId}`);
}

/** [fix 9] Test-only: clears every pending timer so Jest does not report open handles. */
export function resetCallPresenceState(): void {
  for (const t of pending.values()) clearTimeout(t);
  pending.clear();
  lastCount.clear();
  inFlight.clear();
}
