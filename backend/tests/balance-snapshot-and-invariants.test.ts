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
import type { AccountBalancesDTO, TransactionDTO } from '@arth/contracts';

describe('Balance Snapshot Model & Non-Negative Balance Invariants (Scenarios 1-11)', () => {
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

  let foodCategoryId: string;
  let salaryCategoryId: string;

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

    const catRes = await catService.listCategories(userA.userId, {});
    foodCategoryId = catRes.categories.find((c) => c.name === 'Food & Dining')?.id ?? catRes.categories[0]!.id;
    salaryCategoryId = catRes.categories.find((c) => c.name === 'Salary')?.id ?? catRes.categories[0]!.id;

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

  test('Scenario 1: Starting-balance setup with historical transactions (23-30 October)', async () => {
    // 1. Record historical transactions on 23-30 October (before baseline is configured)
    // 23 Oct: Expense ₹500 (Cash)
    const t1 = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '500.00',
        type: 'expense',
        category_id: foodCategoryId,
        transaction_date: '2026-10-23',
        payment_method: 'cash',
        necessity: 'essential',
        recorded_at: '2026-10-23T10:00:00.000Z',
      },
    });
    assert.equal(t1.statusCode, 201);

    // 25 Oct: Expense ₹300 (Cash)
    const t2 = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '300.00',
        type: 'expense',
        category_id: foodCategoryId,
        transaction_date: '2026-10-25',
        payment_method: 'cash',
        necessity: 'essential',
        recorded_at: '2026-10-25T11:00:00.000Z',
      },
    });
    assert.equal(t2.statusCode, 201);

    // 28 Oct: Income ₹1,000 (Online)
    const t3 = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '1000.00',
        type: 'income',
        category_id: salaryCategoryId,
        transaction_date: '2026-10-28',
        payment_method: 'online',
        recorded_at: '2026-10-28T09:00:00.000Z',
      },
    });
    assert.equal(t3.statusCode, 201);

    // 30 Oct: Expense ₹200 (Online)
    const t4 = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '200.00',
        type: 'expense',
        category_id: foodCategoryId,
        transaction_date: '2026-10-30',
        payment_method: 'online',
        necessity: 'essential',
        recorded_at: '2026-10-30T14:00:00.000Z',
      },
    });
    assert.equal(t4.statusCode, 201);

    // On 1 November, user configures starting balances:
    // Cash: ₹2,000 (200000 paise), Online: ₹5,000 (500000 paise)
    const configRes = await app.inject({
      method: 'POST',
      url: '/api/v1/balances/starting',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        starting_cash: '2000.00',
        starting_online: '5000.00',
      },
    });
    assert.equal(configRes.statusCode, 200);

    // Fetch balances immediately after configuration
    const balancesRes = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(balancesRes.statusCode, 200);
    const balances: AccountBalancesDTO = balancesRes.json();

    assert.equal(balances.balances_configured, true);
    assert.equal(balances.current_cash_paise, 200000, 'Current cash balance must be exactly ₹2,000');
    assert.equal(balances.current_online_paise, 500000, 'Current online balance must be exactly ₹5,000');
    assert.equal(balances.total_available_paise, 700000, 'Total available balance must be exactly ₹7,000');
    assert.ok(balances.balances_configured_at !== null, 'balances_configured_at must be populated');
  });

  test('Scenario 2: Post-baseline transaction (online expense ₹500 recorded after 1 Nov)', async () => {
    // Record new online expense of ₹500
    const expRes = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '500.00',
        type: 'expense',
        category_id: foodCategoryId,
        transaction_date: '2026-11-01',
        payment_method: 'online',
        necessity: 'essential',
      },
    });
    assert.equal(expRes.statusCode, 201);

    // Fetch balances
    const balancesRes = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(balancesRes.statusCode, 200);
    const balances: AccountBalancesDTO = balancesRes.json();

    assert.equal(balances.current_cash_paise, 200000, 'Cash balance must remain ₹2,000');
    assert.equal(balances.current_online_paise, 450000, 'Online balance must be ₹4,500 (5000 - 500)');
    assert.equal(balances.total_available_paise, 650000, 'Total balance must be ₹6,500');
  });

  test('Scenario 3: Historical transactions remain fully visible in ledger and summary', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/transactions?limit=50',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(listRes.statusCode, 200);
    const list = listRes.json();
    assert.ok(list.items.length >= 5, 'All historical and post-baseline transactions must be listed');

    // Verify October transactions exist
    const octTxns = list.items.filter((t: TransactionDTO) => t.transaction_date.startsWith('2026-10'));
    assert.equal(octTxns.length, 4, 'All 4 October historical transactions must be preserved in ledger');
  });

  test('Scenario 4: Old-dated transaction recorded post-baseline follows post-baseline policy', async () => {
    // User records an expense today, but sets transaction_date to an old date (e.g. 25 October)
    // Because recorded_at is now (> balances_configured_at), it MUST deduct from current balance
    const postBaselineRes = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '100.00', // ₹100
        payment_method: 'cash',
        type: 'expense',
        category_id: foodCategoryId,
        transaction_date: '2026-10-25', // Old transaction date
        necessity: 'essential',
        // recorded_at omitted -> server assigns current timestamp (> baseline)
      },
    });
    assert.equal(postBaselineRes.statusCode, 201);

    const balancesRes = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const balances: AccountBalancesDTO = balancesRes.json();
    assert.equal(balances.current_cash_paise, 190000, 'Cash must be deducted to ₹1,900 because it was recorded post-baseline');
  });

  test('Scenario 5: Pre-baseline transaction sync preserves recorded_at and is NOT deducted', async () => {
    // An offline transaction was created locally on 28 October (before 1 Nov baseline)
    // Now it syncs to server, passing recorded_at = 2026-10-28T08:00:00.000Z
    const syncRes = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '500.00', // ₹500
        payment_method: 'cash',
        type: 'expense',
        category_id: foodCategoryId,
        transaction_date: '2026-10-28',
        necessity: 'essential',
        recorded_at: '2026-10-28T08:00:00.000Z', // Created before baseline!
      },
    });
    assert.equal(syncRes.statusCode, 201);
    const txn: { transaction: TransactionDTO } = syncRes.json();
    assert.equal(txn.transaction.recorded_at, '2026-10-28T08:00:00.000Z');

    // Verify balance is unchanged because recorded_at <= balances_configured_at
    const balancesRes = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const balances: AccountBalancesDTO = balancesRes.json();
    assert.equal(balances.current_cash_paise, 190000, 'Cash balance must NOT be reduced by pre-baseline synced transaction');
  });

  test('Scenario 6: Baseline reconfiguration resets snapshot and baseline timestamp', async () => {
    // Reconfigure starting balances: Cash ₹3,000, Online ₹6,000
    const reconfigRes = await app.inject({
      method: 'POST',
      url: '/api/v1/balances/starting',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        starting_cash: '3000.00',
        starting_online: '6000.00',
      },
    });
    assert.equal(reconfigRes.statusCode, 200);

    const balancesRes = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const balances: AccountBalancesDTO = balancesRes.json();
    assert.equal(balances.current_cash_paise, 300000, 'Cash balance resets to ₹3,000 snapshot');
    assert.equal(balances.current_online_paise, 600000, 'Online balance resets to ₹6,000 snapshot');
    assert.equal(balances.total_available_paise, 900000, 'Total balance resets to ₹9,000');
  });

  test('Scenario 7 & 8: Non-negative balance enforcement for expenses, transfers, adjustments', async () => {
    // Current balances: Cash ₹3,000 (300000 paise), Online ₹6,000 (600000 paise)

    // 1. Attempt Cash Expense ₹3,500 (> ₹3,000) -> Rejected
    const expFailRes = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '3500.00',
        payment_method: 'cash',
        type: 'expense',
        category_id: foodCategoryId,
        transaction_date: '2026-11-02',
        necessity: 'essential',
      },
    });
    assert.equal(expFailRes.statusCode, 400);
    assert.ok(expFailRes.json().message.includes('Insufficient'));

    // 2. Attempt Online Expense ₹6,500 (> ₹6,000) -> Rejected
    const expOnlineFail = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '6500.00',
        payment_method: 'online',
        type: 'expense',
        category_id: foodCategoryId,
        transaction_date: '2026-11-02',
        necessity: 'essential',
      },
    });
    assert.equal(expOnlineFail.statusCode, 400);
    assert.ok(expOnlineFail.json().message.includes('Insufficient'));

    // 3. Attempt Transfer from Cash to Online of ₹3,500 -> Rejected
    const transferFail = await app.inject({
      method: 'POST',
      url: '/api/v1/balances/transfers',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        from_mode: 'CASH',
        to_mode: 'ONLINE',
        amount: '3500.00',
      },
    });
    assert.equal(transferFail.statusCode, 400);

    // 4. Attempt Negative Adjustment of ₹3,500 to Cash -> Rejected
    const adjustFail = await app.inject({
      method: 'POST',
      url: '/api/v1/balances/adjustments',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        payment_mode: 'CASH',
        difference: '-3500.00',
        reason: 'Correction',
      },
    });
    assert.equal(adjustFail.statusCode, 400);

    // Balances remain intact
    const checkRes = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const check: AccountBalancesDTO = checkRes.json();
    assert.equal(check.current_cash_paise, 300000);
    assert.equal(check.current_online_paise, 600000);
  });

  test('Scenario 9: Exact balance expense succeeds and brings balance to zero', async () => {
    // Current Cash is ₹3,000 (300000 paise). Spend exactly ₹3,000.
    const exactRes = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '3000.00',
        payment_method: 'cash',
        type: 'expense',
        category_id: foodCategoryId,
        transaction_date: '2026-11-02',
        necessity: 'essential',
      },
    });
    assert.equal(exactRes.statusCode, 201);

    const balancesRes = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const balances: AccountBalancesDTO = balancesRes.json();
    assert.equal(balances.current_cash_paise, 0, 'Cash balance must be exactly 0');
    assert.equal(balances.current_online_paise, 600000);
    assert.equal(balances.total_available_paise, 600000);

    // Any subsequent cash expense must be rejected now
    const rejectNext = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '1.00', // 1 rupee
        payment_method: 'cash',
        type: 'expense',
        category_id: foodCategoryId,
        transaction_date: '2026-11-02',
        necessity: 'essential',
      },
    });
    assert.equal(rejectNext.statusCode, 400);
  });

  test('Scenario 10: Multi-user isolation', async () => {
    // User B configures Cash ₹10,000, Online ₹20,000
    const bConfig = await app.inject({
      method: 'POST',
      url: '/api/v1/balances/starting',
      headers: { authorization: 'Bearer user-b-token' },
      payload: {
        starting_cash: '10000.00',
        starting_online: '20000.00',
      },
    });
    assert.equal(bConfig.statusCode, 200);

    // User A balances remain unchanged (Cash 0, Online 600000)
    const aRes = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const aBalances: AccountBalancesDTO = aRes.json();
    assert.equal(aBalances.current_cash_paise, 0);
    assert.equal(aBalances.current_online_paise, 600000);

    // User B balances are independent
    const bRes = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-b-token' },
    });
    const bBalances: AccountBalancesDTO = bRes.json();
    assert.equal(bBalances.current_cash_paise, 1000000);
    assert.equal(bBalances.current_online_paise, 2000000);
  });
});
