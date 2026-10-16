/**
 * Deletes one account for a request received by email (privacy policy, "Deleting your
 * account without the app"). Confirm the request by text to the account's number first.
 * Both values come from the email; a mismatch deletes nothing, so a typo in the phone
 * number cannot delete someone else's account.
 * Run inside the deployed server container:
 *   railway ssh
 *   node apps/server/dist/scripts/deleteAccount.js +15551234567 their_username
 */
import '../util/loadDotenv.js';
import { prisma } from '../db/prisma.js';
import { schedulerQueue } from '../queue/schedulerQueue.js';
import { deleteAccount } from '../services/accountDeletion.js';

const [phone = '', username = ''] = process.argv.slice(2);
if (!/^\+[1-9]\d{6,14}$/.test(phone) || !username) {
  console.error('Usage: node apps/server/dist/scripts/deleteAccount.js <E.164 phone> <username>');
  process.exit(1);
}

try {
  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true, username: true } });
  if (!user || user.username !== username) {
    console.error('No account matches that phone number and username. Nothing was deleted.');
    process.exitCode = 1;
  } else {
    const { transferredGroups, deletedGroups } = await deleteAccount(user.id);
    console.log(`Deleted user ${user.id}: transferred ${transferredGroups} group(s), deleted ${deletedGroups} group(s)`);
  }
} finally {
  await schedulerQueue.close();
  await prisma.$disconnect();
}
// Presence debounce timers would otherwise hold the process open. Counts self-correct
// on the next change, and the orphan reaper closes any emptied spontaneous call.
process.exit();
