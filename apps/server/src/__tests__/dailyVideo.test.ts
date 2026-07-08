/**
 * Unit tests for dailyVideo service.
 * Uses jest.resetModules + dynamic import to control DAILY_API_KEY at module load time,
 * which is captured as a const and cannot be changed via process.env after load.
 */

describe('dailyVideo.createRoom (idempotent)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
    delete process.env.DAILY_API_KEY;
  });

  it('on 400 + "already exists", fetches existing room and returns its URL', async () => {
    process.env.DAILY_API_KEY = 'test_key';
    jest.resetModules();
    const { dailyVideo } = await import('../services/dailyVideo.js');

    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue('room with that name already exists'),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ url: 'https://test.daily.co/existing-room' }),
      } as any);

    const url = await dailyVideo.createRoom('existing-room');
    expect(url).toBe('https://test.daily.co/existing-room');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws when 400 + "already exists" but the subsequent GET also fails', async () => {
    process.env.DAILY_API_KEY = 'test_key';
    jest.resetModules();
    const { dailyVideo } = await import('../services/dailyVideo.js');

    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue('room with that name already exists'),
      } as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as any);

    await expect(dailyVideo.createRoom('missing-room')).rejects.toThrow('Failed to create video room');
  });
});
