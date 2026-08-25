import { Worker, Job } from 'bullmq';
import { connection } from '../queue/connection.js';
import { registerSchedulerJobs } from '../queue/schedulerQueue.js';
import { scheduler } from '../services/scheduler.js';
import { endLiveActivitiesForCall } from '../services/callPresence.js';

const rawSchedulerFlag = process.env.SCHEDULER_ENABLED;
if (rawSchedulerFlag !== 'true' && rawSchedulerFlag !== 'false') {
  const msg =
    `SCHEDULER_ENABLED must be exactly "true" or "false" (got ${JSON.stringify(rawSchedulerFlag)}). ` +
    'Unset means no scheduled calls activate and no Live Activity end jobs run.';
  // Matches util/env.ts's PRODUCTION_REQUIRED policy for this same variable: fatal
  // in production, a loud warning everywhere else. A hard crash in every environment
  // (including a fresh non-production Railway service or a local run) would fire
  // during module evaluation, before validateEnv() or the uncaughtException handler
  // in index.ts even run.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(msg);
  }
  console.warn(`[scheduler-worker] ${msg}`);
}
const SCHEDULER_ENABLED = rawSchedulerFlag === 'true';

export let workerReady = false;

let worker: Worker | null = null;
export async function stopSchedulerWorker(): Promise<void> {
  if (worker) { await worker.close(); worker = null; }
}

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

    worker = new Worker('scheduler', processJob, {
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

    workerReady = true;
    console.log('[scheduler-worker] Started successfully');
  })();
} else {
  console.log('[scheduler-worker] Disabled');
}
