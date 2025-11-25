import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import os from 'os';
import supertest from 'supertest';

test('auth register, login, refresh and logout flow', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'library-auth-'));
  process.env.DB_PATH = path.join(tmpDir, 'auth.db');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'access-secret';
  process.env.REFRESH_SECRET = 'refresh-secret';

  await import('../src/seed.js');
  const { default: app } = await import('../src/app.js');
  const request = supertest(app);

  const registerRes = await request
    .post('/api/auth/register')
    .send({ email: 'staff1@school.local', password: 'Staff123!', display_name: 'Personel 1' })
    .expect(201);
  assert.equal(registerRes.body.user.email, 'staff1@school.local');
  assert.equal(registerRes.body.user.role, 'staff');
  assert.ok(registerRes.body.refresh_token);

  const accessToken = registerRes.body.access_token;
  await request
    .get('/api/auth/profile')
    .set('Authorization', `Bearer ${accessToken}`)
    .expect(200);

  const profileUpdate = await request
    .put('/api/auth/profile')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ display_name: 'Personel Bir' })
    .expect(200);
  assert.equal(profileUpdate.body.user.display_name, 'Personel Bir');

  const themeUpdate = await request
    .patch('/api/auth/theme')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ theme: 'dark' })
    .expect(200);
  assert.equal(themeUpdate.body.user.theme_preference, 'dark');

  const loginRes = await request
    .post('/api/auth/login')
    .send({ email: 'staff1@school.local', password: 'Staff123!' })
    .expect(200);
  assert.ok(loginRes.body.refresh_token);

  const refreshRes = await request
    .post('/api/auth/refresh')
    .send({ refresh_token: loginRes.body.refresh_token })
    .expect(200);
  assert.ok(refreshRes.body.access_token);

  await request
    .post('/api/auth/logout')
    .send({ refresh_token: refreshRes.body.refresh_token })
    .expect(200);

  await request
    .post('/api/auth/refresh')
    .send({ refresh_token: refreshRes.body.refresh_token })
    .expect(401);
});

test('inactive user cannot login', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'library-auth-inactive-'));
  process.env.DB_PATH = path.join(tmpDir, 'auth-inactive.db');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'access-secret';
  process.env.REFRESH_SECRET = 'refresh-secret';

  await import('../src/seed.js');
  const { default: db } = await import('../src/db.js');
  const { default: app } = await import('../src/app.js');
  const request = supertest(app);

  db.prepare(`UPDATE users SET is_active=0 WHERE email=?`).run('cumhuriyet');

  await request
    .post('/api/auth/login')
    .send({ email: 'cumhuriyet', password: '11062300' })
    .expect(403);
});
