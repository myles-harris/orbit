import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/AppNavigator';
import { GroupDTO, UserDTO, parseApiError } from '@orbit/shared';
import { createAuthenticatedApiClient } from '../utils/apiClient';
import { useClockAt } from '../utils/countdown';
import { Invitation, homeCacheEpoch, readHomeCache, writeHomeCache } from '../utils/homeCache';
import { LiveCall, fetchLiveCalls, hasCountdown, isLive, pickHeroCall } from '../utils/liveCalls';
import { formatSavedAt } from '../utils/timeFormat';
import { layout, spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { BottomActionBar } from '../components/BottomActionBar';
import { CallSpotlight } from '../components/CallSpotlight';
import { CallTimer } from '../components/CallTimer';
import { Display } from '../components/Display';
import { FilterTabs } from '../components/FilterTabs';
import { GroupTile } from '../components/GroupTile';
import { InvitationRow } from '../components/InvitationRow';
import { LiveCallCard } from '../components/LiveCallCard';
import { OfflineBanner } from '../components/OfflineBanner';
import { PasteInviteModal } from '../components/PasteInviteModal';
import { UserAvatar } from '../components/UserAvatar';

type HomeScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Home'>;

type FilterTab = 'All' | 'Daily' | 'Weekly' | 'Invited';
const FILTER_TABS: FilterTab[] = ['All', 'Daily', 'Weekly', 'Invited'];

// Screen 05 puts the first-run headline at y=188 on a 390×844 canvas whose status
// bar is 54pt. With the filter row gone, the gap under the header is what's left.
const FIRST_RUN_TOP_GAP = 188 - 54 - layout.headerHeight;

// A call that starts while Home is open has nothing to push it here, so Home asks.
const LIVE_CALL_POLL_MS = 15_000;

// Offline, the saved copy is dimmed rather than hidden: it is real, just not live.
const OFFLINE_GRID_OPACITY = 0.72;

function getCadenceLabel(cadence: string, weekly_frequency?: number | null) {
  if (cadence === 'daily') return 'Daily';
  if (weekly_frequency) return `${weekly_frequency}×/wk`;
  return 'Weekly';
}

function chunkPairs<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

// ─── HomeScreen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { theme: { colors } } = useTheme();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [groups, setGroups] = useState<GroupDTO[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [me, setMe] = useState<UserDTO | null>(null);
  const [liveCalls, setLiveCalls] = useState<LiveCall[]>([]);
  // True once a load has succeeded. Until then the lists are empty because nothing
  // has arrived, not because the user has no groups — so no empty state may draw.
  const [hasLoaded, setHasLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('All');
  const [loadError, setLoadError] = useState<string | null>(null);
  // When the copy on screen was fetched (epoch ms), set only while it is a saved copy
  // drawn because the latest load could not reach the server. Null means what is on
  // screen is live. It is what the offline banner, the dimmed grid and the inert
  // "New group" all key off.
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const offline = savedAt !== null;
  // The call the spotlight overlay is up for, null once it is dismissed or joined.
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  // Set the first time the overlay is decided. It is a once-per-mount question — "was a
  // call live when Home opened?" — not "is one live now": a call that starts while Home
  // is open gets its card at the next poll, not an overlay popping up over the user.
  const spotlightDecided = useRef(false);
  // Invites the user has answered this session. "Later" hides one without the
  // server's help: 'dismiss' leaves it pending, so it returns on the next launch,
  // until it expires. An accepted one is added too, so a reload that fails after
  // the accept can't leave behind a row whose second Accept would only 400.
  const [hiddenInviteIds, setHiddenInviteIds] = useState<Set<string>>(() => new Set());
  // A set, not a single id: two rows can be answered at once, and each keeps its
  // own in-flight state.
  const [respondingIds, setRespondingIds] = useState<Set<string>>(() => new Set());
  const [pasteOpen, setPasteOpen] = useState(false);
  const loadSeq = useRef(0);

  const styles = useMemo(() => makeStyles(colors), [colors]);

  const loadData = async () => {
    // Loads overlap — React Navigation fires 'focus' on the initial route as well as
    // the mount call below, and a pull-to-refresh can straddle an Accept's reload.
    // Only the newest load may write state: an older one landing late would replace
    // fresher data, or re-raise an error the newer load had already cleared.
    const seq = ++loadSeq.current;
    // A sign-out clears the copy; a load that began before it must not write one back.
    const cacheEpoch = homeCacheEpoch();
    setLoadError(null);
    try {
      const client = await createAuthenticatedApiClient();
      const [groupsRes, invitationsRes, meRes, calls] = await Promise.all([
        client.get<{ groups: GroupDTO[] }>('/groups'),
        client.getMyInvitations(),
        // Only the header avatar reads this — a failed /me must not blank the grid.
        client.get<UserDTO>('/me').catch(() => null),
        // Asked for alongside the rest: Home draws nothing until the load is done, so a
        // request that started afterwards would add a round trip to every load. A failed
        // one is null, not "no calls" — it must not take down a card that is already up.
        fetchLiveCalls().catch((): null => null),
      ]);
      if (seq !== loadSeq.current) return;
      setGroups(groupsRes.groups);
      setInvitations(invitationsRes.invitations);
      if (meRes) setMe(meRes);
      if (calls) setLiveCalls(calls);
      // These two come last on purpose. The spotlight effect keys off them and reads
      // the groups and calls set above, so they have to be in place by the render in
      // which either of these changes.
      setSavedAt(null); // live again: the banner goes
      setHasLoaded(true);
      // Fire and forget: writeHomeCache never rejects, and a slow disk must not hold
      // up the render. Only the newest load reaches here, so the copy is never older
      // than one already saved.
      writeHomeCache(
        { groups: groupsRes.groups, invitations: invitationsRes.invitations, fetchedAt: Date.now() },
        cacheEpoch,
      );
    } catch (error) {
      if (seq !== loadSeq.current) return;
      console.error('Failed to load data:', error);
      // A saved copy beats an error: draw it, and say so. Only with nothing saved —
      // a cold install with no connection — is there truly nothing to show.
      const cached = await readHomeCache();
      // The read is a second await: a newer load may have started, and finished, in it.
      if (seq !== loadSeq.current) return;
      if (cached) {
        setGroups(cached.groups);
        setInvitations(cached.invitations);
        setSavedAt(cached.fetchedAt);
        setHasLoaded(true);
      } else {
        setLoadError("Couldn't load your groups. Pull down to retry.");
      }
    }
  };

  useEffect(() => {
    loadData();
    const unsubscribe = navigation.addListener('focus', loadData);
    return () => {
      unsubscribe();
      // Leaving Home makes any load still in flight stale, so it sets no state on a
      // screen that is gone. (Not what stops it writing a copy after a sign-out: Home
      // is still mounted while the sign-out clears the cache. That is the epoch's job.)
      loadSeq.current += 1;
    };
  }, [navigation]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // ─── Live calls ─────────────────────────────────────────────────────────────

  // Which calls are live changes only when a scheduled call's end time passes, so
  // this clock sleeps until the next one instead of ticking: the screen re-renders
  // when a call ends, not every second. The per-second countdown lives in
  // <CallTimer/>, which re-renders alone. Spontaneous calls have no end time, so
  // they add no deadline here — their timer counts up inside <CallTimer/> too, and
  // nothing but the server ends them. Every reading is Date.now(), never a
  // decrement, so a backgrounded app is right the moment it returns.
  //
  // Offline there are none. What is live is the server's to say and Home cannot reach
  // it, so a saved copy shows no live card, no live tile and no overlay — whether Home
  // started offline (there never were any) or lost the connection with a call up. The
  // two must agree, and "nothing is live, so nothing is marigold". The calls stay in
  // state, so Retry shows the freshest set without waiting for the next poll.
  const shownCalls = offline ? [] : liveCalls;
  const endTimes = shownCalls.filter(hasCountdown).map((c) => new Date(c.ends_at).getTime());
  const now = useClockAt(endTimes, isFocused);

  // Which calls are live is the server's to say, so ask again every 15s while the
  // screen is focused and stop the moment it is not. The first read is `loadData`'s,
  // which runs on focus, so the interval's first tick is a full period away. A failed
  // poll keeps what is already on screen — a network blip is not a call ending — and
  // one that resolves after blur is dropped.
  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;
    const id = setInterval(() => {
      fetchLiveCalls()
        .then((calls) => { if (!cancelled) setLiveCalls(calls); })
        .catch(() => {});
    }, LIVE_CALL_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isFocused]);

  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const activeCalls = shownCalls.filter((c) => groupsById.has(c.group_id) && isLive(c, now));
  // The card is a live-call surface, not a list row, so it stays put across the
  // cadence filters. The Invited tab swaps the whole grid, and the card with it.
  const heroCall = activeCalls.length > 0 && activeFilter !== 'Invited' ? pickHeroCall(activeCalls) : null;
  const heroGroup = heroCall ? groupsById.get(heroCall.group_id) : undefined;
  const otherLiveGroupIds = new Set(activeCalls.filter((c) => c !== heroCall).map((c) => c.group_id));

  // ─── Spotlight ──────────────────────────────────────────────────────────────

  // Decided once, the first time Home has live data and somebody to show it to. Offline
  // there is no live data to judge by, and a blurred Home has nobody looking — either
  // waits, and the question is asked the moment it can be answered. Kept in component
  // state, not storage: a call that is still live at the next cold start earns the
  // overlay again.
  //
  // If the live-call request itself failed on that load there is nothing to judge by
  // either, and the decision is spent: the card turns up at the next poll instead. That
  // is deliberate. Waiting for a poll to decide would raise the overlay for a call that
  // started after the user had already opened the app.
  //
  // The overlay is for the spotlighted group's *card*. The design's background tile
  // carries a 22pt marigold "ringing" label for that group, but here the group on the
  // call is the hero — drawn as the live card, not as a tile — so there is no tile to
  // label and none is drawn; the card stands behind the overlay in its place. (The 13pt
  // "live" on GroupTile is for a live group that is *not* the hero.)
  //
  // Before paint, so Home never shows one un-dimmed frame before the overlay lands.
  useLayoutEffect(() => {
    if (!hasLoaded || offline || !isFocused || spotlightDecided.current) return;
    spotlightDecided.current = true;
    const call = pickHeroCall(activeCalls);
    if (call) setSpotlightId(call.id);
  }, [hasLoaded, offline, isFocused]);

  // By id, so it goes when that call ends instead of moving to whichever is live next.
  const spotlightCall = spotlightId ? activeCalls.find((c) => c.id === spotlightId) : undefined;
  const spotlightGroup = spotlightCall ? groupsById.get(spotlightCall.group_id) : undefined;
  // Only while focused: it lives in this screen's tree and its back-button handler is
  // global, so a Home sitting under another screen must not keep either.
  const showSpotlight = !!spotlightCall && !!spotlightGroup && isFocused;
  const dismissSpotlight = useCallback(() => setSpotlightId(null), []);

  const joinLiveCall = async (call: LiveCall) => {
    try {
      const client = await createAuthenticatedApiClient();
      const tokenData = await client.post<any>(`/groups/${call.group_id}/calls/${call.id}/join-token`, {});
      navigation.navigate('Call', {
        callId: call.id, groupId: call.group_id, roomUrl: tokenData.room_url,
        token: tokenData.token, endsAt: tokenData.ends_at ?? undefined,
      });
    } catch (error: any) {
      Alert.alert('Error', parseApiError(error));
    }
  };

  // ─── Invitations ────────────────────────────────────────────────────────────

  const pendingInvites = invitations.filter((inv) => !hiddenInviteIds.has(inv.id));

  // When the last invitation leaves the Invited tab — answered, or gone from a
  // refresh because it expired — follow the user to where their groups are rather
  // than leave them on an empty tab. Only on that transition: tapping Invited with
  // nothing pending must still say so.
  const pendingCount = pendingInvites.length;
  const prevPendingCount = useRef(0);
  useEffect(() => {
    if (activeFilter === 'Invited' && prevPendingCount.current > 0 && pendingCount === 0) {
      setActiveFilter('All');
    }
    prevPendingCount.current = pendingCount;
  }, [pendingCount, activeFilter]);

  const hideInvite = (id: string) => setHiddenInviteIds((prev) => new Set(prev).add(id));
  const setResponding = (id: string, on: boolean) =>
    setRespondingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // Accept and Decline share everything that matters: one in-flight flag per row,
  // the reload landing before the row goes, and a rejected response resyncing.
  const answerInvitation = async (invitation: Invitation, action: 'accept' | 'decline') => {
    setResponding(invitation.id, true);
    try {
      const client = await createAuthenticatedApiClient();
      await client.respondToInvitation(invitation.id, action);
    } catch (error) {
      // The server is the source of truth. A rejected answer (already a member
      // through a link, already answered, expired) leaves a row that can only fail
      // again, so resync rather than strand it.
      Alert.alert('Error', parseApiError(error));
      loadData();
      setResponding(invitation.id, false);
      return;
    }
    // The row stays, dimmed, until the reload lands — so an accepted invite hands
    // over to its new tile in one render instead of flashing the empty state.
    await loadData();
    hideInvite(invitation.id);
    setResponding(invitation.id, false);
  };

  const acceptInvitation = (invitation: Invitation) => answerInvitation(invitation, 'accept');

  // Permanent: the server marks the invite 'declined', and the inviter has to send
  // a new one. So it asks first. No success alert — the row leaving is the answer.
  const declineInvitation = (invitation: Invitation) => {
    Alert.alert(
      'Decline invitation?',
      `You'll need ${invitation.invited_by} to invite you again to join ${invitation.group.name}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Decline', style: 'destructive', onPress: () => answerInvitation(invitation, 'decline') },
      ],
    );
  };

  const laterInvitation = (invitation: Invitation) => {
    hideInvite(invitation.id);
    // 'dismiss' leaves the invite pending server-side and only logs that it was
    // seen; nothing the row depends on, so a failure is not surfaced.
    createAuthenticatedApiClient()
      .then((client) => client.respondToInvitation(invitation.id, 'dismiss'))
      .catch(() => {});
  };

  // ─── What to show ───────────────────────────────────────────────────────────

  const noGroups = hasLoaded && groups.length === 0;
  // Nothing at all to filter: screen 05 draws no filter row. If an invite is
  // pending the row stays — the Invited tab is the only place it can be answered.
  // It also stays while the Invited tab is showing, since the first-run screen is
  // never drawn there and the row is the only way back to it.
  const showHeadline = noGroups && !loadError && activeFilter !== 'Invited';
  const firstRun = showHeadline && pendingInvites.length === 0;

  const visibleGroups = groups.filter((g) => {
    if (activeFilter === 'Daily') return g.cadence === 'daily';
    if (activeFilter === 'Weekly') return g.cadence === 'weekly';
    return true;
  });
  const tileGroups = visibleGroups.filter((g) => g.id !== heroGroup?.id);

  const renderTile = (g: GroupDTO) => (
    <GroupTile
      key={g.id}
      name={g.name}
      groupId={g.id}
      hasPhoto={g.has_photo}
      photoUpdatedAt={g.photo_updated_at}
      cadence={getCadenceLabel(g.cadence, g.weekly_frequency)}
      subLabel={g.is_muted ? 'muted' : undefined}
      live={otherLiveGroupIds.has(g.id)}
      onPress={() => navigation.navigate('GroupDetail', { groupId: g.id })}
    />
  );

  const renderBody = () => {
    if (!hasLoaded && !loadError) return null;

    // Wherever there is nothing to draw, a failed load is the likelier reason than
    // an empty account — say that instead of "No weekly groups".
    const loadFailed = (
      <View style={styles.message}>
        <Text style={styles.messageTitle}>Couldn't load groups</Text>
        <Text style={styles.messageSub}>{loadError}</Text>
      </View>
    );

    if (activeFilter === 'Invited') {
      if (pendingInvites.length === 0) {
        return loadError ? loadFailed : (
          <View style={styles.message}>
            <Text style={styles.messageTitle}>No pending invitations</Text>
            <Text style={styles.messageSub}>You're all caught up</Text>
          </View>
        );
      }
      return (
        <View style={styles.stack}>
          {pendingInvites.map((inv) => (
            <InvitationRow
              key={inv.id}
              groupName={inv.group.name}
              invitedBy={inv.invited_by}
              cadence={getCadenceLabel(inv.group.cadence, inv.group.weekly_frequency)}
              busy={respondingIds.has(inv.id)}
              onAccept={() => acceptInvitation(inv)}
              onLater={() => laterInvitation(inv)}
              onDecline={() => declineInvitation(inv)}
            />
          ))}
        </View>
      );
    }

    if (showHeadline) {
      return (
        <View style={[styles.firstRun, { paddingTop: firstRun ? FIRST_RUN_TOP_GAP : spacing.xxxl }]}>
          <Display size={34} leading={1.1}>No groups yet</Display>
          {/* A sibling View, not textDecorationLine: RN ignores textDecorationColor
              on Android and the offset everywhere (Appendix E). */}
          <TouchableOpacity
            onPress={() => setPasteOpen(true)}
            activeOpacity={0.7}
            accessibilityRole="link"
            style={styles.link}
          >
            <Text style={styles.linkText}>Paste an invite link instead</Text>
            <View style={styles.linkRule} />
          </TouchableOpacity>
        </View>
      );
    }

    if (tileGroups.length === 0 && !heroCall) {
      return loadError ? loadFailed : (
        <View style={styles.message}>
          <Text style={styles.messageTitle}>No {activeFilter.toLowerCase()} groups</Text>
          <Text style={styles.messageSub}>Switch filters to see your groups</Text>
        </View>
      );
    }

    return (
      <View style={styles.stack}>
        {heroCall && heroGroup ? (
          <LiveCallCard
            groupName={heroGroup.name}
            joinedCount={heroCall.participant_count}
            totalCount={heroGroup.member_count}
            // Down for a scheduled call, up from when it started for any other — the
            // direction is CallTimer's, so the card and the overlay cannot disagree.
            timer={<CallTimer call={heroCall} active={isFocused} />}
            onJoin={() => joinLiveCall(heroCall)}
          />
        ) : null}
        {chunkPairs(tileGroups).map((pair) => (
          <View key={pair[0].id} style={styles.tileRow}>
            {pair.map(renderTile)}
            {/* An odd last tile keeps its half-width square instead of stretching. */}
            {pair.length === 1 ? <View style={styles.tileSpacer} /> : null}
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Everything but the spotlight. While the overlay is up this is hidden from
          screen readers on both platforms, since the overlay is in the tree, not a
          Modal, and would otherwise leave the whole screen behind it reachable. */}
      <View
        style={styles.underlay}
        importantForAccessibility={showSpotlight ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={showSpotlight}
      >
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <View style={styles.headerRow}>
            <Display size={21} accessibilityRole="header">Orbit</Display>
            <TouchableOpacity
              onPress={() => navigation.navigate('Account')}
              activeOpacity={0.7}
              // 36pt drawn, 44pt touchable.
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Account"
            >
              {/* Without a loaded profile this draws the empty bordered shape, so
                  Account (and Log out) stays reachable even if /me fails. */}
              <UserAvatar
                userId={me?.id ?? ''}
                username={me?.username ?? ''}
                hasAvatar={me?.has_avatar ?? false}
                avatarUpdatedAt={me?.avatar_updated_at}
                size={36}
                colors={colors}
              />
            </TouchableOpacity>
          </View>
        </View>

        {savedAt !== null && (
          <OfflineBanner savedAt={formatSavedAt(savedAt, Date.now())} onRetry={onRefresh} busy={refreshing} />
        )}

        {!firstRun && (
          <FilterTabs
            tabs={FILTER_TABS}
            active={activeFilter}
            onChange={setActiveFilter}
            invitedCount={pendingInvites.length}
            // Nothing is live offline, so nothing is marigold — not even the active rule.
            ruleColor={offline ? colors.borderStrong : undefined}
            style={styles.filterRow}
          />
        )}

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.textSecondary}
              colors={[colors.textSecondary]}
            />
          }
        >
          {/* Dimmed, not hidden: the saved copy is real, only no longer live. */}
          <View style={offline ? styles.offlineBody : undefined}>{renderBody()}</View>
        </ScrollView>

        {/* Home's marigold belongs to the live call. With nothing live the only
            marigold on screen is the active tab's rule — which is what makes a
            ringing call read instantly — so "New group" is outlined. First run has
            no tabs and no call, so the one primary action takes the marigold.
            Offline it is inert either way: creating a group needs the server. */}
        <BottomActionBar
          variant={showHeadline ? 'primary' : 'secondary'}
          label={showHeadline ? 'Create a group' : 'New group'}
          disabled={offline}
          caption={offline ? 'Creating groups needs a connection.' : undefined}
          onPress={() => navigation.navigate('CreateGroup')}
        />
      </View>

      <PasteInviteModal
        visible={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onSubmit={(code) => {
          setPasteOpen(false);
          navigation.navigate('JoinInvite', { code });
        }}
      />

      {showSpotlight && spotlightCall && spotlightGroup ? (
        <CallSpotlight
          call={spotlightCall}
          group={spotlightGroup}
          active={isFocused}
          onDismiss={dismissSpotlight}
          // Joining answers the overlay as much as Dismiss does: coming back from the
          // call must not put the same prompt in front of the user again.
          onJoin={() => {
            dismissSpotlight();
            joinLiveCall(spotlightCall);
          }}
        />
      ) : null}
    </View>
  );
}

// ─── Themed styles ────────────────────────────────────────────────────────────
function makeStyles(colors: ReturnType<typeof useTheme>['theme']['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    underlay: { flex: 1 },
    offlineBody: { opacity: OFFLINE_GRID_OPACITY },
    header: { backgroundColor: colors.background },
    headerRow: {
      minHeight: layout.headerHeight,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.screenPad,
    },
    // Inset the tabs to the header's 20pt while the row's hairline stays full-bleed.
    filterRow: { paddingHorizontal: layout.screenPad },
    scrollContent: { padding: layout.gridPad },
    stack: { gap: layout.gridGap },
    // Two flex:1 tiles per row make each one (width − 2·gridPad − gridGap) / 2, and
    // the tile's own aspectRatio makes it square.
    tileRow: { flexDirection: 'row', gap: layout.gridGap },
    tileSpacer: { flex: 1 },
    message: { alignItems: 'center', paddingTop: 80, paddingHorizontal: spacing.xl, gap: spacing.sm },
    messageTitle: {
      fontFamily: 'Geist_600SemiBold',
      fontSize: 18,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    messageSub: {
      fontFamily: 'Geist_400Regular',
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    // The scroll content already insets 16; this lines the headline up with the
    // header's 20.
    firstRun: { paddingHorizontal: layout.screenPad - layout.gridPad, gap: spacing.lg },
    link: { alignSelf: 'flex-start' },
    linkText: {
      fontFamily: 'Geist_400Regular',
      fontSize: 16,
      color: colors.text,
    },
    // Marigold on cream is 1.60:1 — fine as a rule, never as the text itself.
    linkRule: {
      marginTop: 3,
      borderBottomWidth: 1.5,
      borderBottomColor: colors.accent,
    },
  });
}
