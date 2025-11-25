import test from 'node:test';
import assert from 'node:assert/strict';
import { planBulkIsbnRows } from '../src/controllers/booksController.js';

test('planBulkIsbnRows skips missing ISBN and deduplicates input', () => {
  const rows = [
    { isbn: '', copies: 1 },
    { isbn: '978-975-0808103', copies: 2 },
    { isbn: '9789750808103', copies: 3 },
  ];
  const lookup = () => null;
  const { plan } = planBulkIsbnRows(rows, lookup);
  assert.equal(plan.length, 3);
  assert.deepEqual(plan[0], { row: 1, status: 'skip', reason: 'missing_isbn' });
  assert.equal(plan[1].status, 'create');
  assert.equal(plan[1].isbn, '9789750808103');
  assert.equal(plan[1].copies, 2);
  assert.equal(plan[2].status, 'exists');
  assert.equal(plan[2].reason, 'duplicate_in_upload');
});

test('planBulkIsbnRows marks existing catalog entries as exists', () => {
  const rows = [{ isbn: '9789750808103', copies: 1 }];
  const lookup = () => 42;
  const { plan } = planBulkIsbnRows(rows, lookup);
  assert.equal(plan[0].status, 'exists');
  assert.equal(plan[0].id, 42);
  assert.equal(plan[0].reason, 'already_in_catalog');
});
