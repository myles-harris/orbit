import { Worker, Job } from 'bullmq';
import { connection } from '../queue/connection.js';
import { registerSchedulerJobs } from '../queue/schedulerQueue.js';
import { scheduler } from '../services/scheduler.js';
import { endLiveActivitiesForCall } from '../services/callPresence.js';

const SCHEDULER_ENABLED = process.env.SCHEDULER_ENABLED === 'true';

export async function processJob(job: Job) {
  switch (job.name) {
    case 'generate-scheduled-calls':
      return scheduler.generateScheduledCalls();
    case 'activate-due-calls':
      return scheduler.activateDueCalls();
    case 'close-expired-calls':
      return scheduler.closeExpiredCalls();
    case 'prune-stale-participants':
      return scheduler.pruneStaleParticipants();
    case 'end-live-activities':
      return endLiveActivitiesForCall(job.data.callId as string);
    default:
      throw new Error(`[scheduler-worker] Unknown job: ${job.name}`);
  }
}

if (SCHEDULER_ENABLED) {
  void (async () => {
    console.log('[scheduler-worker] Starting...');

    const worker = new Worker('scheduler', processJob, {
      connection,
      concurrency: 1,
    });

    worker.on('completed', (job) => {
      console.log(`[scheduler-worker] ${job.name} completed`);
    });

    worker.on('failed', (job, err) => {
      console.error(`[scheduler-worker] ${job?.name} failed:`, err);
    });

    await registerSchedulerJobs();

    console.log('[scheduler-worker] Started successfully');
  })();
} else {
  console.log('[scheduler-worker] Disabled');
}
