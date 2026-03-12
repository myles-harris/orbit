import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireJwt } from '../util/requireJwt.js';

const router = express.Router();
const prisma = new PrismaClient();

router.use(requireJwt);

// Search users by username
router.get('/search', async (req, res) => {
  try {
    const userId = (req as any).userId as string;
    const query = req.query.q as string;
    const groupId = req.query.groupId as string | undefined;

    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    // Build where clause to exclude current user
    let whereClause: any = {
      username: {
        contains: query,
        mode: 'insensitive'
      },
      NOT: {
        id: userId
      }
    };

    // If groupId provided, exclude users who are already members or have pending invites
    if (groupId) {
      // Get existing member IDs
      const existingMembers = await prisma.groupMember.findMany({
        where: { group_id: groupId },
        select: { user_id: true }
      });
      const memberIds = existingMembers.map(m => m.user_id);

      // Get users with pending invites
      const pendingInvites = await prisma.invite.findMany({
        where: {
          group_id: groupId,
          status: 'pending',
          invited_user_id: { not: null }
        },
        select: { invited_user_id: true }
      });
      const invitedUserIds = pendingInvites
        .map(i => i.invited_user_id)
        .filter((id): id is string => id !== null);

      // Combine exclusions
      const excludedIds = [...memberIds, ...invitedUserIds, userId];

      whereClause.NOT = {
        id: { in: excludedIds }
      };
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        username: true
      },
      take: 10,
      orderBy: {
        username: 'asc'
      }
    });

    res.json({ users });
  } catch (error) {
    console.error('[user-search] Error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

export default router;
