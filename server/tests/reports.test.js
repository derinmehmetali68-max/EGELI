import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import os from 'os';
import supertest from 'supertest';

test('monthly circulation endpoints and notifications', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'library-reports-'));
  process.env.DB_PATH = path.join(tmpDir, 'reports.db');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'access-secret';
  process.env.REFRESH_SECRET = 'refresh-secret';
  process.env.SMTP_TRANSPORT = 'json';
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_FROM = 'Kütüphane <test@example.com>';

  await import('../src/seed.js');
  const { default: db } = await import('../src/db.js');
  const { default: app } = await import('../src/app.js');
  const request = supertest(app);

  const branch = db.prepare('SELECT id FROM branches WHERE code=?').get('MRZ').id;
  const bookId = db
    .prepare(
      'INSERT INTO books(isbn,title,author,category,copies,available,branch_id) VALUES (?,?,?,?,?,?,?)'
    )
    .run('9780001111', 'Test Kitap', 'Yazar', 'Kategori', 3, 3, branch).lastInsertRowid;
  const memberId = db
    .prepare('INSERT INTO members(student_no,name,grade,phone,email,branch_id) VALUES (?,?,?,?,?,?)')
    .run('T-1', 'Test Üye', '10A', null, 'uye@example.com', branch).lastInsertRowid;

  const insertLoan = db.prepare(
    'INSERT INTO loans(book_id,member_id,loan_date,due_date,return_date,branch_id) VALUES (?,?,?,?,?,?)'
  );
  insertLoan.run(bookId, memberId, '2025-02-01', '2000-01-01', null, branch);
  insertLoan.run(bookId, memberId, '2025-02-02', '2025-02-03', '2025-02-10', branch);
  insertLoan.run(bookId, memberId, '2025-02-05', '2025-02-20', '2025-02-18', branch);
  insertLoan.run(bookId, memberId, '2025-01-15', '2025-01-20', '2025-01-21', branch);

  const loginRes = await request
    .post('/api/auth/login')
    .send({ email: 'cumhuriyet', password: '11062300' })
    .expect(200);
  const token = loginRes.body.access_token;

  const circulation = await request
    .get('/api/reports/circulation')
    .query({ month: '2025-02', branch_id: 'all' })
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(circulation.body.month, '2025-02');
  assert.equal(circulation.body.totals.loans, 3);
  assert.equal(circulation.body.totals.returns, 2);
  assert.equal(circulation.body.totals.overdue_open, 1);
  assert.equal(circulation.body.totals.overdue_closed, 1);
  assert.ok(Array.isArray(circulation.body.items));
  assert.ok(circulation.body.items.every(item => item.loan_day.startsWith('2025-02')));

  const csvRes = await request
    .get('/api/reports/circulation.csv')
    .query({ month: '2025-02', branch_id: 'all' })
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(csvRes.headers['content-type'].split(';')[0], 'text/csv');
  assert.ok(csvRes.text.includes('2025-02-01'));

  const pdfRes = await request
    .get('/api/reports/circulation.pdf')
    .query({ month: '2025-02', branch_id: 'all' })
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(pdfRes.headers['content-type'], 'application/pdf');

  const notifyRes = await request
    .post('/api/notify/overdue')
    .query({ branch_id: 'all' })
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.equal(notifyRes.body.sent, 1);
});
