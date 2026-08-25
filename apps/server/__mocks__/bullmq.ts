/**
 * Automatic mock for the whole 'bullmq' package (Jest convention: a file at
 * <rootDir>/__mocks__/<node_module_name> is applied to every test file with no
 * jest.mock() call needed). Without this, importing anything that pulls in
 * queue/schedulerQueue.ts — now routes/calls.ts and services/scheduler.ts, via
 * scheduleLiveActivityEnd — opens a REAL ioredis connection to the dev Redis
 * instance and writes real delayed jobs into the "scheduler" queue on every
 * test run. queue.test.ts additionally declares its own local jest.mock('bullmq', ...)
 * for finer control; an explicit per-file mock always wins over this one.
 */
export class Queue {
  add = jest.fn().mockResolvedValue(undefined);
  getJob = jest.fn().mockResolvedValue(null);
  upsertJobScheduler = jest.fn().mockResolvedValue(undefined);
}

export class Worker {
  on = jest.fn();
}
