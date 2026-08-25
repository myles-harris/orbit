const mockUpsertJobScheduler = jest.fn().mockResolvedValue(undefined);
const mockAdd = jest.fn().mockResolvedValue(undefined);
const mockGetJob = jest.fn().mockResolvedValue(null);
const mockJobRemove = jest.fn().mockResolvedValue(undefined);

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    upsertJobScheduler: mockUpsertJobScheduler,
    add: mockAdd,
    getJob: mockGetJob,
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
    pruneStaleParticipants: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockEndLiveActivitiesForCall = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/callPresence', () => ({
  endLiveActivitiesForCall: (...args: any[]) => mockEndLiveActivitiesForCall(...args),
  // setup.ts's afterEach requires this module directly to clear pending debounce
  // timers between tests; a mock that omits it breaks every test in this file.
  resetCallPresenceState: jest.fn(),
}));

import { registerSchedulerJobs, scheduleLiveActivityEnd } from '../queue/schedulerQueue.js';
import { processJob } from '../worker/scheduler.js';
import { scheduler } from '../services/scheduler.js';

// ─── registerSchedulerJobs ─────────────────────────────────────────────────

describe('registerSchedulerJobs', () => {
  beforeEach(() => {
    mockUpsertJobScheduler.mockClear();
  });

  it('registers all four repeatable jobs', async () => {
    await registerSchedulerJobs();

    expect(mockUpsertJobScheduler).toHaveBeenCalledTimes(4);
    const jobNames = mockUpsertJobScheduler.mock.calls.map(
      ([name]: [string]) => name
    );
    expect(jobNames).toContain('generate-scheduled-calls');
    expect(jobNames).toContain('activate-due-calls');
    expect(jobNames).toContain('close-expired-calls');
    expect(jobNames).toContain('prune-stale-participants');
  });

  it('calling twice calls upsertJobScheduler 8 times total (idempotent by design in Redis)', async () => {
    await registerSchedulerJobs();
    await registerSchedulerJobs();

    expect(mockUpsertJobScheduler).toHaveBeenCalledTimes(8);
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

  it('registers prune-stale-participants with a 30-second interval', async () => {
    await registerSchedulerJobs();

    const pruneCall = mockUpsertJobScheduler.mock.calls.find(
      ([name]: [string]) => name === 'prune-stale-participants'
    );
    expect(pruneCall).toBeDefined();
    expect(pruneCall[1]).toEqual({ every: 30 * 1000 });
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

  it('calls scheduler.pruneStaleParticipants for prune-stale-participants', async () => {
    await processJob({ name: 'prune-stale-participants' } as any);
    expect(scheduler.pruneStaleParticipants).toHaveBeenCalledTimes(1);
  });

  it('calls endLiveActivitiesForCall for end-live-activities', async () => {
    await processJob({ name: 'end-live-activities', data: { callId: 'call-1' } } as any);
    expect(mockEndLiveActivitiesForCall).toHaveBeenCalledWith('call-1');
  });

  it('throws on an unknown job name', async () => {
    await expect(
      processJob({ name: 'not-a-real-job' } as any)
    ).rejects.toThrow('Unknown job');
  });
});

// ─── scheduleLiveActivityEnd ────────────────────────────────────────────────

describe('scheduleLiveActivityEnd', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetJob.mockResolvedValue(null);
  });

  it('adds an end-live-activities job with delay approximately endAt - now', async () => {
    const endAt = new Date(Date.now() + 60_000);
    await scheduleLiveActivityEnd('call-a', endAt);

    expect(mockAdd).toHaveBeenCalledTimes(1);
    const [name, data, opts] = mockAdd.mock.calls[0];
    expect(name).toBe('end-live-activities');
    expect(data).toEqual({ callId: 'call-a' });
    expect(opts.jobId).toBe('end-la-call-a');
    expect(opts.delay).toBeGreaterThan(55_000);
    expect(opts.delay).toBeLessThanOrEqual(60_000);
  });

  it('clamps delay to 0 for an endAt already in the past', async () => {
    await scheduleLiveActivityEnd('call-b', new Date(Date.now() - 5_000));

    const [, , opts] = mockAdd.mock.calls[0];
    expect(opts.delay).toBe(0);
  });

  it('[fix 2] removes the existing job before adding the new one when rescheduling', async () => {
    mockGetJob.mockResolvedValueOnce({ remove: mockJobRemove });

    await scheduleLiveActivityEnd('call-c', new Date(Date.now() + 30_000));

    expect(mockGetJob).toHaveBeenCalledWith('end-la-call-c');
    expect(mockJobRemove).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const [, , opts] = mockAdd.mock.calls[0];
    expect(opts.delay).toBeGreaterThan(25_000);
  });

  it('does not throw when the existing job is already gone', async () => {
    mockGetJob.mockResolvedValueOnce({ remove: jest.fn().mockRejectedValue(new Error('gone')) });

    await expect(
      scheduleLiveActivityEnd('call-d', new Date(Date.now() + 10_000)),
    ).resolves.toBeUndefined();
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });
});
