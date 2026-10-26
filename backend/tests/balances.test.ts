import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { v7 as uuidv7 } from 'uuid';
import { buildApp } from '../src/app.js';
import { InMemoryTransactionService } from '../src/modules/transactions/transaction.service.js';
import { InMemoryCategoryService } from '../src/modules/categories/category.service.js';
import { InMemoryPeopleService } from '../src/modules/people/people.service.js';
import { InMemoryDashboardService } from '../src/modules/dashboard/dashboard.service.js';
import { InMemoryBalanceService } from '../src/modules/balances/balance.service.js';
import type { FastifyInstance } from 'fastify';
import type { AccountBalancesDTO, BalanceMovementListResponse } from '@arth/contracts';

describe('Backend Account Balances, Transfers & Adjustments API', () => {
  let app: FastifyInstance;
  let txService: InMemoryTransactionService;
  let catService: InMemoryCategoryService;
  let peopleService: InMemoryPeopleService;
  let dashboardService: InMemoryDashboardService;
  let balanceService: InMemoryBalanceService;

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
    balanceService = new InMemoryBalanceService(txService);

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
      dashboardService,
      balanceService
    );
    await app.ready();
  });

  test('rejects unauthenticated requests to balance endpoints with 401', async () => {
    const resGet = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
    });
    assert.equal(resGet.statusCode, 401);

    const resPost = await app.inject({
      method: 'POST',
      url: '/api/v1/balances/starting',
      payload: { starting_cash: '500.00', starting_online: '1000.00' },
    });
    assert.equal(resPost.statusCode, 401);
  });

  test('returns unconfigured default zero balances for new user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(res.statusCode, 200);
    const body: AccountBalancesDTO = res.json();
    assert.equal(body.balances_configured, false);
    assert.equal(body.starting_cash_paise, 0);
    assert.equal(body.starting_online_paise, 0);
    assert.equal(body.current_cash_paise, 0);
    assert.equal(body.current_online_paise, 0);
    assert.equal(body.total_available_paise, 0);
  });

  test('configures starting balances with exact integer paise', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/balances/starting',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        starting_cash: '2500.50',
        starting_online: '10000.00',
      },
    });
    assert.equal(res.statusCode, 200);
    const body: AccountBalancesDTO = res.json();
    assert.equal(body.balances_configured, true);
    assert.equal(body.starting_cash_paise, 250050);
    assert.equal(body.starting_online_paise, 1000000);
    assert.equal(body.starting_total_paise, 1250050);
    assert.equal(body.current_cash_paise, 250050);
    assert.equal(body.current_online_paise, 1000000);
    assert.equal(body.total_available_paise, 1250050);
  });

  test('rejects negative or malformed starting balances', async () => {
    const resNegative = await app.inject({
      method: 'POST',
      url: '/api/v1/balances/starting',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        starting_cash: '-500',
        starting_online: '1000',
      },
    });
    assert.equal(resNegative.statusCode, 400);

    const resInvalid = await app.inject({
      method: 'POST',
      url: '/api/v1/balances/starting',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        starting_cash: 'abc',
        starting_online: '1000',
      },
    });
    assert.equal(resInvalid.statusCode, 400);
  });

  test('transactions dynamically affect Cash and Online balances', async () => {
    // Current balances: Cash = 2,500.50 (250050 paise), Online = 10,000.00 (1000000 paise)
    const userCategories = catService.categories.filter((c) => c.user_id === userA.userId);
    const expenseCat = userCategories.find((c) => c.type === 'expense')!;
    const incomeCat = userCategories.find((c) => c.type === 'income')!;

    // 1. Record Cash Expense of ₹500.50 (50050 paise)
    await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '500.50',
        type: 'expense',
        category_id: expenseCat.id,
        transaction_date: '2026-10-26',
        payment_method: 'cash',
        necessity: 'essential',
      },
    });

    // 2. Record Online Income of ₹5,000.00 (500000 paise)
    await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '5000.00',
        type: 'income',
        category_id: incomeCat.id,
        transaction_date: '2026-10-26',
        payment_method: 'online',
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(res.statusCode, 200);
    const body: AccountBalancesDTO = res.json();

    // Cash: 250050 - 50050 = 200000 (₹2,000.00)
    assert.equal(body.current_cash_paise, 200000);
    // Online: 1000000 + 500000 = 1500000 (₹15,000.00)
    assert.equal(body.current_online_paise, 1500000);
    // Total: 200000 + 1500000 = 1700000 (₹17,000.00)
    assert.equal(body.total_available_paise, 1700000);
  });

  test('records Cash to Online transfer and updates balances without changing total', async () => {
    // Current balances: Cash: 200000, Online: 1500000, Total: 1700000
    // Transfer ₹1,000.00 (100000 paise) from Cash to Online (e.g. Bank Deposit)
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/balances/transfers',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        amount: '1000.00',
        from_method: 'cash',
        to_method: 'online',
        reason: 'Bank cash deposit',
      },
    });
    assert.equal(res.statusCode, 201);
    const body = res.json();
    assert.equal(body.movement.movement_type, 'transfer');
    assert.equal(body.movement.amount_paise, 100000);
    assert.equal(body.balances.current_cash_paise, 100000); // 200000 - 100000
    assert.equal(body.balances.current_online_paise, 1600000); // 1500000 + 100000
    assert.equal(body.balances.total_available_paise, 1700000); // Total unchanged!
  });

  test('rejects transfer with same from and to method', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/balances/transfers',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        amount: '100.00',
        from_method: 'cash',
        to_method: 'cash',
      },
    });
    assert.equal(res.statusCode, 400);
  });

  test('records balance adjustment with required reason', async () => {
    // Current Cash is 100000 paise (₹1,000.00). User found ₹50 cash in pocket -> increase by ₹50 (5000 paise)
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/balances/adjustments',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        payment_method: 'cash',
        amount: '50.00',
        direction: 'increase',
        reason: 'Found cash in wallet pocket',
      },
    });
    assert.equal(res.statusCode, 201);
    const body = res.json();
    assert.equal(body.movement.movement_type, 'adjustment');
    assert.equal(body.movement.adjustment_paise, 5000);
    assert.equal(body.balances.current_cash_paise, 105000);
  });

  test('rejects balance adjustment without a reason', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/balances/adjustments',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        payment_method: 'online',
        amount: '10.00',
        direction: 'decrease',
        reason: '   ',
      },
    });
    assert.equal(res.statusCode, 400);
  });

  test('lists balance movements in audit log', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/balances/movements',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(res.statusCode, 200);
    const body: BalanceMovementListResponse = res.json();
    assert.ok(body.items.length >= 2);
    assert.ok(body.items.some((m) => m.movement_type === 'transfer'));
    assert.ok(body.items.some((m) => m.movement_type === 'adjustment'));
  });

  test('enforces strict user isolation for balances and movements', async () => {
    const resB = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-b-token' },
    });
    assert.equal(resB.statusCode, 200);
    const bodyB: AccountBalancesDTO = resB.json();
    assert.equal(bodyB.balances_configured, false);
    assert.equal(bodyB.total_available_paise, 0);

    const resBMovements = await app.inject({
      method: 'GET',
      url: '/api/v1/balances/movements',
      headers: { authorization: 'Bearer user-b-token' },
    });
    assert.equal(resBMovements.statusCode, 200);
    const movementsB: BalanceMovementListResponse = resBMovements.json();
    assert.equal(movementsB.items.length, 0);
  });
});
