import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import os from 'os';
import supertest from 'supertest';
import bcrypt from 'bcrypt';

test('branch scoping restricts staff views and allows admin overrides', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'library-db-'));
  process.env.DB_PATH = path.join(tmpDir, 'library.db');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
  process.env.REFRESH_SECRET = 'test-refresh';

  await import('../src/seed.js');
  const { default: db } = await import('../src/db.js');
  const { default: app } = await import('../src/app.js');
  const request = supertest(app);

  const mainBranch = db.prepare('SELECT id FROM branches WHERE code=?').get('MRZ').id;
  const secondBranch = db.prepare('SELECT id FROM branches WHERE code=?').get('ANZ').id;

  const staffHash = await bcrypt.hash('Staff123!', 10);
  db.prepare('INSERT INTO users(email,password_hash,role,branch_id) VALUES (?,?,?,?)')
    .run('staff@school.local', staffHash, 'staff', secondBranch);

  const branchTwoBook = db.prepare('INSERT INTO books(isbn,title,author,category,copies,available,branch_id) VALUES (?,?,?,?,?,?,?)')
    .run('9780000002', 'Branch Two Book', 'Author', 'Roman', 2, 2, secondBranch).lastInsertRowid;
  db.prepare('INSERT INTO books(isbn,title,author,category,copies,available,branch_id) VALUES (?,?,?,?,?,?,?)')
    .run('9780000003', 'Shared Resource', 'Shared', 'Genel', 1, 1, null);

  const branchTwoMember = db.prepare('INSERT INTO members(student_no,name,grade,phone,email,branch_id) VALUES (?,?,?,?,?,?)')
    .run('STF-1', 'Şube 2 Üye', '11B', null, 's2@example.com', secondBranch).lastInsertRowid;
  const mainMember = db.prepare('INSERT INTO members(student_no,name,grade,phone,email,branch_id) VALUES (?,?,?,?,?,?)')
    .run('MRZ-1', 'Merkez Üye', '10A', null, 'mrz@example.com', mainBranch).lastInsertRowid;

  const mainBookId = db.prepare('SELECT id FROM books WHERE branch_id=? LIMIT 1').get(mainBranch).id;

  db.prepare('INSERT INTO loans(book_id,member_id,due_date,branch_id) VALUES (?,?,?,?)')
    .run(branchTwoBook, branchTwoMember, '2025-12-01', secondBranch);
  db.prepare('INSERT INTO loans(book_id,member_id,due_date,branch_id) VALUES (?,?,?,?)')
    .run(mainBookId, mainMember, '2025-11-15', mainBranch);

  const branchTwoReservation = db.prepare('INSERT INTO reservations(book_id,member_id,branch_id,status) VALUES (?,?,?,?)')
    .run(branchTwoBook, branchTwoMember, secondBranch, 'active').lastInsertRowid;
  const mainReservation = db.prepare('INSERT INTO reservations(book_id,member_id,branch_id,status) VALUES (?,?,?,?)')
    .run(mainBookId, mainMember, mainBranch, 'active').lastInsertRowid;

  const staffLogin = await request.post('/api/auth/login').send({ email: 'staff@school.local', password: 'Staff123!' }).expect(200);
  const staffToken = staffLogin.body.access_token;

  const staffBooks = await request.get('/api/books').set('Authorization', `Bearer ${staffToken}`).expect(200);
  assert.ok(staffBooks.body.length >= 1);
  assert.ok(staffBooks.body.every(b => b.branch_id === null || b.branch_id === secondBranch));
  assert.ok(staffBooks.body.some(b => b.branch_id === secondBranch));

  const staffMembers = await request.get('/api/members').set('Authorization', `Bearer ${staffToken}`).expect(200);
  assert.ok(Array.isArray(staffMembers.body.items));
  assert.ok(staffMembers.body.items.every(m => m.branch_id === null || m.branch_id === secondBranch));
  assert.ok(staffMembers.body.items.some(m => m.branch_id === secondBranch));

  const staffLoans = await request.get('/api/loans').set('Authorization', `Bearer ${staffToken}`).expect(200);
  assert.ok(staffLoans.body.every(l => l.branch_id === secondBranch));
  assert.ok(staffLoans.body.length >= 1);

  const staffReservations = await request.get('/api/reservations').set('Authorization', `Bearer ${staffToken}`).expect(200);
  assert.ok(staffReservations.body.every(r => r.branch_id === secondBranch));
  assert.ok(staffReservations.body.some(r => r.id === branchTwoReservation));

  await request.delete(`/api/reservations/${mainReservation}`).set('Authorization', `Bearer ${staffToken}`).expect(403);

  const adminLogin = await request.post('/api/auth/login').send({ email: 'cumhuriyet', password: '11062300' }).expect(200);
  const adminToken = adminLogin.body.access_token;

  const adminAllBooks = await request
    .get('/api/books')
    .query({ branch_id: 'all' })
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(adminAllBooks.body.some(b => b.branch_id === mainBranch));
  assert.ok(adminAllBooks.body.some(b => b.branch_id === secondBranch));

  const adminLoans = await request
    .get('/api/loans')
    .query({ branch_id: 'all' })
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(adminLoans.body.some(l => l.branch_id === mainBranch));
  assert.ok(adminLoans.body.some(l => l.branch_id === secondBranch));

  const adminReservations = await request
    .get('/api/reservations')
    .query({ branch_id: 'all' })
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(adminReservations.body.some(r => r.branch_id === mainBranch));
  assert.ok(adminReservations.body.some(r => r.branch_id === secondBranch));
});
