import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listUsers, createUser, updateUser, deleteUser } from '../controllers/usersController.js';

const r = Router();
r.use(requireAuth);
r.get('/', listUsers);
r.post('/', createUser);
r.put('/:id', updateUser);
r.delete('/:id', deleteUser);

export default r;

