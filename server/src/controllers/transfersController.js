import db from '../db.js';
import dayjs from 'dayjs';
import { canAccessBranch, buildBranchFilter, resolveBranchForWrite } from '../utils/branch.js';

const ALLOWED_STATUS = new Set(['requested', 'approved', 'in_transit', 'completed', 'cancelled']);

export function listTransfers(req, res) {
  let sql = `SELECT t.*, b.title AS book_title, b.isbn
    FROM transfers t
    JOIN books b ON b.id = t.book_id
    WHERE 1=1`;
  const { clause, params } = buildBranchFilter({
    user: req.user,
    queryValue: req.query.branch_id,
    column: 't.from_branch_id',
  });
  sql += clause;
  sql += ' ORDER BY t.id DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
}

export function createTransfer(req, res) {
  const { book_id, to_branch_id, note } = req.body || {};
  const bookId = Number(book_id);
  const toBranchId = Number(to_branch_id);
  if (!bookId || !toBranchId) return res.status(422).json({ error: 'book_id ve to_branch_id zorunlu' });

  const book = db.prepare('SELECT id, branch_id FROM books WHERE id=?').get(bookId);
  if (!book) return res.status(404).json({ error: 'Kitap bulunamadı' });
  if (!canAccessBranch(req.user, book.branch_id)) {
    return res.status(403).json({ error: 'Kitabın şubesine erişim yok' });
  }

  const fromBranchId = book.branch_id ?? resolveBranchForWrite(req.user, null);
  const info = db
    .prepare(
      'INSERT INTO transfers(book_id, from_branch_id, to_branch_id, status, note) VALUES (?,?,?,?,?)'
    )
    .run(bookId, fromBranchId, toBranchId, 'requested', note || null);
  res.json({ ok: true, id: info.lastInsertRowid });
}

export function updateTransfer(req, res) {
  const id = Number(req.params.id);
  const { status, note } = req.body || {};
  const transfer = db.prepare('SELECT * FROM transfers WHERE id=?').get(id);
  if (!transfer) return res.status(404).json({ error: 'Kayıt bulunamadı' });
  if (!canAccessBranch(req.user, transfer.from_branch_id)) {
    return res.status(403).json({ error: 'Şube yetkiniz yok' });
  }
  if (status && !ALLOWED_STATUS.has(status)) {
    return res.status(422).json({ error: 'Geçersiz durum' });
  }
  const newStatus = status || transfer.status;
  db.prepare('UPDATE transfers SET status=?, note=?, updated_at=? WHERE id=?').run(
    newStatus,
    note ?? transfer.note ?? null,
    dayjs().format('YYYY-MM-DDTHH:mm:ss'),
    id
  );
  res.json({ ok: true });
}
