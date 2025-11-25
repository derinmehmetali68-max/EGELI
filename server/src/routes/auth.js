import { Router } from 'express';
import { register, login, refresh, logout, profile, updateProfile, updateTheme } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const r = Router();

r.post('/register', register);
r.post('/login', login);
r.post('/refresh', refresh);
r.post('/logout', logout);
r.get('/profile', requireAuth, profile);
r.put('/profile', requireAuth, updateProfile);
r.patch('/theme', requireAuth, updateTheme);

export default r;
