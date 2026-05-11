# Backend Testing Guide

## ⚠️  Critical Safety Rules

**Tests WILL destroy all data in the target database.**

Every test run truncates every table in the database before each test via
`beforeEach` in `src/__tests__/setup.ts`. This is intentional — it ensures a
clean slate for each test case. It also means:

1. **Never run tests against a production database.**
2. **Never run tests against a staging database.**
3. **Never point `DATABASE_URL` at any database that holds real data.**

Violating these rules will result in **permanent, unrecoverable data loss**.

## Safe Test Database Setup

Create a dedicated local test database and set its URL in `.env`:

```bash
# In .env (or .env.test)
DATABASE_URL="postgresql://postgres:password@localhost:5432/orbit_dev"
#                                                                ^^^^^^^^
#                            Database name MUST contain one of:
#                            test | dev | local | ci
```

The test runner enforces this naming convention. If `DATABASE_URL` points to a
database whose name does not contain `test`, `dev`, `local`, or `ci`, the test
run will **abort immediately** with an error before touching any data.

## Running Tests

```bash
# From apps/server/
npm test                        # Run all tests once
npm run test:watch              # Watch mode
npm run test:coverage           # With coverage report

# Run a specific test file
npm test -- --testPathPattern="api.test"
```

## Test Infrastructure

| File | Purpose |
|------|---------|
| `src/__tests__/globalSetup.cjs` | Runs once before all suites. Checks DB safety and runs `prisma migrate deploy`. |
| `src/__tests__/setup.ts` | Runs `beforeEach` test. Truncates all tables to ensure a clean state. |
| `src/__tests__/helpers/auth.ts` | Creates test users and JWTs without going through the real auth flow (no Twilio calls). |

## Mocked External Services

All tests mock the following services — no real API calls are made during testing:

- **`dailyVideo`** — Daily.co video rooms (create, exists, token, delete)
- **`notifications`** — Push notifications (APNs, FCM, Expo)
- **`twilioVerify`** — OTP request and verification
- **`scheduler`** — Scheduled call generation

## Test Suite

`src/__tests__/api.test.ts` is the comprehensive end-to-end suite covering all
HTTP endpoints across every router:

- `GET /health`
- `/auth/*` — OTP flow, signup, token refresh
- `/me/*` — Profile, push devices, invitations
- `/users/*` — User search
- `/groups/*` — CRUD, mute, invite codes, join/leave, member management, ownership transfer
- `/groups/invites/*` — Invite info, respond (accept/decline/dismiss)
- `/groups/:id/call-now`, `/calls/*` — Spontaneous and scheduled calls
- `/svc/*` — Internal service endpoints

## What NOT To Do

```bash
# ❌ NEVER do any of the following:
DATABASE_URL=postgresql://...production... npm test
npx prisma db execute ... TRUNCATE ... CASCADE   # against any shared DB
npx prisma migrate reset                          # against any shared DB
```

If you need to recover from a stale test DB state (e.g. after an interrupted
test run left orphaned rows), run the following **only against your local dev DB**:

```bash
# Only on your local dev database — confirm the DB name before running
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.\$executeRawUnsafe('TRUNCATE TABLE \"CallParticipant\", \"CallSession\", \"Invite\", \"GroupMember\", \"PushDevice\", \"Group\", \"User\" CASCADE')
  .then(() => { console.log('Cleaned'); p.\$disconnect(); });
"
```
