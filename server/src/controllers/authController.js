import db from '../db.js';
import dayjs from 'dayjs';
import {
  buildUserPayload,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  verifyPassword,
  hashPassword,
  hashToken,
  compareToken,
  createSessionId,
} from '../utils/auth.js';

const selectUserByEmail = db.prepare('SELECT * FROM users WHERE email=?');
const selectUserById = db.prepare('SELECT * FROM users WHERE id=?');
const countUsersStmt = db.prepare('SELECT COUNT(*) AS c FROM users');
const insertUserStmt = db.prepare(`INSERT INTO users(email,password_hash,role,branch_id,display_name,theme_preference,is_active,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`);
const updateUserProfileStmt = db.prepare(`UPDATE users SET display_name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`);
const updateUserPasswordStmt = db.prepare(`UPDATE users SET password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`);
const updateThemeStmt = db.prepare(`UPDATE users SET theme_preference=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`);
const insertSessionStmt = db.prepare('INSERT INTO user_sessions(id,user_id,refresh_token_hash,ip,user_agent,expires_at) VALUES (?,?,?,?,?,?)');
const updateSessionStmt = db.prepare('UPDATE user_sessions SET refresh_token_hash=?, updated_at=?, expires_at=?, revoked_at=NULL WHERE id=?');
const getSessionStmt = db.prepare('SELECT * FROM user_sessions WHERE id=?');
const revokeSessionStmt = db.prepare('UPDATE user_sessions SET revoked_at=?, updated_at=? WHERE id=?');
const selectBranchStmt = db.prepare('SELECT id FROM branches WHERE id=?');
const insertAuditStmt = db.prepare('INSERT INTO audit_logs(actor_email,action,meta) VALUES (?,?,?)');

function ipFromRequest(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length) {
    return forwarded[0];
  }
  return req.ip || null;
}

function logAction(action, req, meta = {}, user) {
  try {
    const actorEmail = user?.email || req.user?.email || req.body?.email || 'anonymous';
    insertAuditStmt.run(actorEmail, action, JSON.stringify({ ...meta, ip: ipFromRequest(req) }));
  } catch (err) {
    console.error('[audit]', err.message);
  }
}

async function createSessionForUser(userRow, req, existingSessionId = null) {
  const sessionId = existingSessionId || createSessionId();
  const { token: refreshToken, refreshExpiresAt } = (() => {
    const signed = signRefreshToken(sessionId, userRow.id);
    return { token: signed.token, refreshExpiresAt: signed.expires_at };
  })();

  const refreshHash = await hashToken(refreshToken);
  const now = new Date().toISOString();
  if (existingSessionId) {
    updateSessionStmt.run(refreshHash, now, refreshExpiresAt, sessionId);
  } else {
    insertSessionStmt.run(
      sessionId,
      userRow.id,
      refreshHash,
      ipFromRequest(req),
      req.headers['user-agent'] || null,
      refreshExpiresAt
    );
  }
  const access = signAccessToken(userRow);
  return {
    user: buildUserPayload(userRow),
    access_token: access.token,
    access_expires_at: access.expires_at,
    refresh_token: refreshToken,
    refresh_expires_at: refreshExpiresAt,
  };
}

function sanitizeEmail(email = '') {
  return String(email).trim().toLowerCase();
}

function ensureBranch(branchId) {
  if (branchId === undefined || branchId === null || branchId === '') return null;
  const row = selectBranchStmt.get(branchId);
  if (!row) throw Object.assign(new Error('Şube bulunamadı'), { status: 422 });
  return row.id;
}

export async function register(req, res) {
  try {
    const { email, password, display_name, branch_id } = req.body || {};
    if (!email || !password) return res.status(422).json({ error: 'Email ve şifre zorunlu' });
    const normalizedEmail = sanitizeEmail(email);
    if (selectUserByEmail.get(normalizedEmail)) {
      return res.status(409).json({ error: 'Email kullanılıyor' });
    }
    const branchId = ensureBranch(branch_id);
    const role = countUsersStmt.get().c === 0 ? 'admin' : 'staff';
    const hashed = await hashPassword(password);
    const info = insertUserStmt.run(normalizedEmail, hashed, role, branchId, display_name || null, 'system', 1);
    const userRow = selectUserById.get(info.lastInsertRowid);
    const authPayload = await createSessionForUser(userRow, req);
    logAction('auth.register', req, { user_id: userRow.id, role }, userRow);
    return res.status(201).json(authPayload);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    return res.status(500).json({ error: 'Sunucu hatası' });
  }
}

