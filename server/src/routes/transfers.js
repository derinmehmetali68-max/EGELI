import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createTransfer, listTransfers, updateTransfer } from '../controllers/transfersController.js';

const r = Router();
r.use(requireAuth);
r.get('/', listTransfers);
r.post('/', createTransfer);
r.put('/:id', updateTransfer);

export default r;
