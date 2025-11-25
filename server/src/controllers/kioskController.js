import db from '../db.js';
import { buildBranchFilter } from '../utils/branch.js';

export function listKioskLogs(req, res) {
  let sql = `SELECT kl.*, b.title AS book_title, b.isbn, m.name AS member_name, m.student_no
    FROM kiosk_logs kl
    LEFT JOIN books b ON b.id=kl.book_id
    LEFT JOIN members m ON m.id=kl.member_id
    WHERE 1=1`;
  
  const { clause, params } = buildBranchFilter({
    user: req.user,
    queryValue: req.query.branch_id,
    column: 'kl.branch_id',
  });
  sql += clause;
  
  // Filtreleme
  const filters = [];
  if (req.query.action_type) {
    sql += ' AND kl.action_type=?';
    filters.push(req.query.action_type);
  }
  if (req.query.success !== undefined) {
    sql += ' AND kl.success=?';
    filters.push(req.query.success === 'true' || req.query.success === '1' ? 1 : 0);
  }
  if (req.query.q) {
    sql += ' AND (b.title LIKE ? OR m.name LIKE ? OR b.isbn LIKE ? OR m.student_no LIKE ?)';
    const likeParam = `%${req.query.q}%`;
    filters.push(likeParam, likeParam, likeParam, likeParam);
  }
  
  sql += ' ORDER BY kl.id DESC LIMIT 500'; // En son 500 kayıt
  const rows = db.prepare(sql).all(...params, ...filters);
  res.json(rows);
}

export function getKioskStats(req, res) {
  try {
    const { clause, params } = buildBranchFilter({
      user: req.user,
      queryValue: req.query.branch_id,
      column: 'kl.branch_id',
    });
    
    const stats = {
      total: db.prepare(`SELECT COUNT(*) AS cnt FROM kiosk_logs kl WHERE 1=1${clause}`).get(...params).cnt || 0,
      successful: db.prepare(`SELECT COUNT(*) AS cnt FROM kiosk_logs kl WHERE kl.success=1${clause}`).get(...params).cnt || 0,
      failed: db.prepare(`SELECT COUNT(*) AS cnt FROM kiosk_logs kl WHERE kl.success=0${clause}`).get(...params).cnt || 0,
      checkouts: db.prepare(`SELECT COUNT(*) AS cnt FROM kiosk_logs kl WHERE kl.action_type='checkout'${clause}`).get(...params).cnt || 0,
      returns: db.prepare(`SELECT COUNT(*) AS cnt FROM kiosk_logs kl WHERE kl.action_type='return'${clause}`).get(...params).cnt || 0,
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Kiosk stats error:', error);
    res.status(500).json({ error: 'İstatistikler alınamadı', detail: error.message });
  }
}

