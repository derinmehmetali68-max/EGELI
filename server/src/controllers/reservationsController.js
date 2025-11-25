import db from '../db.js';
import { buildBranchFilter, resolveBranchForWrite, canAccessBranch } from '../utils/branch.js';

export function listReservations(req, res) {
  let sql = `SELECT r.*, b.title AS book_title, m.name AS member_name
    FROM reservations r
    JOIN books b ON b.id = r.book_id
    JOIN members m ON m.id = r.member_id
    WHERE 1=1`;
  const { clause, params } = buildBranchFilter({
    user: req.user,
    queryValue: req.query.branch_id,
    column: 'r.branch_id',
  });
  sql += clause;
  sql += ' ORDER BY r.id DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
}

export function createReservation(req, res) {
  const { book_id, member_id } = req.body;
  const book = db.prepare('SELECT id, branch_id FROM books WHERE id=?').get(book_id);
  if (!book) return res.status(404).json({ error: 'Kitap bulunamadı' });
  if (!canAccessBranch(req.user, book.branch_id)) return res.status(403).json({ error: 'Şube yetkiniz yok' });

  const member = db.prepare('SELECT id, branch_id FROM members WHERE id=?').get(member_id);
  if (!member) return res.status(404).json({ error: 'Üye bulunamadı' });
  if (!canAccessBranch(req.user, member.branch_id)) return res.status(403).json({ error: 'Şube yetkiniz yok' });

  const branchId = book.branch_id ?? member.branch_id ?? resolveBranchForWrite(req.user, null);
  const info = db
    .prepare('INSERT INTO reservations(book_id,member_id,branch_id,status) VALUES (?,?,?,?)')
    .run(book_id, member_id, branchId, 'active');
  res.json({ ok: true, id: info.lastInsertRowid });
}

export function cancelReservation(req, res) {
  const { id } = req.params;
  const reservation = db.prepare('SELECT * FROM reservations WHERE id=?').get(id);
  if (!reservation) return res.status(404).json({ error: 'Kayıt bulunamadı' });
  if (!canAccessBranch(req.user, reservation.branch_id)) return res.status(403).json({ error: 'Şube yetkiniz yok' });
  if (reservation.status !== 'cancelled') {
    db.prepare('UPDATE reservations SET status=? WHERE id=?').run('cancelled', id);
  }
  res.json({ ok: true });
}
