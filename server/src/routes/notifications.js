import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  listSystemNotifications,
  markSystemAsRead,
  markAllSystemAsRead,
  deleteSystemNotification,
} from '../controllers/notificationsController.js';

const r = Router();

// User notifications
r.get('/', requireAuth, listUserNotifications);
r.post('/:id/read', requireAuth, markAsRead);
r.post('/read-all', requireAuth, markAllAsRead);
r.delete('/:id', requireAuth, deleteNotification);

// System notifications
r.get('/system', requireAuth, listSystemNotifications);
r.post('/system/:id/read', requireAuth, markSystemAsRead);
r.post('/system/read-all', requireAuth, markAllSystemAsRead);
r.delete('/system/:id', requireAuth, deleteSystemNotification);

export default r;

