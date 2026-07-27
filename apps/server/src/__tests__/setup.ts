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

afterAll(async () => {
  await prisma.$disconnect();
});
