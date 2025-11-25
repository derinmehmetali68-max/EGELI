import db from '../db.js';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import XLSX from 'xlsx';
import { buildBranchFilter, resolveBranchForWrite, canAccessBranch, isAdmin } from '../utils/branch.js';
import { auditAction } from '../utils/audit.js';

const MEMBER_TYPES = ['Öğrenci', 'Öğretmen', 'Personel', 'Mezun', 'Misafir'];

// Üyeler için normalizasyon fonksiyonları
function normalizeName(name) {
  if (!name) return null;
  let str = String(name).trim();
  
  // Türkçe karakter düzeltmeleri
  str = str
    .replace(/Seker/g, 'Şeker')
    .replace(/S/g, 'Ş').replace(/s(?![aou])/g, 'ş')
    .replace(/C(?![ehi])/g, 'Ç').replace(/c(?![ehi])/g, 'ç')
    .replace(/I(?![aou])/g, 'İ').replace(/i(?![aou])/g, 'ı');
  
  // İlk harfi büyük, diğerlerini küçük yap (Türkçe kurallarına göre)
  // Çoklu kelimelerde her kelimenin ilk harfi büyük olmalı
  str = str.split(/\s+/).map(word => {
    if (word.length === 0) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
  
  return str;
}

function normalizeGrade(grade) {
  if (!grade) return null;
  let str = String(grade).trim();
  
  // Sınıf formatını normalleştir (9A, 9-a, 9_A -> 9A)
  str = str.replace(/[-\s_]/g, '').toUpperCase();
  
  return str;
}

function normalizeStudentNo(student_no) {
  if (!student_no) return null;
  // Okul numarasını büyük harfe çevir ve boşlukları kaldır
  return String(student_no).trim().toUpperCase();
}

function normalizeNote(note) {
  if (note === undefined || note === null) return null;
  const trimmed = String(note).trim();
  return trimmed ? trimmed : null;
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const str = String(value).trim().toLowerCase();
  if (['1', 'true', 'evet', 'yes', 'y', 'on', 'blocked'].includes(str)) return true;
  if (['0', 'false', 'hayir', 'hayır', 'no', 'n', 'off', 'unblocked'].includes(str)) return false;
  return fallback;
}

export function listMembers(req, res) {
  const q = req.query.q || '';
  const typeFilter = req.query.member_type;
  const blockedFilter = req.query.blocked;
  let sql = 'SELECT * FROM members WHERE (name LIKE ? OR student_no LIKE ? OR grade LIKE ?)';
  const params = [`%${q}%`, `%${q}%`, `%${q}%`];
  if (typeFilter && typeFilter !== 'all') {
    sql += ' AND member_type = ?';
    params.push(typeFilter);
  }
  if (blockedFilter === 'true') {
    sql += ' AND is_blocked = 1';
  } else if (blockedFilter === 'false') {
    sql += ' AND is_blocked = 0';
  }
  const { clause, params: branchParams } = buildBranchFilter({ user: req.user, queryValue: req.query.branch_id });
  sql += clause;
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params, ...branchParams);
  res.json({ items: rows, member_types: MEMBER_TYPES });
}

export function createMember(req, res) {
  const { student_no, name, grade, phone, email, member_type, is_blocked, note } = req.body;
  if (!name) return res.status(422).json({ error: 'Ad Soyad zorunlu' });
  const branchId = resolveBranchForWrite(req.user, req.body.branch_id);
  const sanitizedType = MEMBER_TYPES.includes(member_type) ? member_type : 'Öğrenci';
  const blockedValue = toBoolean(is_blocked, false) ? 1 : 0;
  const noteValue = normalizeNote(note);
  const info = db
    .prepare('INSERT INTO members(student_no,name,grade,phone,email,member_type,branch_id,is_blocked,note) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(
      normalizeStudentNo(student_no) || null,
      normalizeName(name),
      normalizeGrade(grade) || null,
      phone || null,
      email || null,
      sanitizedType,
      branchId,
      blockedValue,
      noteValue
    );
  res.json({ id: info.lastInsertRowid });
}

export function updateMember(req, res) {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM members WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ error: 'Kayıt bulunamadı' });
  if (!canAccessBranch(req.user, existing.branch_id)) return res.status(403).json({ error: 'Şube yetkiniz yok' });
  const { student_no, name, grade, phone, email, member_type } = req.body;
  let targetBranch = existing.branch_id;
  if (isAdmin(req.user)) {
    targetBranch = resolveBranchForWrite(req.user, req.body.branch_id ?? existing.branch_id);
  }
  const blockedValue = Object.prototype.hasOwnProperty.call(req.body, 'is_blocked')
    ? (toBoolean(req.body.is_blocked, existing.is_blocked) ? 1 : 0)
    : existing.is_blocked || 0;
  const noteValue = Object.prototype.hasOwnProperty.call(req.body, 'note')
    ? normalizeNote(req.body.note)
    : existing.note;
  const sanitizedType =
    member_type !== undefined
      ? MEMBER_TYPES.includes(member_type) ? member_type : existing.member_type
      : existing.member_type;
  db.prepare('UPDATE members SET student_no=?, name=?, grade=?, phone=?, email=?, member_type=?, branch_id=?, is_blocked=?, note=? WHERE id=?')
    .run(
      student_no ? normalizeStudentNo(student_no) : existing.student_no,
      name ? normalizeName(name) : existing.name,
      grade ? normalizeGrade(grade) : existing.grade,
      phone || null,
      email || null,
      sanitizedType || 'Öğrenci',
      targetBranch ?? null,
      blockedValue,
      noteValue,
      id
    );
  res.json({ ok: true });
}

