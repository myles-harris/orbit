import express from 'express';
import { requireJwt } from '../util/requireJwt.js';
import { prisma } from '../db/prisma.js';

const router = express.Router();

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
      select: { id: true, username: true, avatar_updated_at: true },
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
      has_avatar: u.avatar_updated_at !== null,
      avatar_updated_at: u.avatar_updated_at?.toISOString() ?? null,
      status: memberIds.has(u.id) ? 'member' : invitedUserIds.has(u.id) ? 'invited' : null,
    }));

    res.json({ users: usersWithStatus });
  } catch (error) {
    console.error('[user-search] Error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// A versioned URL (?v=<avatar_updated_at ms>) is content-addressed: it changes whenever
// the image changes, so it can be cached indefinitely. Clients on builds that predate
// versioned URLs revalidate quickly instead of holding a day-old copy.
const AVATAR_CACHE_IMMUTABLE = 'private, max-age=31536000, immutable';
const AVATAR_CACHE_REVALIDATE = 'private, max-age=60';

router.get('/:userId/avatar', async (req, res) => {
  try {
    // Metadata only — never touches the BYTEA, so conditional requests (the common
    // case) are answered without detoasting the blob.
    const meta = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { avatar_mime_type: true, avatar_updated_at: true },
    });
    if (!meta?.avatar_updated_at) return res.status(404).end();

    const etag = `"${meta.avatar_updated_at.getTime()}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', req.query.v ? AVATAR_CACHE_IMMUTABLE : AVATAR_CACHE_REVALIDATE);

    if (req.headers['if-none-match'] === etag) return res.status(304).end();

    const blob = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { avatar: true },
    });
    if (!blob?.avatar) return res.status(404).end();

    res.setHeader('Content-Type', meta.avatar_mime_type ?? 'application/octet-stream');
    res.end(blob.avatar);
  } catch (error) {
    console.error('[GET /users/:userId/avatar] Error:', error);
    res.status(500).json({ error: 'internal_server_error' });
  }
});

export default router;
