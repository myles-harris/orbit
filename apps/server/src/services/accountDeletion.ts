import { prisma } from '../db/prisma.js';
import { scheduler } from './scheduler.js';
import { broadcastCallPresence } from './callPresence.js';

export type AccountDeletionResult = { transferredGroups: number; deletedGroups: number };

/**
 * Permanently deletes a user (App Store 5.1.1(v), Google Play account deletion).
 *
 * Group.owner_id and Invite.created_by are ON DELETE RESTRICT (initial_schema), so both
 * are resolved before the user row goes. Everything else keyed on the user cascades or
 * is set null by its FK.
 */
export async function deleteAccount(userId: string): Promise<AccountDeletionResult> {
  // Groups the user owns alone are deleted below. Close their live calls first:
  // closeCall deletes the Daily room and ends Live Activities over the network, which
  // must stay outside the transaction, and the group delete would cascade the call row
  // away before closeCall could read it.
  const soloCalls = await prisma.callSession.findMany({
    where: { status: 'active', group: { owner_id: userId, members: { every: { user_id: userId } } } },
    select: { id: true },
  });
  for (const call of soloCalls) await scheduler.closeCall(call.id);

  // Calls the user is in now, so other participants' counts drop once the user's
  // CallParticipant rows cascade away.
  const openCalls = await prisma.callParticipant.findMany({
    where: { user_id: userId, left_at: null, call: { status: 'active' } },
    select: { call_id: true },
    distinct: ['call_id'],
  });

  const result = await prisma.$transaction(async (tx) => {
    let transferredGroups = 0;
    let deletedGroups = 0;

    const owned = await tx.group.findMany({ where: { owner_id: userId }, select: { id: true } });
    for (const group of owned) {
      // Decided inside the transaction, so a member who joined after the pre-pass
      // inherits the group instead of losing it.
      const successor = await tx.groupMember.findFirst({
        where: { group_id: group.id, user_id: { not: userId } },
        orderBy: [{ joined_at: 'asc' }, { id: 'asc' }],
        select: { id: true, user_id: true },
      });
      if (successor) {
        await tx.group.update({
          where: { id: group.id },
          // An owner uploaded the photo, so it is the user's content shared with others.
          // All three columns change together (group_photo_consistency), as at groups.ts:420.
          data: { owner_id: successor.user_id, photo: null, photo_mime_type: null, photo_updated_at: null },
        });
        await tx.groupMember.update({ where: { id: successor.id }, data: { role: 'owner' } });
        transferredGroups++;
      } else {
        await tx.group.delete({ where: { id: group.id } });
        deletedGroups++;
      }
    }

    // Invites the user created block the delete (RESTRICT) and name them as invited_by.
    // Direct invites addressed to them would survive pointing at no one (SET NULL).
    await tx.invite.deleteMany({
      where: { OR: [{ created_by: userId }, { invited_user_id: userId }] },
    });

    await tx.user.delete({ where: { id: userId } });
    return { transferredGroups, deletedGroups };
  });

  for (const { call_id } of openCalls) broadcastCallPresence(call_id);
  return result;
}
