import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  popularBooks,
  overdueReportPdf,
  exportLoansCsv,
  circulationMonthly,
  circulationMonthlyCsv,
  circulationMonthlyPdf,
  booksListPdf,
  loansListPdf,
} from '../controllers/reportsController.js';

const r = Router();
r.use(requireAuth);
r.get('/popular', popularBooks);
r.get('/overdue.pdf', overdueReportPdf);
r.get('/loans.csv', exportLoansCsv);
r.get('/loans.pdf', loansListPdf);
r.get('/circulation', circulationMonthly);
r.get('/circulation.csv', circulationMonthlyCsv);
r.get('/circulation.pdf', circulationMonthlyPdf);
r.get('/books.pdf', booksListPdf);

export default r;
