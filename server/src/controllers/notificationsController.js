import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export async function listUserNotifications(req, res) {
  try {
    const user = req.user;
    const notifications = db.prepare(`
      SELECT * FROM user_notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `).all(user.id);
    
    res.json({ items: notifications });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function markAsRead(req, res) {
  try {
    const user = req.user;
    const { id } = req.params;
    
    db.prepare(`
      UPDATE user_notifications
      SET read = 1
      WHERE id = ? AND user_id = ?
    `).run(id, user.id);
    
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function markAllAsRead(req, res) {
  try {
    const user = req.user;
    
    db.prepare(`
      UPDATE user_notifications
      SET read = 1
      WHERE user_id = ? AND read = 0
    `).run(user.id);
    
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function deleteNotification(req, res) {
  try {
    const user = req.user;
    const { id } = req.params;
    
    db.prepare(`
      DELETE FROM user_notifications
      WHERE id = ? AND user_id = ?
    `).run(id, user.id);
    
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function listSystemNotifications(req, res) {
  try {
    const notifications = db.prepare(`
      SELECT * FROM system_notifications
      ORDER BY created_at DESC
      LIMIT 100
    `).all();
    
    res.json({ items: notifications });
  } catch (error) {
    res.status(500).json({ items: [] });
  }
}

export async function markSystemAsRead(req, res) {
  try {
    const { id } = req.params;
    
    db.prepare(`
      UPDATE system_notifications
      SET read = 1
      WHERE id = ?
    `).run(id);
    
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function markAllSystemAsRead(req, res) {
  try {
    db.prepare(`
      UPDATE system_notifications
      SET read = 1
      WHERE read = 0
    `).run();
    
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function deleteSystemNotification(req, res) {
  try {
    const { id } = req.params;
    
    db.prepare(`
      DELETE FROM system_notifications
      WHERE id = ?
    `).run(id);
    
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
