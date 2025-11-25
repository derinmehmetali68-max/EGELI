import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicBooksQuery } from '../src/routes/public.js';

test('buildPublicBooksQuery returns base query without filters', () => {
  const { sql, params } = buildPublicBooksQuery({});
  assert.match(sql, /FROM books WHERE 1=1/);
  assert.match(sql, /ORDER BY created_at DESC$/);
  assert.equal(params.length, 0);
});

test('buildPublicBooksQuery adds search term for q', () => {
  const { sql, params } = buildPublicBooksQuery({ q: 'harry' });
  assert.match(sql, /\(title LIKE \? OR author LIKE \? OR isbn LIKE \?\)/);
  assert.equal(params.length, 3);
  params.forEach(value => assert.equal(value, '%harry%'));
});

test('buildPublicBooksQuery handles category, author and available filters', () => {
  const { sql, params } = buildPublicBooksQuery({ category: 'Roman', author: 'Orwell', available: 'true' });
  assert.match(sql, /category LIKE \?/);
  assert.match(sql, /author LIKE \?/);
  assert.match(sql, /available > 0/);
  assert.deepEqual(params, ['%Roman%', '%Orwell%']);
});
