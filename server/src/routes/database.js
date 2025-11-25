import path from 'path';
import multer from 'multer';
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listBackups,
  createBackup,
  uploadBackup,
  restoreBackup,
  deleteBackup,
  downloadBackupFile,
  resetDatabase,
} from '../controllers/databaseController.js';

const uploadTempDir = path.join(process.cwd(), 'server', 'uploads', 'backups');
const upload = multer({ dest: uploadTempDir });

const r = Router();
r.use(requireAuth, requireRole('admin'));

r.get('/backups', listBackups);
r.post('/backups', createBackup);
r.post('/backups/upload', upload.single('backup'), uploadBackup);
r.post('/backups/:name/restore', restoreBackup);
r.delete('/backups/:name', deleteBackup);
r.get('/backups/:name/download', downloadBackupFile);
r.post('/reset', resetDatabase);

export default r;
