/**
 * Runs once before all test suites.
 * Ensures the test database schema is up to date by running pending migrations.
 */
const { execSync } = require('child_process');

module.exports = async function globalSetup() {
  execSync('npx prisma migrate deploy', {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env },
  });
};
