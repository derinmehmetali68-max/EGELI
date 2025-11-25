import { Router } from 'express'; import { requireAuth, requireRole } from '../middleware/auth.js';
import { getSettings, setSettings } from '../controllers/settingsController.js';
const r=Router(); r.get('/', requireAuth, getSettings); r.post('/', requireAuth, requireRole('admin'), setSettings); export default r;
