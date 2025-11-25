import jwt from 'jsonwebtoken';
import db from '../db.js';
import { buildUserPayload } from '../utils/auth.js';

function extractToken(req) {
  const header = req.headers['authorization'] || '';
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7);
  }
  const queryToken = typeof req.query?.token === 'string' ? req.query.token.trim() : null;
  if (queryToken) return queryToken;
  if (req.body && typeof req.body.token === 'string') {
    const bodyToken = req.body.token.trim();
    if (bodyToken) return bodyToken;
  }
  return null;
}

export function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Yetkisiz' });
  try {
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not set in environment variables!');
      return res.status(500).json({ error: 'Sunucu yapılandırma hatası', detail: 'JWT_SECRET tanımlı değil' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const row = db.prepare('SELECT * FROM users WHERE id=?').get(decoded.id);
    if (!row) return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
    if (!row.is_active) return res.status(403).json({ error: 'Hesap pasif durumda' });
    req.user = buildUserPayload(row);
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    console.error('Auth middleware error - name:', err.name);
    console.error('Auth middleware error - message:', err.message);
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token geçersiz veya süresi dolmuş', detail: err.message });
    }
    return res.status(401).json({ error: 'Token geçersiz', detail: err.message });
  }
}

export function requireRole(...roles) {
  const allowed = roles.flat().filter(Boolean);
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Yetkisiz' });
    if (allowed.length && !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Yasaklı' });
    }
    next();
  };
}
