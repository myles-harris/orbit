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
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.test') });

const { execSync } = require('child_process');

module.exports = async function globalSetup() {
  const dbUrl = process.env.DATABASE_URL || '';

  // Extract the database name from the connection string and enforce a
  // naming convention that makes it impossible to accidentally wipe prod.
  const match = dbUrl.match(/\/([^/?]+)(\?|$)/);
  const dbName = match ? match[1].toLowerCase() : '';

  // Name alone is not enough: Railway names every database "railway", in every
  // environment, so a name check cannot distinguish prod from dev there. Require
  // the host to be local or an explicitly-marked test instance as well.
  const host = (dbUrl.match(/@([^:/?]+)/) || [])[1] || '';
  const isSafeHost =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.test') ||
    /(^|[._-])test([._-]|$)/.test(host);

  if (!isSafeHost) {
    throw new Error(
      `\n\n🚨  TEST SAFETY ABORT 🚨\n` +
      `DATABASE_URL host is "${host}", which is not local or a marked test host.\n` +
      `This suite truncates every table in beforeEach. Point it at a local\n` +
      `Postgres (see apps/server/.env.test) before running.\n`
    );
  }

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
      `  1. Start a local Postgres:\n` +
      `       docker run -d --name orbit-test -e POSTGRES_PASSWORD=test \\\n` +
      `         -p 5433:5432 postgres:16\n` +
      `  2. Create apps/server/.env.test with:\n` +
      `       DATABASE_URL="postgresql://postgres:test@localhost:5433/postgres"\n` +
      `  3. Run: npm test -w apps/server\n` +
      `     (.env.test is loaded automatically; NODE_ENV is not consulted.)\n\n` +
      `NEVER run tests against a production or staging database.\n`
    );
  }

  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env },
  });
};