export function deleteMember(req, res) {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT branch_id FROM members WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ error: 'Kayıt bulunamadı' });
  if (!canAccessBranch(req.user, existing.branch_id)) return res.status(403).json({ error: 'Şube yetkiniz yok' });
  db.prepare('DELETE FROM members WHERE id=?').run(id);
  res.json({ ok: true });
}

export function exportMembersCsv(req, res) {
  let sql = 'SELECT student_no,name,grade,phone,email,member_type,is_blocked,note FROM members WHERE 1=1';
  const { clause, params } = buildBranchFilter({ user: req.user, queryValue: req.query.branch_id });
  sql += clause;
  const rows = db.prepare(sql).all(...params);
  // UTF-8 BOM ekle (Excel'de Türkçe karakterler için)
  const BOM = '\uFEFF';
  const header = BOM + 'Okul Numarası,Ad Soyad,Sınıf,Telefon,E-posta,Üye Türü,Askıya Alındı,Not\n';
  const body = rows
    .map(r =>
      [
        r.student_no || '',
        r.name || '',
        r.grade || '',
        r.phone || '',
        r.email || '',
        r.member_type || '',
        r.is_blocked ? 'Evet' : 'Hayır',
        r.note || ''
      ]
        .map(x => `"${String(x).replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="uyeler.csv"');
  res.send(header + body);
}

export function importMembersCsv(req, res) {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'CSV dosyası yok' });
  const csv = fs.readFileSync(file.path);
  const records = parse(csv, { columns: true, skip_empty_lines: true });
  const branchId = resolveBranchForWrite(req.user, req.body?.branch_id);
  const stmt = db.prepare('INSERT INTO members(student_no,name,grade,phone,email,member_type,branch_id,is_blocked,note) VALUES (?,?,?,?,?,?,?,?,?)');
  let n = 0;
  for (const r of records) {
    const type = MEMBER_TYPES.includes(r.member_type) ? r.member_type : 'Öğrenci';
    stmt.run(
      normalizeStudentNo(r.student_no) || null,
      normalizeName(r.name),
      normalizeGrade(r.grade) || null,
      r.phone || null,
      r.email || null,
      type,
      branchId,
      toBoolean(r.is_blocked, false) ? 1 : 0,
      normalizeNote(r.note)
    );
    n++;
  }
  res.json({ imported: n, branch_id: branchId });
}

export function exportMembersXlsx(req, res) {
  let sql = 'SELECT id,student_no,name,grade,phone,email,member_type,is_blocked,note FROM members WHERE 1=1';
  const { clause, params } = buildBranchFilter({ user: req.user, queryValue: req.query.branch_id });
  sql += clause;
  sql += ' ORDER BY id DESC';
  const rows = db.prepare(sql).all(...params);
  
  // Türkçe başlıklar için mapping
  const mappedRows = rows.map(row => ({
    'ID': row.id,
    'Okul Numarası': row.student_no || '',
    'Ad Soyad': row.name || '',
    'Sınıf': row.grade || '',
    'Telefon': row.phone || '',
    'E-posta': row.email || '',
    'Üye Türü': row.member_type || '',
    'Askıya Alındı': row.is_blocked ? 'Evet' : 'Hayır',
    'Not': row.note || '',
  }));
  
  const ws = XLSX.utils.json_to_sheet(mappedRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Üyeler');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="uyeler.xlsx"');
  res.end(buf);
}

export function importMembersXlsx(req, res) {
  if (!req.file) return res.status(400).json({ error: 'XLSX dosyası yok' });
  const wb = XLSX.readFile(req.file.path);
  const wsname = wb.SheetNames[0];
  if (!wsname) return res.status(400).json({ error: 'Geçersiz XLSX dosyası' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wsname]);
  if (!Array.isArray(rows) || !rows.length) {
    return res.status(400).json({ error: 'Çalışılacak satır bulunamadı' });
  }
  const branchId = resolveBranchForWrite(req.user, req.body?.branch_id);
  const insert = db.prepare(
    'INSERT INTO members(student_no,name,grade,phone,email,member_type,branch_id,is_blocked,note) VALUES (?,?,?,?,?,?,?,?,?)'
  );
  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    const name = String(row.name || '').trim();
    if (!name) {
      skipped++;
      continue;
    }
    const rawType = String(row.member_type || row.type || '').trim();
    const memberType = MEMBER_TYPES.includes(rawType) ? rawType : 'Öğrenci';
    const blockedRaw = row.is_blocked ?? row.blocked ?? row['Askıya Alındı'] ?? row['Durum'];
    const noteValue = normalizeNote(row.note || row['Not']);
    insert.run(
      normalizeStudentNo(row.student_no || row.number) || null,
      normalizeName(name),
      normalizeGrade(row.grade || row.class) || null,
      row.phone || null,
      row.email || null,
      memberType,
      branchId,
      toBoolean(blockedRaw, false) ? 1 : 0,
      noteValue
    );
    imported++;
  }
  res.json({ imported, skipped, branch_id: branchId });
}

export function normalizeAllMembers(req, res) {
  try {
    const { clause, params } = buildBranchFilter({
      user: req.user,
      queryValue: req.query.branch_id,
    });
    
    // Tüm üyeleri getir
    const sql = `SELECT * FROM members WHERE 1=1${clause}`;
    const members = db.prepare(sql).all(...params);
    
    let updated = 0;
    const updateStmt = db.prepare(`
      UPDATE members 
      SET name=?, student_no=?, grade=? 
      WHERE id=?
    `);
    
    for (const member of members) {
      const normalizedName = normalizeName(member.name);
      const normalizedStudentNo = normalizeStudentNo(member.student_no);
      const normalizedGrade = normalizeGrade(member.grade);
      
      // Değişiklik varsa güncelle
      if (normalizedName !== member.name || 
          normalizedStudentNo !== member.student_no || 
          normalizedGrade !== member.grade) {
        updateStmt.run(normalizedName, normalizedStudentNo, normalizedGrade, member.id);
        updated++;
      }
    }
    
    res.json({ 
      ok: true, 
      total: members.length, 
      updated, 
      message: `${updated} üye düzeltildi.` 
    });
  } catch (error) {
    console.error('Normalize all members error:', error);
    res.status(500).json({ error: 'Üye düzeltme sırasında hata oluştu', detail: error.message });
  }
}

export async function syncEokul(req, res) {
  try {
    const url = req.body?.url || process.env.EOKUL_API_URL;
    if (!url) {
      return res.status(400).json({ 
        error: 'E-Okul API URL gerekli',
        detail: 'Lütfen .env dosyasında EOKUL_API_URL tanımlayın veya istekte url parametresi gönderin'
      });
    }
    const branchId = resolveBranchForWrite(req.user, req.body?.branch_id);
    const apiKey = req.body?.api_key || process.env.EOKUL_API_KEY || '';
    
    console.log(`[E-Okul] Senkronizasyon başlatılıyor: ${url.substring(0, 50)}...`);
    
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    // Timeout için AbortController kullan
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 saniye
    
    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return res.status(504).json({ error: 'E-Okul API yanıt vermedi (timeout)', detail: '30 saniye içinde yanıt alınamadı' });
      }
      throw fetchError;
    }
    if (!response.ok) {
      const text = await response.text();
      return res
        .status(502)
        .json({ error: 'E-Okul verisi alınamadı', detail: `${response.status} ${text}` });
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) {
      return res.status(422).json({ error: 'Geçersiz E-Okul verisi (dizi bekleniyor)' });
    }

    const insertStmt = db.prepare(
      'INSERT INTO members(student_no,name,grade,phone,email,member_type,branch_id,is_blocked,note) VALUES (?,?,?,?,?,?,?,?,?)'
    );
    const updateStmt = db.prepare(
      'UPDATE members SET name=?, grade=?, phone=?, email=?, member_type=?, branch_id=?, is_blocked=?, note=? WHERE id=?'
    );
    const selectByNo = db.prepare('SELECT * FROM members WHERE student_no=?');

    let created = 0;
    let updated = 0;
    for (const row of payload) {
      const studentNo = normalizeStudentNo(row.student_no || row.number);
      if (!studentNo) continue;
      const name = normalizeName(row.name || row.full_name);
      if (!name) continue;
      const existing = selectByNo.get(studentNo);
      const type = MEMBER_TYPES.includes(row.member_type) ? row.member_type : 'Öğrenci';
      const noteValue = normalizeNote(row.note);
      const blocked = toBoolean(row.is_blocked, false) ? 1 : 0;
      if (existing) {
        updateStmt.run(
          name,
          normalizeGrade(row.grade || row.class),
          row.phone || existing.phone,
          row.email || existing.email,
          type,
          branchId ?? existing.branch_id,
          blocked,
          noteValue ?? existing.note,
          existing.id
        );
        updated++;
      } else {
        insertStmt.run(
          studentNo,
          name,
          normalizeGrade(row.grade || row.class),
          row.phone || null,
          row.email || null,
          type,
          branchId,
          blocked,
          noteValue
        );
        created++;
      }
    }

    auditAction(req, 'members.sync_eokul', { url, created, updated, branch_id: branchId });
    res.json({ ok: true, created, updated, total: created + updated });
  } catch (error) {
    console.error('E-Okul senkronizasyon hatası:', error);
    res.status(500).json({ error: 'E-Okul senkronizasyonu başarısız', detail: error.message });
  }
}

export function memberHistory(req, res) {
  const memberId = Number(req.params.id);
  if (!memberId) return res.status(422).json({ error: 'Geçerli bir üye ID gerekli' });

  const member = db.prepare('SELECT * FROM members WHERE id=?').get(memberId);
  if (!member) return res.status(404).json({ error: 'Üye bulunamadı' });
  if (!canAccessBranch(req.user, member.branch_id)) {
    return res.status(403).json({ error: 'Şube yetkiniz yok' });
  }

  const loans = db
    .prepare(
      `SELECT l.*, b.title AS book_title, b.isbn AS isbn
       FROM loans l
       JOIN books b ON b.id = l.book_id
       WHERE l.member_id=?
       ORDER BY l.id DESC
       LIMIT 500`
    )
    .all(memberId);

  const now = Date.now();
  const active_loans = [];
  const returned_loans = [];
  for (const loan of loans) {
    const dueTs = loan.due_date ? Date.parse(loan.due_date) : NaN;
    const overdue = !loan.return_date && Number.isFinite(dueTs) && dueTs < now;
    const entry = { ...loan, overdue };
    if (loan.return_date) returned_loans.push(entry);
    else active_loans.push(entry);
  }

  const reservations = db
    .prepare(
      `SELECT r.*, b.title AS book_title, b.isbn AS isbn
       FROM reservations r
       JOIN books b ON b.id = r.book_id
       WHERE r.member_id=?
       ORDER BY r.id DESC
       LIMIT 200`
    )
    .all(memberId);

  const blockLogsRaw = db
    .prepare(
      `SELECT id, actor_email, action, meta, created_at
       FROM audit_logs
       WHERE action='members.update' AND meta LIKE ?
       ORDER BY id DESC
       LIMIT 100`
    )
    .all(`%/members/${memberId}%`);

  const block_logs = [];
  for (const row of blockLogsRaw) {
    try {
      const meta = JSON.parse(row.meta || '{}');
      const body = meta.body || {};
      if (Object.prototype.hasOwnProperty.call(body, 'is_blocked')) {
        block_logs.push({
          id: row.id,
          actor_email: row.actor_email,
          is_blocked: Boolean(body.is_blocked),
          note: body.note || null,
          created_at: row.created_at,
        });
      }
    } catch (err) {
      // yoksay
    }
  }

  const format = req.query.format;
  if (format === 'csv') {
    const header = ['Tip', 'Kitap', 'ISBN', 'İşlem Tarihi', 'Son Teslim', 'İade Tarihi', 'Durum', 'Not'];
    const lines = [header.join(',')];
    const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;

    for (const loan of loans) {
      lines.push(
        [
          'Ödünç',
          loan.book_title || '',
          loan.isbn || '',
          loan.loan_date || '',
          loan.due_date || '',
          loan.return_date || '',
          loan.return_date ? 'İade edildi' : loan.overdue ? 'Gecikmiş' : 'Aktif',
          '',
        ]
          .map(escape)
          .join(',')
      );
    }

    for (const r of reservations) {
      lines.push(
        [
          'Rezervasyon',
          r.book_title || '',
          r.isbn || '',
          r.created_at || '',
          '',
          '',
          r.status || '',
          '',
        ]
          .map(escape)
          .join(',')
      );
    }

    for (const log of block_logs) {
      lines.push(
        [
          'Blokaj',
          '',
          '',
          log.created_at || '',
          '',
          '',
          log.is_blocked ? 'Askıya alındı' : 'Askı kalktı',
          log.note || '',
        ]
          .map(escape)
          .join(',')
      );
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="uye-${memberId}-gecmis.csv"`
    );
    return res.send('\uFEFF' + lines.join('\n'));
  }

  res.json({
    member,
    active_loans,
    returned_loans,
    reservations,
    block_logs,
  });
}
