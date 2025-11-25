import db from './db.js';

function columnExists(table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some(r => r.name === column);
}

function ensureSetting(key, defaultValue) {
  db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)').run(key, String(defaultValue));
}

function ensureBranches() {
  db.prepare('INSERT OR IGNORE INTO branches(name,code) VALUES (?,?)').run('Merkez', 'MRZ');
  db.prepare('INSERT OR IGNORE INTO branches(name,code) VALUES (?,?)').run('Anadolu Şubesi', 'ANZ');
  const main = db.prepare('SELECT id FROM branches WHERE code=?').get('MRZ');
  return main ? main.id : null;
}

function runMigrations() {
  if (!columnExists('users', 'branch_id')) {
    db.exec('ALTER TABLE users ADD COLUMN branch_id INTEGER');
  }
  if (!columnExists('users', 'display_name')) {
    db.exec('ALTER TABLE users ADD COLUMN display_name TEXT');
  }
  if (!columnExists('users', 'theme_preference')) {
    db.exec("ALTER TABLE users ADD COLUMN theme_preference TEXT NOT NULL DEFAULT 'system'");
  }
  if (!columnExists('users', 'is_active')) {
    db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
  }
  if (!columnExists('users', 'created_at')) {
    db.exec('ALTER TABLE users ADD COLUMN created_at TEXT');
    db.prepare('UPDATE users SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP)').run();
  }
  if (!columnExists('users', 'updated_at')) {
    db.exec('ALTER TABLE users ADD COLUMN updated_at TEXT');
    db.prepare('UPDATE users SET updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)').run();
  }
  if (!columnExists('members', 'branch_id')) {
    db.exec('ALTER TABLE members ADD COLUMN branch_id INTEGER');
  }
  if (!columnExists('members', 'email')) {
    db.exec('ALTER TABLE members ADD COLUMN email TEXT');
  }
  if (!columnExists('members', 'phone')) {
    db.exec('ALTER TABLE members ADD COLUMN phone TEXT');
  }
  if (!columnExists('members', 'member_type')) {
    db.exec("ALTER TABLE members ADD COLUMN member_type TEXT DEFAULT 'Öğrenci'");
    db.prepare("UPDATE members SET member_type = COALESCE(member_type, 'Öğrenci')").run();
  }
  if (!columnExists('members', 'is_blocked')) {
    db.exec('ALTER TABLE members ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0');
  }
  if (!columnExists('members', 'note')) {
    db.exec('ALTER TABLE members ADD COLUMN note TEXT');
  }
  if (!columnExists('reservations', 'branch_id')) {
    db.exec('ALTER TABLE reservations ADD COLUMN branch_id INTEGER');
  }

  if (!columnExists('books', 'publisher')) {
    db.exec('ALTER TABLE books ADD COLUMN publisher TEXT');
  }
  if (!columnExists('books', 'published_year')) {
    db.exec('ALTER TABLE books ADD COLUMN published_year TEXT');
  }
  if (!columnExists('books', 'page_count')) {
    db.exec('ALTER TABLE books ADD COLUMN page_count INTEGER');
  }
  if (!columnExists('books', 'language')) {
    db.exec("ALTER TABLE books ADD COLUMN language TEXT DEFAULT 'Türkçe'");
    db.prepare("UPDATE books SET language = COALESCE(language, 'Türkçe')").run();
  }
  if (!columnExists('books', 'shelf')) {
    db.exec('ALTER TABLE books ADD COLUMN shelf TEXT');
  }
  if (!columnExists('books', 'cabinet')) {
    db.exec('ALTER TABLE books ADD COLUMN cabinet TEXT');
  }
  if (!columnExists('books', 'last_seen_at')) {
    db.exec('ALTER TABLE books ADD COLUMN last_seen_at TEXT');
  }

  const scansTableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='inventory_scans'`)
    .get();
  if (!scansTableExists) {
    db.exec(`CREATE TABLE inventory_scans(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      branch_id INTEGER,
      location TEXT,
      scanned_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(book_id) REFERENCES books(id),
      FOREIGN KEY(branch_id) REFERENCES branches(id)
    )`);
  }

  const transfersTableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='transfers'`)
    .get();
  if (!transfersTableExists) {
    db.exec(`CREATE TABLE transfers(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      from_branch_id INTEGER,
      to_branch_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'requested', -- requested|approved|in_transit|completed|cancelled
      note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(book_id) REFERENCES books(id),
      FOREIGN KEY(from_branch_id) REFERENCES branches(id),
      FOREIGN KEY(to_branch_id) REFERENCES branches(id)
    )`);
  }

  db.exec(`CREATE TABLE IF NOT EXISTS user_sessions(
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
  )`);
  
  // Kiosk logs tablosu - kiosk işlem geçmişi için
  const kioskTableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='kiosk_logs'`).get();
  if (!kioskTableExists) {
    db.exec(`CREATE TABLE kiosk_logs(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_type TEXT NOT NULL CHECK(action_type IN ('checkout','return','search')),
      book_id INTEGER,
      member_id INTEGER,
      isbn TEXT,
      student_no TEXT,
      success INTEGER NOT NULL DEFAULT 1,
      error_message TEXT,
      ip_address TEXT,
      branch_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(book_id) REFERENCES books(id),
      FOREIGN KEY(member_id) REFERENCES members(id),
      FOREIGN KEY(branch_id) REFERENCES branches(id)
    )`);
  }

  // User notifications tablosu
  const userNotificationsTableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='user_notifications'`).get();
  if (!userNotificationsTableExists) {
    db.exec(`CREATE TABLE user_notifications(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      action_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);
  }

  // System notifications tablosu
  const systemNotificationsTableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='system_notifications'`).get();
  if (!systemNotificationsTableExists) {
    db.exec(`CREATE TABLE system_notifications(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      action_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  const mainBranchId = ensureBranches();
  if (mainBranchId) {
    db.prepare('UPDATE users SET branch_id=? WHERE branch_id IS NULL').run(mainBranchId);
    db.prepare('UPDATE members SET branch_id=? WHERE branch_id IS NULL').run(mainBranchId);
  }
  db.prepare(`UPDATE users SET display_name = COALESCE(display_name,
    CASE
      WHEN instr(email,'@') > 0 THEN substr(email, 1, instr(email,'@')-1)
      ELSE email
    END
  )`).run();
  db.prepare("UPDATE users SET theme_preference='system' WHERE theme_preference IS NULL OR theme_preference=''").run();
  db.prepare("UPDATE users SET is_active=1 WHERE is_active IS NULL").run();

  db.prepare(`UPDATE reservations
    SET branch_id = (
      SELECT COALESCE(b.branch_id, m.branch_id, ?)
      FROM books b
      LEFT JOIN members m ON m.id = reservations.member_id
      WHERE b.id = reservations.book_id
    )
    WHERE branch_id IS NULL`).run(mainBranchId || null);

  // Yeni ayar anahtarları
  ensureSetting('max_active_loans', 5);
  ensureSetting('block_on_overdue', true);
  ensureSetting('fine_enabled', false);
  ensureSetting('kiosk_pin', '');
}

runMigrations();
console.log('Migration completed.');
if (process.env.NODE_ENV !== 'test') process.exit(0);
