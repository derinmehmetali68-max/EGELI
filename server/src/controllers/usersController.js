import db from '../db.js';
import { hashPassword } from '../utils/auth.js';

const baseSelect = `
  SELECT u.id,
         u.email,
         u.display_name,
         u.role,
         u.is_active,
         u.branch_id,
         u.created_at,
         u.updated_at,
         b.name AS branch_name
    FROM users u
    LEFT JOIN branches b ON b.id = u.branch_id
`;

function requireAdmin(req, res) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Bu işlem için yönetici yetkisi gerekli.' });
    return false;
  }
  return true;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeRole(role) {
  if (role === 'admin' || role === 'staff') return role;
  return 'staff';
}

function ensureBranch(branchId) {
  if (branchId === undefined || branchId === null || branchId === '' || branchId === 'null') {
    return null;
  }
  const numeric = Number(branchId);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw Object.assign(new Error('Geçersiz şube seçimi'), { status: 422 });
  }
  const row = db.prepare('SELECT id FROM branches WHERE id=?').get(numeric);
  if (!row) {
    throw Object.assign(new Error('Şube bulunamadı'), { status: 422 });
  }
  return row.id;
}

export function listUsers(req, res) {
  if (!requireAdmin(req, res)) return;
  const rows = db.prepare(`${baseSelect} ORDER BY u.created_at DESC`).all();
  res.json(rows);
}

export async function createUser(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    const { email, password, display_name, role = 'staff', branch_id, is_active = true } = req.body || {};
    if (!email || !password) {
      return res.status(422).json({ error: 'Email ve şifre zorunlu.' });
    }
    if (password.length < 6) {
      return res.status(422).json({ error: 'Şifre en az 6 karakter olmalı.' });
    }
    const normalizedEmail = normalizeEmail(email);
    const existing = db.prepare('SELECT id FROM users WHERE email=?').get(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: 'Bu email adresi zaten kayıtlı.' });
    }
    let normalizedBranch = null;
    try {
      normalizedBranch = ensureBranch(branch_id);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    const hashed = await hashPassword(password);
    const roleValue = normalizeRole(role);
    const info = db
      .prepare(
        `INSERT INTO users(email,password_hash,role,branch_id,display_name,theme_preference,is_active,created_at,updated_at)
         VALUES (?,?,?,?,?,'system',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`
      )
      .run(normalizedEmail, hashed, roleValue, normalizedBranch, display_name || null, is_active ? 1 : 0);
    const row = db.prepare(`${baseSelect} WHERE u.id=?`).get(info.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) {
    console.error('createUser error', err);
    res.status(500).json({ error: 'Kullanıcı oluşturulamadı.' });
  }
}

function countActiveAdmins(excludeId = null) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM users WHERE role='admin' AND is_active=1${excludeId ? ' AND id<>?' : ''}`
    )
    .get(excludeId ? [excludeId] : []);
  return Number(row?.cnt ?? 0);
}

export async function updateUser(req, res) {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Geçersiz kullanıcı ID.' });
  }
  const existing = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  }
  const { display_name, role, branch_id, is_active, password } = req.body || {};
  const updates = [];
  const params = [];

  if (display_name !== undefined) {
    updates.push('display_name=?');
    params.push(display_name || null);
  }

  if (role !== undefined) {
    const normalizedRole = normalizeRole(role);
    if (existing.role === 'admin' && normalizedRole !== 'admin') {
      const remainingAdmins = countActiveAdmins(existing.id);
      if (remainingAdmins < 1) {
        return res.status(422).json({ error: 'Sistemde en az bir yönetici kalmalıdır.' });
      }
    }
    updates.push('role=?');
    params.push(normalizedRole);
  }

  if (branch_id !== undefined) {
    try {
      const normalizedBranch = ensureBranch(branch_id);
      updates.push('branch_id=?');
      params.push(normalizedBranch);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }

  if (is_active !== undefined) {
    const numeric = is_active ? 1 : 0;
    if (existing.role === 'admin' && numeric === 0) {
      const remainingAdmins = countActiveAdmins(existing.id);
      if (remainingAdmins < 1) {
        return res.status(422).json({ error: 'Son aktif yönetici pasif duruma getirilemez.' });
      }
    }
    updates.push('is_active=?');
    params.push(numeric);
  }

  if (password) {
    if (password.length < 6) {
      return res.status(422).json({ error: 'Yeni şifre en az 6 karakter olmalıdır.' });
    }
    const hashed = await hashPassword(password);
    updates.push('password_hash=?');
    params.push(hashed);
  }

  if (!updates.length) {
    return res.status(422).json({ error: 'Güncellenecek alan bulunamadı.' });
  }

  updates.push('updated_at=CURRENT_TIMESTAMP');
  const sql = `UPDATE users SET ${updates.join(', ')} WHERE id=?`;
  db.prepare(sql).run(...params, id);
  const updated = db.prepare(`${baseSelect} WHERE u.id=?`).get(id);
  res.json(updated);
}

export function deleteUser(req, res) {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Geçersiz kullanıcı ID.' });
  }
  if (id === req.user.id) {
    return res.status(422).json({ error: 'Kendi hesabınızı silemezsiniz.' });
  }
  const existing = db.prepare('SELECT id, role FROM users WHERE id=?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  }
  if (existing.role === 'admin') {
    const remainingAdmins = countActiveAdmins(existing.id);
    if (remainingAdmins < 1) {
      return res.status(422).json({ error: 'Sistemde en az bir yönetici kalmalıdır.' });
    }
  }
  db.prepare('DELETE FROM users WHERE id=?').run(id);
  res.json({ ok: true });
}

