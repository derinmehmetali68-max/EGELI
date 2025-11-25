import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const ACCESS_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET || process.env.JWT_SECRET;
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL = process.env.REFRESH_TOKEN_TTL || '7d';

function ttlToSeconds(ttl) {
  if (typeof ttl === 'number') return ttl;
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 60 * 60 * 24;
    default: return 0;
  }
}

export function secondsFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function buildUserPayload(row = {}) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    branch_id: row.branch_id ?? null,
    display_name: row.display_name ?? null,
    theme_preference: row.theme_preference ?? 'system',
    is_active: row.is_active !== undefined ? !!row.is_active : true,
  };
}

export function signAccessToken(user) {
  if (!ACCESS_SECRET) throw new Error('JWT_SECRET is not configured');
  const payload = buildUserPayload(user);
  const expiresIn = ACCESS_TOKEN_TTL;
  return {
    token: jwt.sign(payload, ACCESS_SECRET, { expiresIn }),
    expires_at: secondsFromNow(ttlToSeconds(expiresIn)),
  };
}

export function signRefreshToken(sessionId, userId) {
  if (!REFRESH_SECRET) throw new Error('REFRESH_SECRET is not configured');
  const payload = { sid: sessionId, uid: userId };
  const expiresIn = REFRESH_TOKEN_TTL;
  return {
    token: jwt.sign(payload, REFRESH_SECRET, { expiresIn }),
    expires_at: secondsFromNow(ttlToSeconds(expiresIn)),
  };
}

export function verifyRefreshToken(token) {
  if (!REFRESH_SECRET) throw new Error('REFRESH_SECRET is not configured');
  return jwt.verify(token, REFRESH_SECRET);
}

export async function hashToken(token) {
  return bcrypt.hash(token, 10);
}

export async function compareToken(token, hash) {
  return bcrypt.compare(token, hash);
}

export function createSessionId() {
  return crypto.randomUUID();
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export const TOKEN_CONFIG = {
  accessTtlSeconds: ttlToSeconds(ACCESS_TOKEN_TTL),
  refreshTtlSeconds: ttlToSeconds(REFRESH_TOKEN_TTL),
};
