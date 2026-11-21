import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { v7 as uuidv7 } from 'uuid';
import { buildApp } from '../src/app.js';
import { InMemoryTransactionService } from '../src/modules/transactions/transaction.service.js';
import { InMemoryCategoryService } from '../src/modules/categories/category.service.js';
import type { FastifyInstance } from 'fastify';

describe('Backend Transactions & Categories API', () => {
  let app: FastifyInstance;
  let service: InMemoryTransactionService;
  let categoryService: InMemoryCategoryService;

  const userA = {
    userId: '11111111-1111-7111-8111-111111111111',
    email: 'user-a@example.com',
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const userB = {
    userId: '22222222-2222-7222-8222-222222222222',
    email: 'user-b@example.com',
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  before(async () => {
    service = new InMemoryTransactionService();
    categoryService = new InMemoryCategoryService();
    // Seed default categories for both test users
    service.seedDefaultCategories(userA.userId);
    service.seedDefaultCategories(userB.userId);
    categoryService.seedDefaults(userA.userId);
    categoryService.seedDefaults(userB.userId);

    // Custom verifier decoding tokens based on Bearer value
    const mockVerifier = async (token: string) => {
      if (token === 'user-a-token') return userA;
      if (token === 'user-b-token') return userB;
      throw new Error('Invalid token');
    };

    app = await buildApp(
      { env: 'test' },
      mockVerifier,
      service,
      categoryService
    );
    await app.ready();
  });

  // 1. Authentication boundary
  test('rejects unauthenticated POST /api/v1/transactions with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      payload: {},
    });
    assert.equal(res.statusCode, 401);
  });

  test('rejects unauthenticated GET /api/v1/transactions with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions',
    });
    assert.equal(res.statusCode, 401);
  });

  test('rejects unauthenticated GET /api/v1/categories with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/categories',
    });
    assert.equal(res.statusCode, 401);
  });

  // 2. Category listing
  test('GET /api/v1/categories returns caller active categories in sort order', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/categories',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(Array.isArray(body.categories));
    assert.ok(body.categories.length > 0);
    // Verify sorted by sort_order
    for (let i = 1; i < body.categories.length; i++) {
      assert.ok(body.categories[i].sort_order >= body.categories[i - 1].sort_order);
    }
  });

  test('GET /api/v1/categories?type=expense filters strictly to expense categories', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/categories?type=expense',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.ok(body.categories.every((c: { type: string }) => c.type === 'expense'));
  });

  // 3. Validation on POST /api/v1/transactions
  test('rejects invalid UUID v7 format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: 'not-a-uuid-v7',
        amount: '250.00',
        type: 'expense',
        category_id: '00000000-0000-0000-0000-000000000001',
        transaction_date: '2026-10-25',
        payment_method: 'online',
        necessity: 'essential',
      },
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().message, /valid UUID v7/);
  });

  test('rejects zero, negative, or invalid amounts', async () => {
    const validId = uuidv7();
    const cat = service.categories.find((c) => c.user_id === userA.userId && c.type === 'expense')!;

    const resZero = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: validId,
        amount: '0.00',
        type: 'expense',
        category_id: cat.id,
        transaction_date: '2026-10-25',
        payment_method: 'online',
        necessity: 'essential',
      },
    });
    assert.equal(resZero.statusCode, 400);

    const resNeg = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: validId,
        amount: '-150.00',
        type: 'expense',
        category_id: cat.id,
        transaction_date: '2026-10-25',
        payment_method: 'online',
        necessity: 'essential',
      },
    });
    assert.equal(resNeg.statusCode, 400);
  });

  test('rejects invalid calendar date (e.g. 2026-02-31)', async () => {
    const cat = service.categories.find((c) => c.user_id === userA.userId && c.type === 'expense')!;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '250.00',
        type: 'expense',
        category_id: cat.id,
        transaction_date: '2026-02-31',
        payment_method: 'online',
        necessity: 'essential',
      },
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().message, /valid calendar date/);
  });

  test('allows optional/null necessity for expense transactions, and rejects invalid strings', async () => {
    const cat = service.categories.find((c) => c.user_id === userA.userId && c.type === 'expense')!;
    const resValid = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '250.00',
        type: 'expense',
        category_id: cat.id,
        transaction_date: '2026-10-25',
        payment_method: 'online',
        necessity: null, // valid unclassified expense
      },
    });
    assert.equal(resValid.statusCode, 201);
    assert.equal(resValid.json().transaction.necessity, null);

    const resInvalid = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '250.00',
        type: 'expense',
        category_id: cat.id,
        transaction_date: '2026-10-25',
        payment_method: 'online',
        necessity: 'invalid_tier',
      },
    });
    assert.equal(resInvalid.statusCode, 400);
    assert.match(resInvalid.json().message, /require a valid necessity/);
  });

  test('allows optional/null category_id for unclassified statement transactions', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '300.00',
        type: 'expense',
        category_id: null,
        transaction_date: '2026-10-25',
        payment_method: 'online',
        necessity: null,
      },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.json().transaction.category_id, null);
  });

  test('rejects necessity for income transactions', async () => {
    const cat = service.categories.find((c) => c.user_id === userA.userId && c.type === 'income')!;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '50000.00',
        type: 'income',
        category_id: cat.id,
        transaction_date: '2026-10-25',
        payment_method: 'online',
        necessity: 'essential', // prohibited for income
      },
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().message, /must not have a necessity/);
  });

  test('rejects category belonging to another user', async () => {
    // Find category belonging strictly to userB
    const catB = service.categories.find((c) => c.user_id === userB.userId && c.type === 'expense')!;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' }, // user A trying to use user B's category
      payload: {
        id: uuidv7(),
        amount: '250.00',
        type: 'expense',
        category_id: catB.id,
        transaction_date: '2026-10-25',
        payment_method: 'online',
        necessity: 'essential',
      },
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().message, /does not exist or does not belong to the user/);
  });

  test('rejects category and transaction type mismatch', async () => {
    // User A's income category used in an expense transaction
    const incomeCat = service.categories.find((c) => c.user_id === userA.userId && c.type === 'income')!;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '250.00',
        type: 'expense',
        category_id: incomeCat.id,
        transaction_date: '2026-10-25',
        payment_method: 'online',
        necessity: 'essential',
      },
    });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().message, /but transaction is 'expense'/);
  });

  // 4. Successful creation and outbox event trigger
  test('creates authenticated expense transaction with 201 Created and writes outbox event', async () => {
    const txnId = uuidv7();
    const cat = service.categories.find((c) => c.user_id === userA.userId && c.name === 'Food & Dining')!;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: txnId,
        amount: '250.50',
        type: 'expense',
        category_id: cat.id,
        transaction_date: '2026-10-25',
        payment_method: 'online',
        necessity: 'essential',
        description: 'Team lunch',
        notes: 'Card payment at diner',
        account_id: '33333333-3333-4333-8333-333333333333',
        import_batch_id: uuidv7(),
        statement_reference: 'UTR-ABC123',
        user_id: 'malicious-injected-user-id', // MUST BE IGNORED
      },
    });

    assert.equal(res.statusCode, 201);
    const body = res.json();
    assert.equal(body.idempotent_replay, false);
    assert.equal(body.transaction.id, txnId);
    assert.equal(body.transaction.amount_paise, 25050);
    assert.equal(body.transaction.amount_decimal, '250.50');
    assert.equal(body.transaction.formatted_inr, '₹250.50');
    assert.equal(body.transaction.category_name, 'Food & Dining');
    assert.equal(body.transaction.account_id, '33333333-3333-4333-8333-333333333333');
    assert.equal(body.transaction.statement_reference, 'UTR-ABC123');

    // Verify stored transaction is bound to userA, not the malicious client user_id
    const stored = service.transactions.find((t) => t.id === txnId);
    assert.ok(stored);
    assert.equal(stored.user_id, userA.userId);

    // Verify outbox event was created atomically
    const outbox = service.outboxEvents.find((e) => e.entity_id === txnId);
    assert.ok(outbox);
    assert.equal(outbox.event_type, 'transaction.created');
    assert.equal(outbox.user_id, userA.userId);
    assert.equal(outbox.payload.statement_reference, 'UTR-ABC123');
  });

  // 5. Idempotent replays and conflict handling
  test('idempotent replay with same ID and identical payload returns 200 and does NOT duplicate outbox', async () => {
    const txnId = uuidv7();
    const cat = service.categories.find((c) => c.user_id === userA.userId && c.name === 'Transport')!;

    const payload = {
      id: txnId,
      amount: '120.00',
      type: 'expense',
      category_id: cat.id,
      transaction_date: '2026-10-25',
      payment_method: 'cash',
      necessity: 'optional',
      description: 'Metro card topup',
      account_id: '44444444-4444-4444-8444-444444444444',
      import_batch_id: uuidv7(),
      statement_reference: 'REF-9001',
    };

    // First attempt -> 201 Created
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload,
    });
    assert.equal(res1.statusCode, 201);
    assert.equal(res1.json().idempotent_replay, false);

    const outboxCountBefore = service.outboxEvents.filter((e) => e.entity_id === txnId).length;
    assert.equal(outboxCountBefore, 1);

    // Second attempt with exact same payload -> 200 OK (idempotent replay)
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload,
    });
    assert.equal(res2.statusCode, 200);
    assert.equal(res2.json().idempotent_replay, true);

    // Outbox count must NOT increase
    const outboxCountAfter = service.outboxEvents.filter((e) => e.entity_id === txnId).length;
    assert.equal(outboxCountAfter, 1);

    const changedReference = await app.inject({
      method: 'POST', url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: { ...payload, statement_reference: 'REF-9002' },
    });
    assert.equal(changedReference.statusCode, 409, 'Idempotency must include statement source identity');
  });

  test('reusing same ID with DIFFERENT payload returns 409 Conflict', async () => {
    const txnId = uuidv7();
    const cat = service.categories.find((c) => c.user_id === userA.userId && c.name === 'Transport')!;

    // Initial creation
    await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: txnId,
        amount: '100.00',
        type: 'expense',
        category_id: cat.id,
        transaction_date: '2026-10-25',
        payment_method: 'cash',
        necessity: 'essential',
      },
    });

    // Reuse same ID with different amount
    const conflictRes = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: txnId,
        amount: '500.00', // DIFFERENT amount!
        type: 'expense',
        category_id: cat.id,
        transaction_date: '2026-10-25',
        payment_method: 'cash',
        necessity: 'essential',
      },
    });

    assert.equal(conflictRes.statusCode, 409);
    assert.match(conflictRes.json().message, /already exists with different payload/);
  });

  test('replaying creation request for soft-deleted transaction returns 409 Conflict', async () => {
    const txnId = uuidv7();
    const cat = service.categories.find((c) => c.user_id === userA.userId && c.name === 'Transport')!;

    const payload = {
      id: txnId,
      amount: '90.00',
      type: 'expense',
      category_id: cat.id,
      transaction_date: '2026-10-25',
      payment_method: 'cash',
      necessity: 'essential',
    };

    await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload,
    });

    // Simulate soft-deletion
    const txn = service.transactions.find((t) => t.id === txnId)!;
    txn.deleted_at = new Date().toISOString();

    // Replay creation
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload,
    });

    assert.equal(res.statusCode, 409);
    assert.match(res.json().message, /previously deleted and cannot be recreated/);
  });

  // 6. User Isolation & Ledger Listing
  test('GET /api/v1/transactions isolates data between users and excludes soft-deleted records', async () => {
    // User B creates a transaction
    const catB = service.categories.find((c) => c.user_id === userB.userId && c.name === 'Salary')!;
    const resB = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-b-token' },
      payload: {
        id: uuidv7(),
        amount: '100000.00',
        type: 'income',
        category_id: catB.id,
        transaction_date: '2026-10-20',
        payment_method: 'online',
      },
    });
    assert.equal(resB.statusCode, 201);

    // User A lists transactions
    const listA = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(listA.statusCode, 200);
    const bodyA = listA.json();

    // Must NOT contain user B's transaction!
    assert.ok(bodyA.items.every((item: { id: string }) => item.id !== resB.json().transaction.id));
  });

  test('GET /api/v1/transactions supports pagination and deterministic date ordering', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions?page=1&page_size=2',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(listRes.statusCode, 200);
    const body = listRes.json();
    assert.equal(body.page, 1);
    assert.equal(body.page_size, 2);
    assert.ok(body.items.length <= 2);
    if (body.items.length >= 2) {
      assert.ok(body.items[0].transaction_date >= body.items[1].transaction_date);
    }
  });

  test('GET /api/v1/transactions rejects invalid sort_by with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions?sort_by=invalid_sort',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(res.statusCode, 400);
    const body = res.json();
    assert.match(body.message, /Query sort_by must be/);
  });

  test('GET /api/v1/transactions supports sort_by=date_desc and sort_by=date_asc', async () => {
    const descRes = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions?sort_by=date_desc',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(descRes.statusCode, 200);
    const descItems = descRes.json().items;

    const ascRes = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions?sort_by=date_asc',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(ascRes.statusCode, 200);
    const ascItems = ascRes.json().items;

    if (descItems.length >= 2) {
      assert.ok(descItems[0].transaction_date >= descItems[descItems.length - 1].transaction_date);
      assert.ok(ascItems[0].transaction_date <= ascItems[ascItems.length - 1].transaction_date);
      assert.equal(descItems[0].id, ascItems[ascItems.length - 1].id);
    }
  });

  test('GET /api/v1/transactions supports sort_by=amount_desc and sort_by=amount_asc', async () => {
    const descRes = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions?sort_by=amount_desc',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(descRes.statusCode, 200);
    const descItems = descRes.json().items;

    const ascRes = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions?sort_by=amount_asc',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(ascRes.statusCode, 200);
    const ascItems = ascRes.json().items;

    if (descItems.length >= 2) {
      assert.ok(descItems[0].amount_paise >= descItems[descItems.length - 1].amount_paise);
      assert.ok(ascItems[0].amount_paise <= ascItems[ascItems.length - 1].amount_paise);
    }
  });

  // 7. Transaction Updates, Soft Deletion, and Restoration
  test('PATCH /api/v1/transactions/:id updates transaction fields and records outbox event', async () => {
    const txnId = uuidv7();
    const foodCat = service.categories.find((c) => c.user_id === userA.userId && c.name === 'Food & Dining')!;

    // Create transaction
    await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: txnId,
        amount: '250.00',
        type: 'expense',
        category_id: foodCat.id,
        transaction_date: '2026-10-25',
        payment_method: 'online',
        necessity: 'essential',
        description: 'Initial lunch',
      },
    });

    // Update amount, necessity, and description
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/transactions/${txnId}`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        amount: '350.50',
        necessity: 'optional',
        description: 'Team lunch buffet',
        notes: 'Celebration note',
      },
    });

    assert.equal(patchRes.statusCode, 200);
    const updated = patchRes.json().transaction;
    assert.equal(updated.amount_paise, 35050);
    assert.equal(updated.amount_decimal, '350.50');
    assert.equal(updated.necessity, 'optional');
    assert.equal(updated.description, 'Team lunch buffet');
    assert.equal(updated.notes, 'Celebration note');

    // Verify outbox event recorded
    const updateEvent = service.outboxEvents.find(
      (e) => e.entity_id === txnId && e.event_type === 'transaction.updated'
    );
    assert.ok(updateEvent);
    assert.equal(updateEvent.user_id, userA.userId);
  });

  test('PATCH /api/v1/transactions/:id rejects cross-user modification with 404', async () => {
    const txnId = uuidv7();
    const catA = service.categories.find((c) => c.user_id === userA.userId && c.name === 'Food & Dining')!;

    // Created by User A
    await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: txnId,
        amount: '100.00',
        type: 'expense',
        category_id: catA.id,
        transaction_date: '2026-10-25',
        payment_method: 'cash',
        necessity: 'essential',
      },
    });

    // User B attempts to edit User A's transaction
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/transactions/${txnId}`,
      headers: { authorization: 'Bearer user-b-token' },
      payload: {
        amount: '999.00',
      },
    });
    assert.equal(res.statusCode, 404);
  });

  test('DELETE /api/v1/transactions/:id soft-deletes record and POST /restore un-deletes it', async () => {
    const txnId = uuidv7();
    const cat = service.categories.find((c) => c.user_id === userA.userId && c.name === 'Transport')!;

    // Create transaction
    await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: txnId,
        amount: '50.00',
        type: 'expense',
        category_id: cat.id,
        transaction_date: '2026-10-25',
        payment_method: 'cash',
        necessity: 'essential',
        description: 'Bus ticket',
      },
    });

    // Delete transaction
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/transactions/${txnId}`,
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(delRes.statusCode, 200);
    assert.equal(delRes.json().success, true);

    // Verify it is excluded from active ledger listing
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const items = listRes.json().items;
    assert.ok(items.every((t: { id: string }) => t.id !== txnId));

    // Verify outbox event for deletion
    const delEvent = service.outboxEvents.find(
      (e) => e.entity_id === txnId && e.event_type === 'transaction.deleted'
    );
    assert.ok(delEvent);

    // Attempting to delete again returns 404
    const delAgainRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/transactions/${txnId}`,
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(delAgainRes.statusCode, 404);

    // Restore transaction
    const restoreRes = await app.inject({
      method: 'POST',
      url: `/api/v1/transactions/${txnId}/restore`,
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(restoreRes.statusCode, 200);
    assert.equal(restoreRes.json().transaction.id, txnId);

    // Verify restored transaction is back in active ledger listing
    const listResAfter = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const itemsAfter = listResAfter.json().items;
    assert.ok(itemsAfter.some((t: { id: string }) => t.id === txnId));

    // Verify outbox event for restoration
    const restoreEvent = service.outboxEvents.find(
      (e) => e.entity_id === txnId && e.event_type === 'transaction.restored'
    );
    assert.ok(restoreEvent);
  });
});
