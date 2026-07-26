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
    const query = (req.query.q as string)?.trim();
    const groupId = req.query.groupId as string | undefined;

    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const whereClause: any = {
      username: {
        contains: query,
        mode: 'insensitive'
      },
      NOT: { id: userId }
    };

    const users = await prisma.user.findMany({
      where: whereClause,
      select: { id: true, username: true, avatar: true },
      take: 10,
      orderBy: { username: 'asc' }
    });

    // Attach group membership/invite status if groupId provided
    let memberIds = new Set<string>();
    let invitedUserIds = new Set<string>();

    if (groupId) {
      // WS-4: verify caller is a member before exposing group roster
      const callerMembership = await prisma.groupMember.findFirst({
        where: { group_id: groupId, user_id: userId },
      });
      if (!callerMembership) {
        return res.status(403).json({ error: 'You are not a member of this group' });
      }

      const [members, pendingInvites] = await Promise.all([
        prisma.groupMember.findMany({
          where: { group_id: groupId },
          select: { user_id: true }
        }),
        prisma.invite.findMany({
          where: { group_id: groupId, status: 'pending', invited_user_id: { not: null } },
          select: { invited_user_id: true }
        })
      ]);
      memberIds = new Set(members.map(m => m.user_id));
      invitedUserIds = new Set(
        pendingInvites.map(i => i.invited_user_id).filter((id): id is string => id !== null)
      );
    }

    const usersWithStatus = users.map(u => ({
      id: u.id,
      username: u.username,
      has_avatar: u.avatar !== null,
      status: memberIds.has(u.id) ? 'member' : invitedUserIds.has(u.id) ? 'invited' : null,
    }));

    res.json({ users: usersWithStatus });
  } catch (error) {
    console.error('[user-search] Error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

router.get('/:userId/avatar', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { avatar: true, avatar_mime_type: true },
    });
    if (!user?.avatar) return res.status(404).end();
    res.setHeader('Content-Type', user.avatar_mime_type ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(user.avatar);
  } catch (error) {
    console.error('[GET /users/:userId/avatar] Error:', error);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

export default router;
