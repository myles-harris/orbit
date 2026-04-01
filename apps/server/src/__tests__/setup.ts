/**
 * Runs before each test file.
 * Clears all tables so each test starts with a clean database.
 * Deletion order respects foreign key constraints.
 */
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