export async function login(req, res) {
  const { email, password } = req.body || {};
  const normalizedEmail = sanitizeEmail(email);
  const row = selectUserByEmail.get(normalizedEmail);
  if (!row) return res.status(401).json({ error: 'Kimlik doğrulanamadı' });
  if (!row.is_active) return res.status(403).json({ error: 'Hesap pasif durumda' });
  const ok = await verifyPassword(password || '', row.password_hash);
  if (!ok) return res.status(401).json({ error: 'Kimlik doğrulanamadı' });
  const authPayload = await createSessionForUser(row, req);
  logAction('auth.login', req, { user_id: row.id }, row);
  return res.json(authPayload);
}

export async function refresh(req, res) {
  const { refresh_token: refreshToken } = req.body || {};
  if (!refreshToken) return res.status(422).json({ error: 'refresh_token gerekli' });
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    return res.status(401).json({ error: 'Token geçersiz' });
  }
  const session = getSessionStmt.get(decoded.sid);
  if (!session || session.user_id !== decoded.uid) return res.status(401).json({ error: 'Oturum geçersiz' });
  if (session.revoked_at) return res.status(401).json({ error: 'Oturum sonlandırılmış' });
  if (session.expires_at && dayjs(session.expires_at).isBefore(dayjs())) {
    return res.status(401).json({ error: 'Oturum süresi dolmuş' });
  }
  const matches = await compareToken(refreshToken, session.refresh_token_hash);
  if (!matches) {
    revokeSessionStmt.run(new Date().toISOString(), new Date().toISOString(), session.id);
    return res.status(401).json({ error: 'Token uyuşmuyor' });
  }
  const userRow = selectUserById.get(session.user_id);
  if (!userRow || !userRow.is_active) {
    revokeSessionStmt.run(new Date().toISOString(), new Date().toISOString(), session.id);
    return res.status(403).json({ error: 'Hesap pasif durumda' });
  }
  const authPayload = await createSessionForUser(userRow, req, session.id);
  logAction('auth.refresh', req, { session_id: session.id }, userRow);
  return res.json(authPayload);
}

export async function logout(req, res) {
  const { refresh_token: refreshToken } = req.body || {};
  if (!refreshToken) return res.status(422).json({ error: 'refresh_token gerekli' });
  try {
    const decoded = verifyRefreshToken(refreshToken);
    const session = getSessionStmt.get(decoded.sid);
    if (!session) return res.json({ ok: true });
    const now = new Date().toISOString();
    revokeSessionStmt.run(now, now, session.id);
    logAction('auth.logout', req, { session_id: session.id }, null);
    return res.json({ ok: true });
  } catch {
    return res.json({ ok: true });
  }
}

export function profile(req, res) {
  const row = selectUserById.get(req.user.id);
  if (!row) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  return res.json({ user: buildUserPayload(row) });
}

export async function updateProfile(req, res) {
  const { display_name, current_password, new_password } = req.body || {};
  if (!display_name && !new_password) {
    return res.status(422).json({ error: 'Güncellenecek bilgi bulunamadı' });
  }
  const row = selectUserById.get(req.user.id);
  if (!row) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  if (!row.is_active) return res.status(403).json({ error: 'Hesap pasif durumda' });

  if (display_name !== undefined) {
    updateUserProfileStmt.run(display_name || null, row.id);
  }

  if (new_password) {
    if (!current_password) return res.status(422).json({ error: 'Mevcut şifre gerekli' });
    const ok = await verifyPassword(current_password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Mevcut şifre hatalı' });
    const hashed = await hashPassword(new_password);
    updateUserPasswordStmt.run(hashed, row.id);
  }

  const updated = selectUserById.get(row.id);
  logAction('auth.profile.update', req, { user_id: row.id }, updated);
  return res.json({ user: buildUserPayload(updated) });
}

const ALLOWED_THEMES = new Set(['system', 'light', 'dark']);

export function updateTheme(req, res) {
  const { theme } = req.body || {};
  if (!theme || !ALLOWED_THEMES.has(theme)) {
    return res.status(422).json({ error: 'Geçersiz tema' });
  }
  updateThemeStmt.run(theme, req.user.id);
  const updated = selectUserById.get(req.user.id);
  logAction('auth.theme.update', req, { theme }, updated);
  return res.json({ user: buildUserPayload(updated) });
}
