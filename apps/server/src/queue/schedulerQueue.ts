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
  | 'close-expired-calls';

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

  console.log('[scheduler-queue] Repeatable jobs registered');
}
