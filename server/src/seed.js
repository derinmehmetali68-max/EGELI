import db from './db.js';
import bcrypt from 'bcrypt';
function run(sql){ try{ db.exec(sql); } catch(e){ console.error(e.message); } }
run(`
CREATE TABLE IF NOT EXISTS branches(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','staff')),
  branch_id INTEGER,
  display_name TEXT,
  theme_preference TEXT NOT NULL DEFAULT 'system',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(branch_id) REFERENCES branches(id)
);
CREATE TABLE IF NOT EXISTS settings(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS books(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  isbn TEXT,
  title TEXT NOT NULL,
  author TEXT,
  category TEXT,
  copies INTEGER NOT NULL DEFAULT 1,
  available INTEGER NOT NULL DEFAULT 1,
  branch_id INTEGER,
  cover_path TEXT,
  publisher TEXT,
  published_year TEXT,
  page_count INTEGER,
  language TEXT DEFAULT 'Türkçe',
  shelf TEXT,
  cabinet TEXT,
  last_seen_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(branch_id) REFERENCES branches(id)
);
CREATE TABLE IF NOT EXISTS members(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_no TEXT,
  name TEXT NOT NULL,
  grade TEXT,
  phone TEXT,
  email TEXT,
  member_type TEXT DEFAULT 'Öğrenci',
  is_blocked INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  branch_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(branch_id) REFERENCES branches(id)
);
CREATE TABLE IF NOT EXISTS loans(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  loan_date TEXT NOT NULL DEFAULT (DATE('now')),
  due_date TEXT NOT NULL,
  return_date TEXT,
  branch_id INTEGER,
  FOREIGN KEY(book_id) REFERENCES books(id),
  FOREIGN KEY(member_id) REFERENCES members(id),
  FOREIGN KEY(branch_id) REFERENCES branches(id)
);
CREATE TABLE IF NOT EXISTS reservations(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  branch_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active', -- active|fulfilled|cancelled
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(book_id) REFERENCES books(id),
  FOREIGN KEY(member_id) REFERENCES members(id),
  FOREIGN KEY(branch_id) REFERENCES branches(id)
);
CREATE TABLE IF NOT EXISTS audit_logs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT,
  action TEXT,
  meta TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS inventory_scans(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  branch_id INTEGER,
  location TEXT,
  scanned_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(book_id) REFERENCES books(id),
  FOREIGN KEY(branch_id) REFERENCES branches(id)
);
CREATE TABLE IF NOT EXISTS transfers(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  from_branch_id INTEGER,
  to_branch_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(book_id) REFERENCES books(id),
  FOREIGN KEY(from_branch_id) REFERENCES branches(id),
  FOREIGN KEY(to_branch_id) REFERENCES branches(id)
);
CREATE TABLE IF NOT EXISTS user_sessions(
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  refresh_token_hash TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);
db.prepare('INSERT OR IGNORE INTO branches(name,code) VALUES (?,?)').run('Merkez','MRZ');
db.prepare('INSERT OR IGNORE INTO branches(name,code) VALUES (?,?)').run('Anadolu Şubesi','ANZ');
const adminEmail = process.env.ADMIN_EMAIL || 'cumhuriyet';
const adminPass = process.env.ADMIN_PASSWORD || '11062300';
const hash = await bcrypt.hash(adminPass, 10);
const mainBranch = db.prepare('SELECT id FROM branches WHERE code=?').get('MRZ').id;
db.prepare(`INSERT INTO users(email,password_hash,role,branch_id,display_name,theme_preference,is_active)
  VALUES (?,?,?,?,?,?,?)
  ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash, role=excluded.role, branch_id=excluded.branch_id,
    display_name=excluded.display_name, theme_preference=excluded.theme_preference, is_active=excluded.is_active`).run(
  adminEmail, hash, 'admin', mainBranch, 'Yönetici', 'system', 1
);
db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)').run('loan_days_default','15');
db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)').run('okul_adi','Cumhuriyet Anadolu Lisesi');
db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)').run('okul_logo_url','');
db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)').run('fine_cents_per_day','0');
db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)').run('max_active_loans','5');
db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)').run('block_on_overdue','true');
db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)').run('fine_enabled','false');
db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)').run('kiosk_pin','');
db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)').run('smtp_host','');
db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)').run('smtp_port','587');
db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)').run('smtp_secure','false');
db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)').run('smtp_user','');
db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)').run('smtp_pass','');
db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)').run('smtp_from','');
db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)').run('smtp_transport','');
console.log('Seed tamamlandı.'); if(process.env.NODE_ENV!=='test') process.exit(0);
