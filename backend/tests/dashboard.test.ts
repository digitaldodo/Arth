import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { v7 as uuidv7 } from 'uuid';
import { buildApp } from '../src/app.js';
import { InMemoryTransactionService } from '../src/modules/transactions/transaction.service.js';
import { InMemoryCategoryService } from '../src/modules/categories/category.service.js';
import { InMemoryPeopleService } from '../src/modules/people/people.service.js';
import { InMemoryDashboardService } from '../src/modules/dashboard/dashboard.service.js';
import type { FastifyInstance } from 'fastify';
import type { DashboardSummaryResponse } from '@arth/contracts';

describe('Backend Dashboard Summary & Financial Aggregation API', () => {
  let app: FastifyInstance;
  let txService: InMemoryTransactionService;
  let catService: InMemoryCategoryService;
  let peopleService: InMemoryPeopleService;
  let dashboardService: InMemoryDashboardService;

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
    txService = new InMemoryTransactionService();
    catService = new InMemoryCategoryService();
    peopleService = new InMemoryPeopleService();

    txService.seedDefaultCategories(userA.userId);
    txService.seedDefaultCategories(userB.userId);
    catService.seedDefaults(userA.userId);
    catService.seedDefaults(userB.userId);

    dashboardService = new InMemoryDashboardService(txService, catService);

    const mockVerifier = async (token: string) => {
      if (token === 'user-a-token') return userA;
      if (token === 'user-b-token') return userB;
      throw new Error('Invalid token');
    };

    app = await buildApp(
      { env: 'test' },
      mockVerifier,
      txService,
      catService,
      peopleService,
      dashboardService
    );
    await app.ready();
  });

  // 1. Unauthorized requests return 401
  test('rejects unauthenticated requests to dashboard summary with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/summary?start_date=2026-10-01&end_date=2026-10-31',
    });
    assert.equal(res.statusCode, 401);
  });

  // 2. Invalid date formats and reversed ranges are rejected with 400
  test('rejects missing, invalid, or reversed date ranges with 400', async () => {
    // Missing dates
    const resMissing = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/summary',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(resMissing.statusCode, 400);

    // Invalid calendar date (e.g. Feb 31)
    const resInvalid = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/summary?start_date=2026-02-31&end_date=2026-03-01',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(resInvalid.statusCode, 400);
    assert.match(resInvalid.json().message, /Invalid start_date/);

    // Reversed dates (start > end)
    const resReversed = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/summary?start_date=2026-10-31&end_date=2026-10-01',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(resReversed.statusCode, 400);
    assert.match(resReversed.json().message, /cannot be after/);
  });

  // 3. Empty dataset produces zero totals and empty composition
  test('empty dataset returns zero totals and empty composition', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/summary?start_date=2026-10-01&end_date=2026-10-31',
      headers: { authorization: 'Bearer user-a-token' },
    });

    assert.equal(res.statusCode, 200);
    const body: DashboardSummaryResponse = res.json();
    assert.equal(body.income_paise, 0);
    assert.equal(body.expenses_paise, 0);
    assert.equal(body.net_cash_flow_paise, 0);
    assert.equal(body.formatted_income, '₹0.00');
    assert.equal(body.formatted_expenses, '₹0.00');
    assert.equal(body.formatted_net_cash_flow, '₹0.00');
    assert.deepEqual(body.spending_composition, []);
    assert.deepEqual(body.recent_transactions, []);
    assert.equal(body.has_activity_in_range, false);
    assert.equal(body.total_active_transaction_count, 0);
  });

  // 4. Correct totals with both income and expense transactions
  test('calculates correct income, expense, and positive net cash flow', async () => {
    const catsA = await catService.listCategories(userA.userId, {});
    const salaryCat = catsA.categories.find((c) => c.name === 'Salary')!;
    const foodCat = catsA.categories.find((c) => c.name === 'Food & Dining')!;
    const rentCat = catsA.categories.find((c) => c.name === 'Housing')!;

    // Create income: ₹50,000.00 (5,000,000 paise)
    await txService.createTransaction(userA.userId, {
      id: uuidv7(),
      amount_paise: 5000000n,
      type: 'income',
      category_id: salaryCat.id,
      transaction_date: '2026-10-05',
      payment_method: 'online',
      description: 'October Salary',
      notes: null,
    });

    // Create expense 1: ₹3,000.00 (300,000 paise)
    await txService.createTransaction(userA.userId, {
      id: uuidv7(),
      amount_paise: 300000n,
      type: 'expense',
      category_id: foodCat.id,
      transaction_date: '2026-10-10',
      payment_method: 'online',
      necessity: 'essential',
      description: 'Groceries',
      notes: null,
    });

    // Create expense 2: ₹7,000.00 (700,000 paise)
    await txService.createTransaction(userA.userId, {
      id: uuidv7(),
      amount_paise: 700000n,
      type: 'expense',
      category_id: rentCat.id,
      transaction_date: '2026-10-15',
      payment_method: 'online',
      necessity: 'essential',
      description: 'Rent share',
      notes: null,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/summary?start_date=2026-10-01&end_date=2026-10-31',
      headers: { authorization: 'Bearer user-a-token' },
    });

    assert.equal(res.statusCode, 200);
    const body: DashboardSummaryResponse = res.json();
    assert.equal(body.income_paise, 5000000);
    assert.equal(body.expenses_paise, 1000000);
    assert.equal(body.net_cash_flow_paise, 4000000);
    assert.equal(body.formatted_income, '₹50,000.00');
    assert.equal(body.formatted_expenses, '₹10,000.00');
    assert.equal(body.formatted_net_cash_flow, '₹40,000.00');
    assert.equal(body.has_activity_in_range, true);
    assert.equal(body.total_active_transaction_count, 3);
  });

  // 5. Category composition grouped without double-counting and correct shares
  test('groups spending composition by category with correct percentages', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/summary?start_date=2026-10-01&end_date=2026-10-31',
      headers: { authorization: 'Bearer user-a-token' },
    });

    const body: DashboardSummaryResponse = res.json();
    assert.equal(body.spending_composition.length, 2);

    // Total expenses = ₹10,000.00
    // Housing: ₹7,000.00 -> 70%
    const rentItem = body.spending_composition.find((c) => c.category_name === 'Housing')!;
    assert.ok(rentItem);
    assert.equal(rentItem.amount_paise, 700000);
    assert.equal(rentItem.formatted_inr, '₹7,000.00');
    assert.equal(rentItem.share_percentage, 70);

    // Food & Dining: ₹3,000.00 -> 30%
    const foodItem = body.spending_composition.find((c) => c.category_name === 'Food & Dining')!;
    assert.ok(foodItem);
    assert.equal(foodItem.amount_paise, 300000);
    assert.equal(foodItem.formatted_inr, '₹3,000.00');
    assert.equal(foodItem.share_percentage, 30);
  });

  // 6. Correct net cash flow, including negative values
  test('handles negative net cash flow clearly when expenses exceed income', async () => {
    const catsA = await catService.listCategories(userA.userId, {});
    const shoppingCat = catsA.categories.find((c) => c.name === 'Shopping')!;

    // Add extra expense in September (out of October range) where expenses exceed income
    // September income: ₹1,000.00
    await txService.createTransaction(userA.userId, {
      id: uuidv7(),
      amount_paise: 100000n,
      type: 'income',
      category_id: catsA.categories.find((c) => c.name === 'Salary')!.id,
      transaction_date: '2026-09-01',
      payment_method: 'online',
      description: 'Minor gig',
      notes: null,
    });

    // September expense: ₹6,000.00
    await txService.createTransaction(userA.userId, {
      id: uuidv7(),
      amount_paise: 600000n,
      type: 'expense',
      category_id: shoppingCat.id,
      transaction_date: '2026-09-15',
      payment_method: 'online',
      necessity: 'optional',
      description: 'New appliance',
      notes: null,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/summary?start_date=2026-09-01&end_date=2026-09-30',
      headers: { authorization: 'Bearer user-a-token' },
    });

    assert.equal(res.statusCode, 200);
    const body: DashboardSummaryResponse = res.json();
    assert.equal(body.income_paise, 100000);
    assert.equal(body.expenses_paise, 600000);
    assert.equal(body.net_cash_flow_paise, -500000);
    assert.equal(body.formatted_income, '₹1,000.00');
    assert.equal(body.formatted_expenses, '₹6,000.00');
    assert.equal(body.formatted_net_cash_flow, '-₹5,000.00');
  });

  // 7. Transactions outside the selected date range excluded
  test('excludes transactions strictly outside the start and end dates', async () => {
    // Only query Oct 10 to Oct 12: should include only Groceries (Oct 10, ₹3,000.00)
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/summary?start_date=2026-10-10&end_date=2026-10-12',
      headers: { authorization: 'Bearer user-a-token' },
    });

    assert.equal(res.statusCode, 200);
    const body: DashboardSummaryResponse = res.json();
    assert.equal(body.income_paise, 0);
    assert.equal(body.expenses_paise, 300000);
    assert.equal(body.net_cash_flow_paise, -300000);
    assert.equal(body.spending_composition.length, 1);
    assert.equal(body.spending_composition[0].category_name, 'Food & Dining');
    assert.equal(body.recent_transactions.length, 1);
  });

  // 8. Correct inclusive start/end-date behavior using calendar dates
  test('inclusive boundary check: includes transactions on exact start and end dates', async () => {
    // Exact boundary query matching Oct 5 (Salary) to Oct 15 (Rent)
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/summary?start_date=2026-10-05&end_date=2026-10-15',
      headers: { authorization: 'Bearer user-a-token' },
    });

    assert.equal(res.statusCode, 200);
    const body: DashboardSummaryResponse = res.json();
    // Oct 5 (50,000), Oct 10 (3,000), Oct 15 (7,000)
    assert.equal(body.income_paise, 5000000);
    assert.equal(body.expenses_paise, 1000000);
    assert.equal(body.recent_transactions.length, 3);
  });

  // 9. Soft-deleted transactions excluded from totals
  test('excludes soft-deleted transactions from summary and recent activity', async () => {
    const catsA = await catService.listCategories(userA.userId, {});
    const foodCat = catsA.categories.find((c) => c.name === 'Food & Dining')!;

    // Create a transaction and soft-delete it
    const deletedTxId = uuidv7();
    await txService.createTransaction(userA.userId, {
      id: deletedTxId,
      amount_paise: 250000n, // ₹2,500
      type: 'expense',
      category_id: foodCat.id,
      transaction_date: '2026-10-20',
      payment_method: 'cash',
      necessity: 'optional',
      description: 'Accidental entry',
      notes: null,
    });

    // Mark deleted in store
    const storedTx = txService.transactions.find((t) => t.id === deletedTxId)!;
    storedTx.deleted_at = new Date().toISOString();

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/summary?start_date=2026-10-01&end_date=2026-10-31',
      headers: { authorization: 'Bearer user-a-token' },
    });

    assert.equal(res.statusCode, 200);
    const body: DashboardSummaryResponse = res.json();
    // Total expenses should still be ₹10,000 (not ₹12,500)
    assert.equal(body.expenses_paise, 1000000);
    assert.ok(!body.recent_transactions.some((t) => t.id === deletedTxId));
  });

  // 10. EXPLICIT DATA-ISOLATION RULE: People obligations and settlements never affect dashboard totals
  test('People records, loans, and settlements NEVER alter dashboard income, expenses, or net cash flow', async () => {
    // Check initial summary for User A
    const beforeRes = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/summary?start_date=2026-10-01&end_date=2026-10-31',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const beforeBody: DashboardSummaryResponse = beforeRes.json();

    // Now record high-value people records and settlements for User A
    const person = await peopleService.createPerson(userA.userId, {
      name: 'Rohan Partner',
      direction: 'they_owe_me',
    });

    const record = await peopleService.createRecord(userA.userId, person.id, {
      name: 'Major equipment loan',
      amount_paise: 10000000n, // ₹1,00,000.00
      record_date: '2026-10-10',
    });

    await peopleService.recordSettlement(userA.userId, record.record.id, {
      amount_paise: 5000000n, // ₹50,000.00 settled
      settlement_date: '2026-10-12',
    });

    // Re-check dashboard summary
    const afterRes = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/summary?start_date=2026-10-01&end_date=2026-10-31',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const afterBody: DashboardSummaryResponse = afterRes.json();

    assert.equal(afterBody.income_paise, beforeBody.income_paise, 'Income must remain completely untouched by People loan/settlement');
    assert.equal(afterBody.expenses_paise, beforeBody.expenses_paise, 'Expenses must remain completely untouched by People loan/settlement');
    assert.equal(afterBody.net_cash_flow_paise, beforeBody.net_cash_flow_paise, 'Net Cash Flow must remain completely untouched by People loan/settlement');
    assert.deepEqual(afterBody.spending_composition, beforeBody.spending_composition, 'Spending composition must remain untouched');
  });

  // 11. Multi-tenant isolation: User B cannot see User A transactions
  test('enforces strict multi-tenant isolation: User B dashboard reflects only User B activity', async () => {
    // User B summary in October
    const resB = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/summary?start_date=2026-10-01&end_date=2026-10-31',
      headers: { authorization: 'Bearer user-b-token' },
    });

    assert.equal(resB.statusCode, 200);
    const bodyB: DashboardSummaryResponse = resB.json();
    assert.equal(bodyB.income_paise, 0);
    assert.equal(bodyB.expenses_paise, 0);
    assert.equal(bodyB.net_cash_flow_paise, 0);
    assert.equal(bodyB.recent_transactions.length, 0);
    assert.equal(bodyB.total_active_transaction_count, 0);
  });

  // 12. Recent transaction results are bounded (<= 10) and deterministically ordered
  test('recent transactions are bounded to max 10 and ordered deterministically (date DESC, created_at DESC)', async () => {
    const catsA = await catService.listCategories(userA.userId, {});
    const foodCat = catsA.categories.find((c) => c.name === 'Food & Dining')!;

    // Create 12 transactions on different dates
    for (let i = 1; i <= 12; i++) {
      const day = i.toString().padStart(2, '0');
      await txService.createTransaction(userA.userId, {
        id: uuidv7(),
        amount_paise: BigInt(i * 10000),
        type: 'expense',
        category_id: foodCat.id,
        transaction_date: `2026-08-${day}`,
        payment_method: 'online',
        necessity: 'essential',
        description: `August Expense #${i}`,
        notes: null,
      });
    }

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/summary?start_date=2026-08-01&end_date=2026-08-31',
      headers: { authorization: 'Bearer user-a-token' },
    });

    assert.equal(res.statusCode, 200);
    const body: DashboardSummaryResponse = res.json();
    assert.equal(body.recent_transactions.length, 10, 'Must be bounded to max 10 transactions');

    // First transaction should be August 12 (latest)
    assert.equal(body.recent_transactions[0].transaction_date, '2026-08-12');
    // 10th transaction should be August 03
    assert.equal(body.recent_transactions[9].transaction_date, '2026-08-03');
  });
});
