import { Router } from 'express'; import { requireAuth } from '../middleware/auth.js'; import { audit } from '../middleware/audit.js';
import { listReservations, createReservation, cancelReservation } from '../controllers/reservationsController.js';
const r=Router(); r.use(requireAuth);
r.get('/', listReservations); r.post('/', audit('reservations.create'), createReservation); r.delete('/:id', audit('reservations.cancel'), cancelReservation);
export default r;
