import { validateEnv } from '../util/env.js';

const ENV_KEYS = [
  'JWT_SECRET', 'REFRESH_TOKEN_SECRET',
  'DATABASE_URL', 'REDIS_URL', 'DAILY_API_KEY', 'ADMIN_TOKEN', 'SCHEDULER_ENABLED',
  'NODE_ENV',
] as const;

describe('validateEnv', () => {
  const saved: Partial<Record<typeof ENV_KEYS[number], string | undefined>> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('throws when JWT_SECRET is absent', () => {
    delete process.env.JWT_SECRET;
    expect(() => validateEnv()).toThrow(/JWT_SECRET/);
  });

  it('throws when REFRESH_TOKEN_SECRET is absent', () => {
    delete process.env.REFRESH_TOKEN_SECRET;
    expect(() => validateEnv()).toThrow(/REFRESH_TOKEN_SECRET/);
  });

  it('throws on a missing production-required var only when NODE_ENV=production', () => {
    process.env.JWT_SECRET = 'x';
    process.env.REFRESH_TOKEN_SECRET = 'y';
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = 'production';

    expect(() => validateEnv()).toThrow(/Missing required production environment variable/);
  });

  it('warns instead of throwing when NODE_ENV is not production', () => {
    process.env.JWT_SECRET = 'x';
    process.env.REFRESH_TOKEN_SECRET = 'y';
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = 'development';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => validateEnv()).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
