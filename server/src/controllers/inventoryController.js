import db from '../db.js';
import { buildBranchFilter, canAccessBranch } from '../utils/branch.js';

export function scanBook(req, res) {
  const { book_id, isbn, location } = req.body || {};
  if (!book_id && !isbn) return res.status(422).json({ error: 'book_id veya isbn gerekli' });

  let book = null;
  if (book_id) {
    book = db.prepare('SELECT id, branch_id FROM books WHERE id=?').get(book_id);
  } else if (isbn) {
    book = db.prepare('SELECT id, branch_id FROM books WHERE isbn=?').get(isbn);
    if (!book) {
      book = db
        .prepare('SELECT id, branch_id FROM books WHERE REPLACE(REPLACE(isbn, " ", ""), "-", "")=?')
        .get(String(isbn).replace(/[\s-]/g, ''));
    }
  }
  if (!book) return res.status(404).json({ error: 'Kitap bulunamadı' });

  if (!canAccessBranch(req.user, book.branch_id)) {
    return res.status(403).json({ error: 'Şube yetkiniz yok' });
  }

  const branchId = book.branch_id || null;
  const info = db
    .prepare('INSERT INTO inventory_scans(book_id, branch_id, location) VALUES (?,?,?)')
    .run(book.id, branchId, location || null);
  db.prepare('UPDATE books SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?').run(book.id);

  res.json({ ok: true, id: info.lastInsertRowid });
}

export function inventoryStatus(req, res) {
  const days = Number(req.query.days ?? 30);
  const maxRows = Number(req.query.limit ?? 200);
  const cutoff = Number.isFinite(days) && days > 0 ? days : 30;

  const { clause, params } = buildBranchFilter({
    user: req.user,
    queryValue: req.query.branch_id,
    column: 'b.branch_id',
  });

  const unseenSql = `
    SELECT b.id,b.title,b.isbn,b.branch_id,b.available,b.copies,b.last_seen_at
    FROM books b
    WHERE 1=1 ${clause}
      AND (b.last_seen_at IS NULL OR date(b.last_seen_at) < date('now', ?))
    ORDER BY b.last_seen_at IS NOT NULL, b.last_seen_at ASC
    LIMIT ?`;
  const unseen = db.prepare(unseenSql).all(...params, `-${cutoff} day`, maxRows);

  const summary = db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN last_seen_at IS NULL THEN 1 ELSE 0 END) AS never_seen,
        SUM(CASE WHEN last_seen_at IS NOT NULL AND date(last_seen_at) < date('now', ?) THEN 1 ELSE 0 END) AS stale
       FROM books b
       WHERE 1=1 ${clause}`
    )
    .get(...params, `-${cutoff} day`);

  const recentScans = db
    .prepare(
      `SELECT s.id, s.scanned_at, s.location, b.title, b.isbn
       FROM inventory_scans s
       JOIN books b ON b.id=s.book_id
       WHERE 1=1 ${clause.replace(/b\\.branch_id/g, 's.branch_id')}
       ORDER BY s.id DESC
       LIMIT 50`
    )
    .all(...params);

  res.json({
    summary: {
      total: Number(summary?.total ?? 0),
      never_seen: Number(summary?.never_seen ?? 0),
      stale: Number(summary?.stale ?? 0),
      cutoff_days: cutoff,
    },
    unseen,
    recent_scans: recentScans,
  });
}

export function duplicateIsbn(req, res) {
  const { clause, params } = buildBranchFilter({
    user: req.user,
    queryValue: req.query.branch_id,
    column: 'branch_id',
  });
  const sql = `
    SELECT isbn, GROUP_CONCAT(title, ' | ') AS titles, COUNT(*) AS cnt
    FROM books
    WHERE isbn IS NOT NULL AND isbn <> '' ${clause}
    GROUP BY isbn
    HAVING cnt > 1
    ORDER BY cnt DESC`;
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
}

export function stockGaps(req, res) {
  const { clause, params } = buildBranchFilter({
    user: req.user,
    queryValue: req.query.branch_id,
    column: 'b.branch_id',
  });
  const sql = `
    WITH active AS (
      SELECT book_id, COUNT(*) AS cnt FROM loans WHERE return_date IS NULL GROUP BY book_id
    )
    SELECT b.id, b.title, b.isbn, b.copies, b.available, IFNULL(a.cnt, 0) AS active_loans,
      (b.copies - IFNULL(a.cnt,0)) AS expected_available
    FROM books b
    LEFT JOIN active a ON a.book_id = b.id
    WHERE 1=1 ${clause}
      AND (b.available < (b.copies - IFNULL(a.cnt,0)) OR b.available > (b.copies - IFNULL(a.cnt,0)))
    ORDER BY b.id DESC
    LIMIT 200`;
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
}
