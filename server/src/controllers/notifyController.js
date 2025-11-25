import db from '../db.js';
import { makeTransport } from '../utils/mailer.js';
import { buildBranchFilter } from '../utils/branch.js';
import { sendSms } from '../utils/sms.js';

function getSettingsMap(keys) {
  if (!keys.length) return {};
  const placeholders = keys.map(() => '?').join(',');
  const rows = db.prepare(`SELECT key,value FROM settings WHERE key IN (${placeholders})`).all(...keys);
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

function resolveSmtpConfig() {
  const map = getSettingsMap(['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_transport']);
  const host = map.smtp_host || process.env.SMTP_HOST;
  if (!host) return null;
  return {
    host,
    port: map.smtp_port ? Number(map.smtp_port) : undefined,
    secure: map.smtp_secure ? ['1', 'true', 'yes', 'on'].includes(String(map.smtp_secure).toLowerCase()) : undefined,
    user: map.smtp_user || process.env.SMTP_USER,
    pass: map.smtp_pass || process.env.SMTP_PASS,
    from: map.smtp_from || process.env.SMTP_FROM || 'Kütüphane <noreply@local>',
    transport: map.smtp_transport || process.env.SMTP_TRANSPORT,
  };
}

export async function sendOverdueEmails(req, res) {
  const smtpConfig = resolveSmtpConfig();
  const transporter = makeTransport(smtpConfig || {});
  if (!transporter) return res.status(400).json({ error: 'SMTP yapılandırılmamış' });

  let sql = `SELECT l.id,l.due_date,l.branch_id,m.email,m.name,b.title
    FROM loans l JOIN members m ON m.id=l.member_id JOIN books b ON b.id=l.book_id
    WHERE l.return_date IS NULL AND DATE(l.due_date) < DATE('now') AND m.email IS NOT NULL`;
  const { clause, params } = buildBranchFilter({
    user: req.user,
    queryValue: req.query?.branch_id,
    column: 'l.branch_id',
  });
  sql += clause;
  sql += ' ORDER BY l.due_date ASC';
  const rows = db.prepare(sql).all(...params);

  if (!rows.length) {
    return res.json({ sent: 0, skipped: 0 });
  }

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await transporter.sendMail({
        from: smtpConfig?.from,
        to: row.email,
        subject: 'Geciken iade bildirimi',
        text: `${row.name}, "${row.title}" kitabının iade tarihi geçti (${row.due_date}). Lütfen iade ediniz.`,
      });
      sent++;
    } catch {
      failed++;
    }
  }
  res.json({ sent, failed });
}

export async function sendReservationReady(req, res) {
  const reservationId = Number(req.params.id || req.body?.reservation_id);
  if (!reservationId) return res.status(422).json({ error: 'reservation_id gerekli' });

  const reservation = db
    .prepare(
      `SELECT r.*, m.email AS member_email, m.name AS member_name, b.title AS book_title
       FROM reservations r
       JOIN members m ON m.id = r.member_id
       JOIN books b ON b.id = r.book_id
       WHERE r.id=?`
    )
    .get(reservationId);
  if (!reservation) return res.status(404).json({ error: 'Rezervasyon bulunamadı' });

  const { clause, params } = buildBranchFilter({
    user: req.user,
    queryValue: reservation.branch_id,
    column: 'r.branch_id',
  });
  if (clause && clause.trim() !== ' WHERE 1=1') {
    // buildBranchFilter sadece kullanabilmek için sorgu gerektiriyor; burada şube yetkisini kontrol edelim
    const allowed = db
      .prepare(`SELECT r.id FROM reservations r WHERE r.id=? ${clause.replace('WHERE 1=1', 'AND 1=1')}`)
      .get(reservationId, ...params);
    if (!allowed) return res.status(403).json({ error: 'Şube yetkiniz yok' });
  }

  if (!reservation.member_email) {
    return res.status(400).json({ error: 'Üyenin e-posta adresi yok' });
  }

  const smtpConfig = resolveSmtpConfig();
  const transporter = makeTransport(smtpConfig || {});
  if (!transporter) return res.status(400).json({ error: 'SMTP yapılandırılmamış' });

  await transporter.sendMail({
    from: smtpConfig?.from,
    to: reservation.member_email,
    subject: 'Rezervasyonunuz hazır',
    text: `${reservation.member_name}, "${reservation.book_title}" kitabınız teslim almaya hazır. Lütfen kütüphaneye uğrayın.`,
  });

  res.json({ ok: true });
}

export async function sendUpcomingDue(req, res) {
  const smtpConfig = resolveSmtpConfig();
  const transporter = makeTransport(smtpConfig || {});
  if (!transporter) return res.status(400).json({ error: 'SMTP yapılandırılmamış' });
  const days = Number(req.query.days ?? 2);
  const { clause, params } = buildBranchFilter({
    user: req.user,
    queryValue: req.query?.branch_id,
    column: 'l.branch_id',
  });
  const sql = `
    SELECT l.id,l.due_date,l.branch_id,m.email,m.phone,m.name,b.title
    FROM loans l
    JOIN members m ON m.id=l.member_id
    JOIN books b ON b.id=l.book_id
    WHERE l.return_date IS NULL
      AND date(l.due_date) <= date('now', ?)
      AND m.email IS NOT NULL
      ${clause}
    ORDER BY l.due_date ASC
  `;
  const rows = db.prepare(sql).all(`+${days} day`, ...params);
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await transporter.sendMail({
        from: smtpConfig?.from,
        to: row.email,
        subject: 'Son teslim tarihi yaklaşıyor',
        text: `${row.name}, "${row.title}" kitabınızın son teslim tarihi ${row.due_date}. Lütfen gecikme olmadan iade edin.`,
      });
      sent++;
    } catch {
      failed++;
    }
  }
  res.json({ sent, failed, total: rows.length, days });
}

export async function sendSmsOverdue(req, res) {
  const { clause, params } = buildBranchFilter({
    user: req.user,
    queryValue: req.query?.branch_id,
    column: 'l.branch_id',
  });
  const sql = `
    SELECT l.id,l.due_date,m.phone,m.name,b.title
    FROM loans l
    JOIN members m ON m.id=l.member_id
    JOIN books b ON b.id=l.book_id
    WHERE l.return_date IS NULL
      AND date(l.due_date) < date('now')
      AND m.phone IS NOT NULL
      ${clause}
    ORDER BY l.due_date ASC
  `;
  const rows = db.prepare(sql).all(...params);
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const resp = await sendSms({
      to: row.phone,
      message: `${row.name}, "${row.title}" kitabının iadesi gecikti (${row.due_date}). Lütfen iade edin.`,
    });
    if (resp.ok) sent++;
    else failed++;
  }
  res.json({ sent, failed, total: rows.length });
}
