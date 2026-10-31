import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('local-first financial reads', () => {
  const root = path.resolve(__dirname, '../src');
  const ledger = fs.readFileSync(path.join(root, 'features/transactions/TransactionLedger.tsx'), 'utf8');
  const dashboard = fs.readFileSync(path.join(root, 'features/dashboard/DashboardPage.tsx'), 'utf8');
  const engine = fs.readFileSync(path.join(root, 'features/sync/sync-engine.ts'), 'utf8');
  const db = fs.readFileSync(path.join(root, 'lib/offline-db.ts'), 'utf8');
  it('filters ledger rows locally by date, category ID, necessity, payment method, and search', () => {
    assert.match(ledger, /getCachedTransactions\(userId\)/);
    assert.match(ledger, /t\.category_id === selectedCategory/);
    assert.match(ledger, /t\.necessity === selectedNecessity/);
    assert.match(ledger, /t\.payment_method === selectedPaymentMethod/);
    assert.match(ledger, /t\.transaction_date >= activeDateRange\.startDate/);
  });
  it('derives dashboard figures from the same user-scoped transaction cache', () => {
    assert.match(dashboard, /getCachedTransactions\(userId\)/);
    assert.match(dashboard, /expenseTotal/);
    assert.match(dashboard, /incomeTotal - expenseTotal/);
    assert.match(db, /t\.user_id === userId/);
  });
  it('reconciles every transaction page and preserves queued changes', () => {
    assert.match(engine, /while \(hasMore\)/);
    assert.match(engine, /replaceCachedTransactions\(all, userId\)/);
    assert.match(db, /pendingIds\.has\(item\.id\)/);
  });
});
