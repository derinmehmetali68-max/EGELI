import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getAiConfig, saveAiConfig } from '../controllers/aiController.js';

const r = Router();
r.use(requireAuth, requireRole('admin'));

r.get('/config', getAiConfig);
r.post('/config', saveAiConfig);

export default r;
