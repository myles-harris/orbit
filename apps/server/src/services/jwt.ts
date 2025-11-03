import jwt from 'jsonwebtoken';

const ACCESS_TTL = Number(process.env.JWT_EXPIRES_IN || 900); // seconds
const REFRESH_TTL = Number(process.env.REFRESH_TOKEN_EXPIRES_IN || 60 * 60 * 24 * 30);

export function issueAccessAndRefreshTokens(payload: { userId: string }) {
  const access = jwt.sign({}, process.env.JWT_SECRET || 'dev', { subject: payload.userId, expiresIn: ACCESS_TTL });
  const refresh = jwt.sign({ type: 'refresh' }, process.env.REFRESH_TOKEN_SECRET || 'dev_refresh', { subject: payload.userId, expiresIn: REFRESH_TTL });
  return { access_token: access, expires_in: ACCESS_TTL, refresh_token: refresh };
}

