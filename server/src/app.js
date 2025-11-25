import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';

import authRoute from './routes/auth.js';
import booksRoute from './routes/books.js';
import membersRoute from './routes/members.js';
import loansRoute from './routes/loans.js';
import reservationsRoute from './routes/reservations.js';
import reportsRoute from './routes/reports.js';
import settingsRoute from './routes/settings.js';
import notifyRoute from './routes/notify.js';
import notificationsRoute from './routes/notifications.js';
import publicRoute from './routes/public.js';
import toolsRoute from './routes/tools.js';
import branchesRoute from './routes/branches.js';
import kioskRoute from './routes/kiosk.js';
import inventoryRoute from './routes/inventory.js';
import transfersRoute from './routes/transfers.js';
import usersRoute from './routes/users.js';
import databaseRoute from './routes/database.js';
import aiRoute from './routes/ai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    },
  })
);
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Rate limit devre dışı - geliştirme ortamı için
// const limiter = rateLimit({ windowMs: 60 * 1000, max: 10000 });
// app.use(limiter);

app.use('/api/auth', authRoute);
app.use('/api/books', booksRoute);
app.use('/api/members', membersRoute);
app.use('/api/loans', loansRoute);
app.use('/api/reservations', reservationsRoute);
app.use('/api/reports', reportsRoute);
app.use('/api/settings', settingsRoute);
app.use('/api/notify', notifyRoute);
app.use('/api/notifications', notificationsRoute);
app.use('/api/public', publicRoute);
app.use('/api/tools', toolsRoute);
app.use('/api/branches', branchesRoute);
app.use('/api/kiosk', kioskRoute);
app.use('/api/inventory', inventoryRoute);
app.use('/api/transfers', transfersRoute);
app.use('/api/users', usersRoute);
app.use('/api/database', databaseRoute);
app.use('/api/ai', aiRoute);

app.get('/api/health', (_, res) => res.json({ ok: true }));

// Production'da frontend'i serve et
const clientDistPath = path.join(__dirname, '..', '..', 'client', 'dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    }
  });
} else {
  app.get('/', (_, res) => res.json({ app: 'Library Automation API', status: 'ok', links: { health: '/api/health', api: '/api' } }));
}

export default app;
