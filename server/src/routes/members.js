import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { requireAuth } from '../middleware/auth.js';
import { audit } from '../middleware/audit.js';
import {
  listMembers,
  createMember,
  updateMember,
  deleteMember,
  exportMembersCsv,
  importMembersCsv,
  exportMembersXlsx,
  importMembersXlsx,
  normalizeAllMembers,
  memberHistory,
  syncEokul,
} from '../controllers/membersController.js';
import { qrMember } from '../controllers/barcodeController.js';
import { memberCardPdf, membersListPdf, membersQrSheetPdf } from '../controllers/reportsController.js';

const r = Router();
r.get('/qr/:id.png', qrMember);
r.get('/:id/card.pdf', requireAuth, memberCardPdf);
r.get('/export.csv', requireAuth, exportMembersCsv);
r.get('/export.xlsx', requireAuth, exportMembersXlsx);
r.get('/export.pdf', requireAuth, membersListPdf);
r.get('/qr.pdf', requireAuth, membersQrSheetPdf);

const upload = multer({ dest: path.join(process.cwd(), 'server', 'uploads', 'imports') });
r.post('/import', requireAuth, upload.single('file'), importMembersCsv);
r.post('/import.xlsx', requireAuth, upload.single('file'), importMembersXlsx);
r.post('/eokul/sync', requireAuth, audit('members.sync_eokul'), syncEokul);

r.use(requireAuth);
r.get('/', listMembers);
r.get('/:id/history', memberHistory);
r.post('/', audit('members.create'), createMember);
r.post('/normalize-all', audit('members.normalize'), normalizeAllMembers);
r.put('/:id', audit('members.update'), updateMember);
r.delete('/:id', audit('members.delete'), deleteMember);
export default r;
