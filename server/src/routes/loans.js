import { Router } from 'express'; import { requireAuth } from '../middleware/auth.js'; import { audit } from '../middleware/audit.js';
import { checkout, returnBook, listLoans, checkLoan, extendLoan } from '../controllers/loansController.js';
const r=Router(); r.use(requireAuth);
r.get('/', listLoans); r.post('/check', checkLoan); r.post('/checkout', audit('loans.checkout'), checkout); r.post('/:loanId/extend', audit('loans.extend'), extendLoan); r.post('/return', audit('loans.return'), returnBook);
export default r;
