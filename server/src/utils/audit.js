import db from '../db.js';

export function auditAction(req, action, meta = {}) {
  try {
    const actorEmail = req.user?.email || req.body?.email || 'anonymous';
    const metaData = {
      ...meta,
      ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      method: req.method,
      url: req.originalUrl || req.url,
    };
    db.prepare('INSERT INTO audit_logs(actor_email,action,meta) VALUES (?,?,?)')
      .run(actorEmail, action, JSON.stringify(metaData));
  } catch (error) {
    console.error('[audit] Error logging action:', error.message);
  }
}

