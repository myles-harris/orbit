/**
 * Runs once before all test suites.
 * Ensures the test database schema is up to date by running pending migrations.
 *
 * ⚠️  SAFETY GUARD: Tests MUST NOT run against a production database.
 *     The DATABASE_URL must reference a database whose name contains "test",
 *     "dev", or "local". If it does not, this setup will abort immediately.
 *
 * Never point DATABASE_URL at a production database when running tests.
 * Tests truncate every table in beforeEach — all data will be destroyed.
 */
const { execSync } = require('child_process');

module.exports = async function globalSetup() {
  const dbUrl = process.env.DATABASE_URL || '';

  // Extract the database name from the connection string and enforce a
  // naming convention that makes it impossible to accidentally wipe prod.
  const match = dbUrl.match(/\/([^/?]+)(\?|$)/);
  const dbName = match ? match[1].toLowerCase() : '';

  const isSafeDb =
    dbName.includes('test') ||
    dbName.includes('dev') ||
    dbName.includes('local') ||
    dbName.includes('ci');

  if (!isSafeDb) {
    throw new Error(
      `\n\n🚨  TEST SAFETY ABORT 🚨\n` +
      `Tests are configured to DELETE ALL DATA in the target database on every\n` +
      `test run (via beforeEach truncation). The current DATABASE_URL points to\n` +
      `a database named "${dbName || '(unknown)'}" which does not look like a safe\n` +
      `test/dev/local/ci database.\n\n` +
      `To fix this:\n` +
      `  1. Create a dedicated test database (e.g. orbit_test or orbit_dev).\n` +
      `  2. Set DATABASE_URL in .env.test to point at that database.\n` +
      `  3. Run tests with: NODE_ENV=test npm test\n\n` +
      `NEVER run tests against a production or staging database.\n`
    );
  }

  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env },
  });
};
