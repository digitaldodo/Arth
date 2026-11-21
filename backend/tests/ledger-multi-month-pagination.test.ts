import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { v7 as uuidv7 } from 'uuid';
import { buildApp } from '../src/app.js';
import { InMemoryTransactionService } from '../src/modules/transactions/transaction.service.js';
import { InMemoryCategoryService } from '../src/modules/categories/category.service.js';
import type { FastifyInstance } from 'fastify';

describe('Backend Multi-Month Pagination & Payment Method Filters', () => {
  let app: FastifyInstance;
  let service: InMemoryTransactionService;
  let categoryService: InMemoryCategoryService;

  const user = {
    userId: '99999999-9999-7999-8999-999999999999',
    email: 'user-multimonth@example.com',
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  before(async () => {
    service = new InMemoryTransactionService();
    categoryService = new InMemoryCategoryService();
    service.seedDefaultCategories(user.userId);
    categoryService.seedDefaults(user.userId);

    const mockVerifier = async (token: string) => {
      if (token === 'user-token') return user;
      throw new Error('Invalid token');
    };

    app = await buildApp(
      { env: 'test' },
      mockVerifier,
      service,
      categoryService
    );
    await app.ready();

    // Seed 60 transactions: 25 in Nov 2026, 20 in Oct 2026, 15 in Sep 2026
    const defaultExpenseCat = service.categories.find((c) => c.user_id === user.userId && c.type === 'expense');
    const defaultIncomeCat = service.categories.find((c) => c.user_id === user.userId && c.type === 'income');

    for (let i = 0; i < 60; i++) {
      let month = 11;
      let day = Math.max(1, 28 - (i % 25));

      if (i >= 45) {
        month = 9;
        day = Math.max(1, 30 - ((i - 45) % 28));
      } else if (i >= 25) {
        month = 10;
        day = Math.max(1, 31 - ((i - 25) % 28));
      }

      const dateStr = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const method = i % 3 === 0 ? 'upi' : i % 3 === 1 ? 'online' : 'cash';
      const isIncome = i % 6 === 0;
      const cat = isIncome ? defaultIncomeCat : defaultExpenseCat;

      await service.createTransaction(user.userId, {
        id: uuidv7(),
        amount_paise: (i + 1) * 10000,
        type: isIncome ? 'income' : 'expense',
        category_id: cat ? cat.id : undefined,
        transaction_date: dateStr,
        payment_method: method,
        necessity: isIncome ? null : 'essential',
        description: `Txn #${i} in month ${month}`,
        recorded_at: `${dateStr}T10:${String(i % 60).padStart(2, '0')}:00.000Z`,
      });
    }
  });

  test('1. GET /api/v1/transactions with no date filter returns page 1 of all time (50 items) with total_count=60 and has_more=true', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions?page=1&page_size=50&sort_by=date_desc',
      headers: { authorization: 'Bearer user-token' },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.page, 1);
    assert.equal(body.page_size, 50);
    assert.equal(body.total_count, 60);
    assert.equal(body.has_more, true);
    assert.equal(body.items.length, 50);

    // Newest record should be in November
    assert.ok(body.items[0].transaction_date.startsWith('2026-11'));
  });

  test('2. Page 2 returns the remaining 10 older transactions from October and September with has_more=false', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions?page=2&page_size=50&sort_by=date_desc',
      headers: { authorization: 'Bearer user-token' },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.page, 2);
    assert.equal(body.total_count, 60);
    assert.equal(body.has_more, false);
    assert.equal(body.items.length, 10);

    // Oldest records in page 2 should be in September
    assert.ok(body.items[body.items.length - 1].transaction_date.startsWith('2026-09'));
  });

  test('3. Combining Page 1 and Page 2 yields exactly 60 distinct transactions with zero overlap', async () => {
    const res1 = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions?page=1&page_size=50&sort_by=date_desc',
      headers: { authorization: 'Bearer user-token' },
    });
    const res2 = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions?page=2&page_size=50&sort_by=date_desc',
      headers: { authorization: 'Bearer user-token' },
    });

    const items1 = res1.json().items;
    const items2 = res2.json().items;
    const ids = new Set(items1.map((t: { id: string }) => t.id));

    for (const item of items2) {
      assert.ok(!ids.has(item.id), `Transaction ${item.id} must not appear on both pages`);
      ids.add(item.id);
    }
    assert.equal(ids.size, 60);
  });

  test('4. GET /api/v1/transactions?payment_method=upi filters to UPI transactions across all months', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions?payment_method=upi&page=1&page_size=50',
      headers: { authorization: 'Bearer user-token' },
    });

    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.items.length > 0);
    assert.ok(body.items.every((t: { payment_method: string }) => t.payment_method === 'upi'));

    // Should contain records from multiple months
    const hasNov = body.items.some((t: { transaction_date: string }) => t.transaction_date.startsWith('2026-11'));
    const hasOct = body.items.some((t: { transaction_date: string }) => t.transaction_date.startsWith('2026-10'));
    assert.ok(hasNov, 'Must contain November UPI transactions');
    assert.ok(hasOct, 'Must contain October UPI transactions');
  });

  test('5. Rejects invalid payment_method with 400 Bad Request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions?payment_method=bitcoin',
      headers: { authorization: 'Bearer user-token' },
    });

    assert.equal(res.statusCode, 400);
    assert.match(res.json().message, /Query payment_method must be/);
  });
});
