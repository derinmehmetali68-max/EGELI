import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import db from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'library.db');
const backupsDir = path.join(dataDir, 'backups');

function ensureBackupsDir() {
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
}

function sanitizeName(name) {
  if (typeof name !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(name)) {
    const err = new Error('Geçersiz dosya adı');
    err.status = 400;
    throw err;
  }
  return name;
}

function resolveBackupPath(name) {
  ensureBackupsDir();
  return path.join(backupsDir, sanitizeName(name));
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes} B`;
}

function buildBackupInfo(filePath, name) {
  const stats = fs.statSync(filePath);
  return {
    name,
    size_bytes: stats.size,
    size: formatSize(stats.size),
    created_at: stats.birthtime ? stats.birthtime.toISOString() : stats.mtime.toISOString(),
    updated_at: stats.mtime.toISOString(),
  };
}

export function listBackups(_req, res) {
  ensureBackupsDir();
  const files = fs
    .readdirSync(backupsDir)
    .filter(file => file.endsWith('.db'))
    .map(name => buildBackupInfo(path.join(backupsDir, name), name))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  res.json(files);
}

export function downloadBackupFile(req, res) {
  try {
    const filePath = resolveBackupPath(req.params.name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Yedek bulunamadı.' });
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'İşlem başarısız.' });
  }
}

function vacuumInto(destPath) {
  db.pragma('wal_checkpoint(FULL)');
  try {
    db.prepare('VACUUM INTO ?').run(destPath);
    return true;
  } catch (err) {
    console.warn('VACUUM INTO desteklenmedi, dosya kopyalama kullanılacak:', err.message);
    return false;
  }
}

export function createBackup(_req, res) {
  ensureBackupsDir();
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '')
    .replace('T', '-')
    .slice(0, 15);
  const fileName = `library-backup-${timestamp}.db`;
  const destination = path.join(backupsDir, fileName);
  try {
    const vacuumOk = vacuumInto(destination);
    if (!vacuumOk) {
      db.pragma('wal_checkpoint(FULL)');
      fs.copyFileSync(dbPath, destination);
    }
    const info = buildBackupInfo(destination, fileName);
    res.status(201).json(info);
  } catch (err) {
    console.error('createBackup error', err);
    if (fs.existsSync(destination)) {
      fs.unlinkSync(destination);
    }
    res.status(500).json({ error: 'Yedek oluşturulamadı.', detail: err.message });
  }
}

export function deleteBackup(req, res) {
  try {
    const filePath = resolveBackupPath(req.params.name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Yedek bulunamadı.' });
    }
    fs.unlinkSync(filePath);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Yedek silinemedi.' });
  }
}

export function uploadBackup(req, res) {
  ensureBackupsDir();
  if (!req.file) {
    return res.status(400).json({ error: 'Yüklenecek dosya bulunamadı.' });
  }
  const tempPath = req.file.path;
  try {
    const original = req.file.originalname || 'uploaded.db';
    const sanitizedOriginal = original.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const timePrefix = new Date()
      .toISOString()
      .replace(/[:.]/g, '')
      .replace('T', '-')
      .slice(0, 15);
    const baseName = sanitizedOriginal.endsWith('.db') ? sanitizedOriginal : `${sanitizedOriginal}.db`;
    const finalName = `uploaded-${timePrefix}-${baseName}`;
    const destination = path.join(backupsDir, finalName);
    fs.renameSync(tempPath, destination);
    const info = buildBackupInfo(destination, finalName);
    res.status(201).json(info);
  } catch (err) {
    console.error('uploadBackup error', err);
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    res.status(500).json({ error: 'Dosya yüklenemedi.', detail: err.message });
  }
}

export function restoreBackup(req, res) {
  let attached = false;
  try {
    const filePath = resolveBackupPath(req.params.name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Yedek bulunamadı.' });
    }
    db.exec('PRAGMA foreign_keys=OFF');
    db.exec('BEGIN IMMEDIATE');
    db.prepare('ATTACH DATABASE ? AS restore_db').run(filePath);
    attached = true;
    const tables = db
      .prepare("SELECT name FROM restore_db.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map(row => row.name);
    tables.forEach(table => {
      db.prepare(`DELETE FROM "${table}"`).run();
      db.prepare(`INSERT INTO "${table}" SELECT * FROM restore_db."${table}"`).run();
    });
    try {
      const seqRows = db
        .prepare("SELECT name, seq FROM restore_db.sqlite_sequence WHERE name NOT LIKE ''")
        .all();
      if (seqRows.length) {
        try {
          db.prepare('DELETE FROM sqlite_sequence').run();
        } catch {}
        seqRows.forEach(row => {
          try {
            db.prepare('INSERT INTO sqlite_sequence(name, seq) VALUES(?, ?)').run(row.name, row.seq);
          } catch {}
        });
      }
    } catch {}
    db.exec('COMMIT');
    db.exec('PRAGMA foreign_keys=ON');
    db.exec('DETACH DATABASE restore_db');
    res.json({ ok: true, restored_from: req.params.name });
  } catch (err) {
    console.error('restoreBackup error', err);
    try {
      db.exec('ROLLBACK');
    } catch {}
    if (attached) {
      try {
        db.exec('DETACH DATABASE restore_db');
      } catch {}
    }
    try {
      db.exec('PRAGMA foreign_keys=ON');
    } catch {}
    res.status(500).json({ error: 'Veritabanı geri yüklenemedi.', detail: err.message });
  }
}

export function resetDatabase(_req, res) {
  const adminEmail = process.env.ADMIN_EMAIL || 'cumhuriyet';
  const adminPass = process.env.ADMIN_PASSWORD || '11062300';
  const defaultSettings = {
    loan_days_default: '15',
    okul_adi: 'Cumhuriyet Anadolu Lisesi',
    okul_logo_url: '',
    fine_cents_per_day: '0',
    smtp_host: '',
    smtp_port: '587',
    smtp_secure: 'false',
    smtp_user: '',
    smtp_pass: '',
    smtp_from: '',
    smtp_transport: '',
  };

  db.exec('PRAGMA foreign_keys=OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map(row => row.name);

    tables.forEach(table => {
      db.prepare(`DELETE FROM "${table}"`).run();
    });

    try {
      db.prepare('DELETE FROM sqlite_sequence').run();
    } catch {}

    const branchInsert = db.prepare('INSERT INTO branches(name, code) VALUES (?, ?)');
    branchInsert.run('Merkez', 'MRZ');
    branchInsert.run('Anadolu Şubesi', 'ANZ');
    const mainBranch = db.prepare('SELECT id FROM branches WHERE code=?').get('MRZ');
    const mainBranchId = mainBranch ? mainBranch.id : null;

    const passwordHash = bcrypt.hashSync(adminPass, 10);
    db.prepare(`INSERT INTO users(email,password_hash,role,branch_id,display_name,theme_preference,is_active,created_at,updated_at)
      VALUES (?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`)
      .run(adminEmail, passwordHash, 'admin', mainBranchId, 'Yönetici', 'system');

    const settingStmt = db.prepare('INSERT INTO settings(key, value) VALUES (?, ?)');
    Object.entries(defaultSettings).forEach(([key, value]) => {
      settingStmt.run(key, value);
    });

    const bookStmt = db.prepare(`INSERT INTO books(
      isbn,title,author,category,copies,available,branch_id,cover_path,publisher,published_year,page_count,language,shelf,cabinet,created_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`);
    if (mainBranchId) {
      bookStmt.run(
        '978975080',
        'Sineklerin Tanrısı',
        'William Golding',
        'Roman',
        3,
        3,
        mainBranchId,
        null,
        'Can Yayınları',
        '1954',
        300,
        'Türkçe',
        'A-1',
        '1',
      );

      db.prepare(`INSERT INTO members(student_no,name,grade,phone,email,member_type,branch_id,created_at)
        VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
        .run('9B-120', 'Ayşe Yılmaz', '9B', '0500-000-0000', 'ayse@example.com', 'Öğrenci', mainBranchId);
    }

    db.exec('COMMIT');
    db.exec('PRAGMA foreign_keys=ON');
    res.json({ ok: true });
  } catch (err) {
    console.error('resetDatabase error', err);
    try {
      db.exec('ROLLBACK');
    } catch {}
    try {
      db.exec('PRAGMA foreign_keys=ON');
    } catch {}
    res.status(500).json({ error: 'Veritabanı sıfırlanamadı.', detail: err.message });
  }
}
