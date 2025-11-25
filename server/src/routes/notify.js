import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { sendOverdueEmails, sendReservationReady, sendUpcomingDue, sendSmsOverdue } from '../controllers/notifyController.js';

const r = Router();
r.post('/overdue', requireAuth, requireRole('admin'), sendOverdueEmails);
r.post('/overdue/sms', requireAuth, requireRole('admin'), sendSmsOverdue);
r.post('/upcoming', requireAuth, requireRole('admin'), sendUpcomingDue);
r.post('/reservations/:id/ready', requireAuth, sendReservationReady);
r.post('/reservations/ready', requireAuth, sendReservationReady);

export default r;
