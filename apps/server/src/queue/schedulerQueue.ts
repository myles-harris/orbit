import { Queue } from 'bullmq';
import { connection } from './connection.js';

export const schedulerQueue = new Queue('scheduler', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export type SchedulerJobName =
  | 'generate-scheduled-calls'
  | 'activate-due-calls'
  | 'close-expired-calls'
  | 'prune-stale-participants'
  | 'end-live-activities';

/**
 * [fix 2] BullMQ DEDUPLICATES on jobId: re-adding an existing id is silently ignored
 * and the original delay is kept. A scheduled call's ends_at can move
 * (PATCH /:groupId/scheduled/:callId, calls.ts:622), so the old job must be removed
 * before the new one is added or the surface ends at the wrong time.
 */
export async function scheduleLiveActivityEnd(callId: string, endAt: Date) {
  const jobId = `end-la-${callId}`;
  const existing = await schedulerQueue.getJob(jobId);
  if (existing) await existing.remove().catch(() => { /* already ran or gone */ });

  await schedulerQueue.add(
    'end-live-activities',
    { callId },
    { delay: Math.max(0, endAt.getTime() - Date.now()), jobId, removeOnComplete: true },
  );
}

export async function registerSchedulerJobs() {
  await schedulerQueue.upsertJobScheduler(
    'generate-scheduled-calls',
    { every: 60 * 60 * 1000 },
    { name: 'generate-scheduled-calls' }
  );

  await schedulerQueue.upsertJobScheduler(
    'activate-due-calls',
    { every: 60 * 1000 },
    { name: 'activate-due-calls' }
  );

  await schedulerQueue.upsertJobScheduler(
    'close-expired-calls',
    { every: 60 * 1000 },
    { name: 'close-expired-calls' }
  );

  await schedulerQueue.upsertJobScheduler(
    'prune-stale-participants',
    { every: 30 * 1000 },
    { name: 'prune-stale-participants' }
  );

  console.log('[scheduler-queue] Repeatable jobs registered');
}
