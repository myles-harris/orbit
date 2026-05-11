import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma.js';

export function requireJwt(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  console.log('[requireJwt] Auth check:', {
    path: req.path,
    method: req.method,
    hasHeader: !!header,
    headerPreview: header ? `${header.substring(0, 30)}...` : 'null',
  });

  if (!header) {
    console.error('[requireJwt] Missing authorization header');
    return res.status(401).json({ error: 'missing_auth' });
  }

  const token = header.replace('Bearer ', '');

  console.log('[requireJwt] Token extracted:', {
    tokenPreview: `${token.substring(0, 20)}...`,
    jwtSecret: process.env.JWT_SECRET ? 'set' : 'using default "dev"',
  });

  let userId: string;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev');
    userId = (decoded as any).sub;
    console.log('[requireJwt] Token verified successfully:', { userId });
  } catch (error) {
    console.error('[requireJwt] Token verification failed:', error);
    return res.status(401).json({ error: 'invalid_token' });
  }

  prisma.user.findUnique({ where: { id: userId }, select: { id: true } }).then((user) => {
    if (!user) {
      console.error('[requireJwt] User not found:', userId);
      return res.status(401).json({ error: 'user_not_found' });
    }
    (req as any).userId = userId;
    next();
  }).catch((error) => {
    console.error('[requireJwt] DB error:', error);
    return res.status(500).json({ error: 'internal_server_error' });
  });
}

