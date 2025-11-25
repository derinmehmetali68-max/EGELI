import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { scanBook, inventoryStatus, duplicateIsbn } from '../controllers/inventoryController.js';

const r = Router();
r.use(requireAuth);
r.post('/scan', scanBook);
r.get('/status', inventoryStatus);
r.get('/duplicates', duplicateIsbn);

export default r;
