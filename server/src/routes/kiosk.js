import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listKioskLogs, getKioskStats } from '../controllers/kioskController.js';

const r = Router();
r.use(requireAuth);

r.get('/logs', listKioskLogs);
r.get('/stats', getKioskStats);

export default r;

