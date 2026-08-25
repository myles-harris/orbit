/**
 * Runs before each test file.
 * Clears all tables so each test starts with a clean database.
 * Deletion order respects foreign key constraints.
 */

// Provide a parseable (but fake) service account so that when notifications.ts
// loads in tests that mock firebase-admin, it reaches the initializeApp branch.
// Tests that fully mock notifications are unaffected.
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({
    type: 'service_account',
    project_id: 'test-project',
    client_email: 'test@test-project.iam.gserviceaccount.com',
    private_key: '',
  });
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

beforeEach(async () => {
  await prisma.callParticipant.deleteMany();
  await prisma.callSession.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.pushDevice.deleteMany();
  await prisma.group.deleteMany();
  await prisma.user.deleteMany();
});

// callPresence.broadcastCallPresence sets a real 1s debounce timer from five trigger
// sites across the app; clearing it here keeps a stray timer from firing mid-suite
// against a database another test already wiped, and keeps Jest from reporting it as
// an open handle.
//
// Required lazily rather than imported at the top of this file: an eager import here
// would load callPresence.js (and transitively the real notifications.js/apns.js)
// before a test file's own jest.mock('../services/notifications', ...) calls take
// effect, since setupFilesAfterEnv modules execute before the test file's hoisted
// mocks do. That silently replaced the mocked APNs/FCM/Expo senders with the real,
// unconfigured ones in every test file that mocks notifications.
afterEach(() => {
  const { resetCallPresenceState } = require('../services/callPresence.js');
  resetCallPresenceState();
});

afterAll(async () => {
  await prisma.$disconnect();
});
