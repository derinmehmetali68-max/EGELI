import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();

r.get('/', requireAuth, (req, res) => {
  const branches = db.prepare('SELECT id,name,code FROM branches ORDER BY name ASC').all();
  const userBranch = req.user?.branch_id ?? null;
  if (req.user?.role === 'admin') {
    return res.json({ items: branches, user_branch: userBranch });
  }
  const filtered = userBranch ? branches.filter(b => b.id === userBranch) : [];
  res.json({ items: filtered, user_branch: userBranch });
});

export default r;
