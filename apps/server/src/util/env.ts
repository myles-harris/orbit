/**
 * Fatal everywhere, including dev and test. These have insecure literal fallbacks
 * at their call sites; an unset value is an authentication bypass, not a degradation.
 * CI sets both (.github/workflows/ci.yml:39-40), as does apps/server/.env.test.
 */
const ALWAYS_REQUIRED = ['JWT_SECRET', 'REFRESH_TOKEN_SECRET'] as const;

/**
 * Fatal in production only; a missing value here degrades the product silently
 * rather than opening a hole. Warned about loudly in every other environment.
 */
const PRODUCTION_REQUIRED = [
  'DATABASE_URL',
  'REDIS_URL',
  'DAILY_API_KEY',
  'ADMIN_TOKEN',
  'SCHEDULER_ENABLED',
] as const;

export function validateEnv(): void {
  const missingAlways = ALWAYS_REQUIRED.filter(k => !process.env[k]);
  if (missingAlways.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missingAlways.join(', ')}. ` +
      'These are JWT signing secrets — running without them would sign tokens with a ' +
      'publicly-known literal and allow anyone to forge a session for any user.',
    );
  }

  const missingProd = PRODUCTION_REQUIRED.filter(k => !process.env[k]);
  if (missingProd.length === 0) return;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required production environment variable(s): ${missingProd.join(', ')}`);
  }
  // NODE_ENV may simply be unset in production, so never rely on the throw alone.
  console.warn(
    `[env] NOT SET: ${missingProd.join(', ')} — ` +
    `NODE_ENV=${JSON.stringify(process.env.NODE_ENV)}. If this is production, the ` +
    'affected subsystems are running in stub mode and the product is silently broken.',
  );
}

export const JWT_SECRET = process.env.JWT_SECRET!;
export const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET!;
