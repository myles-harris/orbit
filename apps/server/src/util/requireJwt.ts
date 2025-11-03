import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export function requireJwt(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'missing_auth' });
  const token = header.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev');
    (req as any).userId = (decoded as any).sub;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

