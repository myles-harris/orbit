const mockUpsertJobScheduler = jest.fn().mockResolvedValue(undefined);

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    upsertJobScheduler: mockUpsertJobScheduler,
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  })),
}));

jest.mock('../services/scheduler', () => ({
  scheduler: {
    generateScheduledCalls: jest.fn().mockResolvedValue(undefined),
    activateDueCalls: jest.fn().mockResolvedValue(undefined),
    closeExpiredCalls: jest.fn().mockResolvedValue(undefined),
  },
}));

import { registerSchedulerJobs } from '../queue/schedulerQueue.js';
import { processJob } from '../worker/scheduler.js';
import { scheduler } from '../services/scheduler.js';

// ─── registerSchedulerJobs ─────────────────────────────────────────────────

describe('registerSchedulerJobs', () => {
  beforeEach(() => {
    mockUpsertJobScheduler.mockClear();
  });

  it('registers all three repeatable jobs', async () => {
    await registerSchedulerJobs();

    expect(mockUpsertJobScheduler).toHaveBeenCalledTimes(3);
    const jobNames = mockUpsertJobScheduler.mock.calls.map(
      ([name]: [string]) => name
    );
    expect(jobNames).toContain('generate-scheduled-calls');
    expect(jobNames).toContain('activate-due-calls');
    expect(jobNames).toContain('close-expired-calls');
  });

  it('calling twice calls upsertJobScheduler 6 times total (idempotent by design in Redis)', async () => {
    await registerSchedulerJobs();
    await registerSchedulerJobs();

    expect(mockUpsertJobScheduler).toHaveBeenCalledTimes(6);
  });

  it('registers activate-due-calls with a 1-minute interval', async () => {
    await registerSchedulerJobs();

    const activateCall = mockUpsertJobScheduler.mock.calls.find(
      ([name]: [string]) => name === 'activate-due-calls'
    );
    expect(activateCall).toBeDefined();
    expect(activateCall[1]).toEqual({ every: 60 * 1000 });
  });

  it('registers generate-scheduled-calls with a 1-hour interval', async () => {
    await registerSchedulerJobs();

    const generateCall = mockUpsertJobScheduler.mock.calls.find(
      ([name]: [string]) => name === 'generate-scheduled-calls'
    );
    expect(generateCall).toBeDefined();
    expect(generateCall[1]).toEqual({ every: 60 * 60 * 1000 });
  });
});

// ─── processJob dispatch ───────────────────────────────────────────────────

describe('processJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls scheduler.generateScheduledCalls for generate-scheduled-calls', async () => {
    await processJob({ name: 'generate-scheduled-calls' } as any);
    expect(scheduler.generateScheduledCalls).toHaveBeenCalledTimes(1);
  });

  it('calls scheduler.activateDueCalls for activate-due-calls', async () => {
    await processJob({ name: 'activate-due-calls' } as any);
    expect(scheduler.activateDueCalls).toHaveBeenCalledTimes(1);
  });

  it('calls scheduler.closeExpiredCalls for close-expired-calls', async () => {
    await processJob({ name: 'close-expired-calls' } as any);
    expect(scheduler.closeExpiredCalls).toHaveBeenCalledTimes(1);
  });

  it('throws on an unknown job name', async () => {
    await expect(
      processJob({ name: 'not-a-real-job' } as any)
    ).rejects.toThrow('Unknown job');
  });
});
