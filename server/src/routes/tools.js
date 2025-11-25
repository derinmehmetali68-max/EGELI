import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { booksTemplateXlsx, membersTemplateXlsx, isbnBulkTemplateXlsx, downloadBackup } from '../controllers/toolsController.js';

const r = Router();
r.get('/templates/books.xlsx', requireAuth, booksTemplateXlsx);
r.get('/templates/members.xlsx', requireAuth, membersTemplateXlsx);
r.get('/templates/isbn-bulk.xlsx', requireAuth, isbnBulkTemplateXlsx);
r.get('/backup/db', requireAuth, requireRole('admin'), downloadBackup);
export default r;
