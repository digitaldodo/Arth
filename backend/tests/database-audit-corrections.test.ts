import { test, describe, before, beforeEach } from 'node:test';
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

describe('Critical Post-Implementation Database Audit & Corrections (14 Scenarios)', () => {
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

  beforeEach(async () => {
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

  test('Scenario 1: Expense attempted before starting-balance configuration is rejected on zero balance', async () => {
    // Fresh unconfigured account starts at 0 Cash and 0 Online
    const balRes = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(balRes.statusCode, 200);
    const initialBalances: AccountBalancesDTO = balRes.json();
    assert.equal(initialBalances.balances_configured, false);
    assert.equal(initialBalances.current_cash_paise, 0);

    // Attempting an expense of ₹500 Cash must be rejected with 400 Bad Request
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
        payment_method: 'cash',
        necessity: 'essential',
      },
    });

    assert.equal(expRes.statusCode, 400);
    const err = expRes.json();
    assert.ok(err.message.includes('Insufficient cash balance'), 'Must reject expense exceeding available balance');
  });

  test('Scenario 2: Income before configuration followed by an expense is accepted under zero-baseline', async () => {
    // 1. Record income of ₹1,000 Cash while unconfigured
    const incRes = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '1000.00',
        type: 'income',
        category_id: salaryCategoryId,
        transaction_date: '2026-11-01',
        payment_method: 'cash',
      },
    });
    assert.equal(incRes.statusCode, 201);

    // Verify available cash is now ₹1,000 (100000 paise)
    const balRes1 = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(balRes1.statusCode, 200);
    const bal1: AccountBalancesDTO = balRes1.json();
    assert.equal(bal1.current_cash_paise, 100000);
    assert.equal(bal1.balances_configured, false);

    // 2. Record an expense of ₹400 Cash (should be accepted)
    const expRes = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '400.00',
        type: 'expense',
        category_id: foodCategoryId,
        transaction_date: '2026-11-01',
        payment_method: 'cash',
        necessity: 'essential',
      },
    });
    assert.equal(expRes.statusCode, 201);

    // Balances reflect remaining ₹600 Cash
    const balRes2 = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(balRes2.statusCode, 200);
    const bal2: AccountBalancesDTO = balRes2.json();
    assert.equal(bal2.current_cash_paise, 60000);
  });

  test('Scenario 3: Transfer update from Cash to Online (accepted vs rejected based on available balance)', async () => {
    // Configure starting balances: Cash ₹1,000, Online ₹500
    await app.inject({
      method: 'POST',
      url: '/api/v1/balances/starting',
      headers: { authorization: 'Bearer user-a-token' },
      payload: { starting_cash: '1000.00', starting_online: '500.00' },
    });

    // Create transfer of ₹400 from Cash to Online
    const transferId = uuidv7();
    const createRes = await balanceService.createTransfer(userA.userId, {
      id: transferId,
      from_method: 'cash',
      to_method: 'online',
      amount_paise: 40000n,
    });
    assert.equal(createRes.balances.current_cash_paise, 60000);
    assert.equal(createRes.balances.current_online_paise, 90000);

    // Update transfer amount to ₹800 (excluding current transfer, available cash is ₹1,000, so ₹800 succeeds)
    const updateRes1 = await balanceService.updateMovement(userA.userId, transferId, {
      amount_paise: 80000n,
    });
    assert.equal(updateRes1.balances.current_cash_paise, 20000);
    assert.equal(updateRes1.balances.current_online_paise, 130000);

    // Update transfer amount to ₹1,200 (attempting to transfer ₹1,200 when available Cash is only ₹1,000)
    await assert.rejects(
      async () => {
        await balanceService.updateMovement(userA.userId, transferId, {
          amount_paise: 120000n,
        });
      },
      /Insufficient cash balance/
    );
  });

  test('Scenario 4: Transfer amount increase and decrease', async () => {
    // Configure starting balances: Cash ₹1,000, Online ₹1,000
    await app.inject({
      method: 'POST',
      url: '/api/v1/balances/starting',
      headers: { authorization: 'Bearer user-a-token' },
      payload: { starting_cash: '1000.00', starting_online: '1000.00' },
    });

    const transferId = uuidv7();
    await balanceService.createTransfer(userA.userId, {
      id: transferId,
      from_method: 'cash',
      to_method: 'online',
      amount_paise: 50000n,
    });

    // Decrease transfer to ₹200 (Cash balance increases by ₹300 to ₹800; Online decreases to ₹1,200)
    const decRes = await balanceService.updateMovement(userA.userId, transferId, {
      amount_paise: 20000n,
    });
    assert.equal(decRes.balances.current_cash_paise, 80000);
    assert.equal(decRes.balances.current_online_paise, 120000);

    // Increase transfer to ₹900 (Cash decreases to ₹100, Online increases to ₹1,900)
    const incRes = await balanceService.updateMovement(userA.userId, transferId, {
      amount_paise: 90000n,
    });
    assert.equal(incRes.balances.current_cash_paise, 10000);
    assert.equal(incRes.balances.current_online_paise, 190000);

    // Increase transfer to ₹1,100 (exceeds total ₹1,000 Cash)
    await assert.rejects(
      async () => {
        await balanceService.updateMovement(userA.userId, transferId, {
          amount_paise: 110000n,
        });
      },
      /Insufficient cash balance/
    );
  });

  test('Scenario 5: Adjustment amount increase and decrease', async () => {
    // Configure starting balances: Cash ₹500, Online ₹500
    await app.inject({
      method: 'POST',
      url: '/api/v1/balances/starting',
      headers: { authorization: 'Bearer user-a-token' },
      payload: { starting_cash: '500.00', starting_online: '500.00' },
    });

    const adjId = uuidv7();
    // Negative adjustment of -₹200 Cash
    const adjRes = await balanceService.createAdjustment(userA.userId, {
      id: adjId,
      payment_method: 'cash',
      adjustment_paise: -20000n,
      reason: 'Physical count discrepancy',
    });
    assert.equal(adjRes.balances.current_cash_paise, 30000);

    // Update adjustment to -₹600 Cash (exceeds available ₹500)
    await assert.rejects(
      async () => {
        await balanceService.updateMovement(userA.userId, adjId, {
          adjustment_paise: -60000n,
        });
      },
      /Insufficient cash balance/
    );

    // Update adjustment to +₹300 Cash (Cash becomes ₹500 + ₹300 = ₹800)
    const posRes = await balanceService.updateMovement(userA.userId, adjId, {
      adjustment_paise: 30000n,
    });
    assert.equal(posRes.balances.current_cash_paise, 80000);
  });

  test('Scenario 6: Soft deletion of a movement (verified safe vs rejected if causing negative balance)', async () => {
    // Configure Cash ₹500, Online ₹0
    await app.inject({
      method: 'POST',
      url: '/api/v1/balances/starting',
      headers: { authorization: 'Bearer user-a-token' },
      payload: { starting_cash: '500.00', starting_online: '0.00' },
    });

    // Transfer ₹500 Cash to Online
    const transferId = uuidv7();
    await balanceService.createTransfer(userA.userId, {
      id: transferId,
      from_method: 'cash',
      to_method: 'online',
      amount_paise: 50000n,
    });

    // Record an Online expense of ₹400
    await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '400.00',
        type: 'expense',
        category_id: foodCategoryId,
        transaction_date: '2026-11-01',
        payment_method: 'online',
        necessity: 'essential',
      },
    });

    // Attempting to soft-delete the transfer would leave Online at -₹400!
    await assert.rejects(
      async () => {
        await balanceService.deleteMovement(userA.userId, transferId);
      },
      /Insufficient online balance for movement/
    );

    // If user adds ₹500 Online income, then soft-deleting the transfer leaves Online at +₹100
    await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '500.00',
        type: 'income',
        category_id: salaryCategoryId,
        transaction_date: '2026-11-01',
        payment_method: 'online',
      },
    });

    const delRes = await balanceService.deleteMovement(userA.userId, transferId);
    assert.equal(delRes.success, true);
    assert.equal(delRes.balances.current_cash_paise, 50000);
    assert.equal(delRes.balances.current_online_paise, 10000);
  });

  test('Scenario 7: Restoration of a movement (insufficient balance rejected)', async () => {
    // Configure Cash ₹500, Online ₹500
    await app.inject({
      method: 'POST',
      url: '/api/v1/balances/starting',
      headers: { authorization: 'Bearer user-a-token' },
      payload: { starting_cash: '500.00', starting_online: '500.00' },
    });

    const transferId = uuidv7();
    await balanceService.createTransfer(userA.userId, {
      id: transferId,
      from_method: 'cash',
      to_method: 'online',
      amount_paise: 40000n,
    });

    // Soft delete the transfer
    await balanceService.deleteMovement(userA.userId, transferId);

    // Spend ₹300 Cash, leaving only ₹200 Cash
    await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '300.00',
        type: 'expense',
        category_id: foodCategoryId,
        transaction_date: '2026-11-01',
        payment_method: 'cash',
        necessity: 'essential',
      },
    });

    // Restoring the ₹400 Cash-to-Online transfer requires ₹400 Cash, but user only has ₹200 Cash!
    await assert.rejects(
      async () => {
        await balanceService.restoreMovement(userA.userId, transferId);
      },
      /Insufficient cash balance/
    );

    // Record ₹500 Cash income
    await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '500.00',
        type: 'income',
        category_id: salaryCategoryId,
        transaction_date: '2026-11-01',
        payment_method: 'cash',
      },
    });

    // Now restoration succeeds
    const restoreRes = await balanceService.restoreMovement(userA.userId, transferId);
    assert.equal(restoreRes.movement.id, transferId);
    assert.equal(restoreRes.balances.current_cash_paise, 30000); // 500 - 300 + 500 - 400 = 300
    assert.equal(restoreRes.balances.current_online_paise, 90000); // 500 + 400 = 900
  });

  test('Scenario 8: Transaction payment-method change (Cash to Online or vice versa)', async () => {
    // Configure Cash ₹1,000, Online ₹100
    await app.inject({
      method: 'POST',
      url: '/api/v1/balances/starting',
      headers: { authorization: 'Bearer user-a-token' },
      payload: { starting_cash: '1000.00', starting_online: '100.00' },
    });

    const txId = uuidv7();
    const createTx = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: txId,
        amount: '500.00',
        type: 'expense',
        category_id: foodCategoryId,
        transaction_date: '2026-11-01',
        payment_method: 'cash',
        necessity: 'essential',
      },
    });
    assert.equal(createTx.statusCode, 201);

    // Attempting to update payment_method from Cash to Online (Online balance is only ₹100, needs ₹500)
    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/transactions/${txId}`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        payment_method: 'online',
      },
    });
    assert.equal(updateRes.statusCode, 400);
    assert.ok(updateRes.json().message.includes('Insufficient online balance'));

    // Transfer ₹500 from Cash to Online
    await balanceService.createTransfer(userA.userId, {
      from_method: 'cash',
      to_method: 'online',
      amount_paise: 50000n,
    });

    // Now update payment_method to Online succeeds
    const updateRes2 = await app.inject({
      method: 'PATCH',
      url: `/api/v1/transactions/${txId}`,
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        payment_method: 'online',
      },
    });
    assert.equal(updateRes2.statusCode, 200);
    const resBody = updateRes2.json();
    assert.equal(resBody.transaction.payment_method, 'online');
  });

  test('Scenario 9: Transaction owner change rejection', async () => {
    // User A creates a transaction
    const txId = uuidv7();
    await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: txId,
        amount: '100.00',
        type: 'income',
        category_id: salaryCategoryId,
        transaction_date: '2026-11-01',
        payment_method: 'cash',
      },
    });

    // Attempting to change user_id on transaction must be rejected
    await assert.rejects(
      async () => {
        await txService.updateTransaction(userA.userId, txId, {
          user_id: userB.userId,
        });
      },
      /Cannot change user ownership of a transaction/
    );
  });

  test('Scenario 10: Movement owner change rejection', async () => {
    // User A creates a movement
    const movementId = uuidv7();
    await balanceService.createAdjustment(userA.userId, {
      id: movementId,
      payment_method: 'cash',
      adjustment_paise: 5000n,
      reason: 'Discrepancy fix',
    });

    // Attempting to change user_id on movement must be rejected
    await assert.rejects(
      async () => {
        await balanceService.updateMovement(userA.userId, movementId, {
          user_id: userB.userId,
        });
      },
      /Cannot change user ownership of a balance movement/
    );
  });

  test('Scenario 11: Simultaneous expense requests (row lock concurrency protection)', async () => {
    // Configure Cash ₹1,000
    await app.inject({
      method: 'POST',
      url: '/api/v1/balances/starting',
      headers: { authorization: 'Bearer user-a-token' },
      payload: { starting_cash: '1000.00', starting_online: '0.00' },
    });

    // Fire two concurrent requests for ₹700 Cash
    const req1 = app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '700.00',
        type: 'expense',
        category_id: foodCategoryId,
        transaction_date: '2026-11-01',
        payment_method: 'cash',
        necessity: 'essential',
      },
    });

    const req2 = app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '700.00',
        type: 'expense',
        category_id: foodCategoryId,
        transaction_date: '2026-11-01',
        payment_method: 'cash',
        necessity: 'essential',
      },
    });

    const [res1, res2] = await Promise.all([req1, req2]);
    const statusCodes = [res1.statusCode, res2.statusCode].sort();

    // Exactly one must succeed (201) and one must be rejected (400)
    assert.deepEqual(statusCodes, [201, 400], 'One request must succeed and the other must be rejected');

    const balRes = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const finalBal: AccountBalancesDTO = balRes.json();
    assert.equal(finalBal.current_cash_paise, 30000, 'Remaining balance must be ₹300 (1000 - 700)');
  });

  test('Scenario 12: Starting-balance reconfiguration concurrent with an expense', async () => {
    // Initial configuration: Cash ₹1,000
    await app.inject({
      method: 'POST',
      url: '/api/v1/balances/starting',
      headers: { authorization: 'Bearer user-a-token' },
      payload: { starting_cash: '1000.00', starting_online: '0.00' },
    });

    // Reconfigure starting balances to ₹2,000 Cash concurrently with an expense of ₹800 Cash
    const reconfigPromise = app.inject({
      method: 'POST',
      url: '/api/v1/balances/starting',
      headers: { authorization: 'Bearer user-a-token' },
      payload: { starting_cash: '2000.00', starting_online: '0.00' },
    });

    const expensePromise = app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '800.00',
        type: 'expense',
        category_id: foodCategoryId,
        transaction_date: '2026-11-01',
        payment_method: 'cash',
        necessity: 'essential',
      },
    });

    const [reconfigRes, expenseRes] = await Promise.all([reconfigPromise, expensePromise]);
    assert.equal(reconfigRes.statusCode, 200);
    assert.equal(expenseRes.statusCode, 201);

    const balRes = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const bal: AccountBalancesDTO = balRes.json();
    // Invariant: Balance cannot be negative and must be either 200000 or 120000 depending on serialize order
    assert.ok(bal.current_cash_paise >= 0, 'Balance must remain non-negative');
  });

  test('Scenario 13: Pre-baseline offline mutation uploaded after configuration does NOT deduct from snapshot', async () => {
    // User configures snapshot on 1 Nov: Cash ₹2,000
    const configRes = await app.inject({
      method: 'POST',
      url: '/api/v1/balances/starting',
      headers: { authorization: 'Bearer user-a-token' },
      payload: { starting_cash: '2000.00', starting_online: '0.00' },
    });
    assert.equal(configRes.statusCode, 200);

    // Sync an offline expense created on 25 Oct (pre-baseline recorded_at)
    const syncRes = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '500.00',
        type: 'expense',
        category_id: foodCategoryId,
        transaction_date: '2026-10-25',
        payment_method: 'cash',
        necessity: 'essential',
        recorded_at: '2026-10-25T10:00:00.000Z',
      },
    });
    assert.equal(syncRes.statusCode, 201);

    // Balances must remain at snapshot ₹2,000 Cash
    const balRes = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const bal: AccountBalancesDTO = balRes.json();
    assert.equal(bal.current_cash_paise, 200000, 'Pre-baseline transaction must not deduct from snapshot');
  });

  test('Scenario 14: Post-baseline offline mutation uploaded after configuration DOES deduct from snapshot', async () => {
    // User configures snapshot on 1 Nov: Cash ₹2,000
    await app.inject({
      method: 'POST',
      url: '/api/v1/balances/starting',
      headers: { authorization: 'Bearer user-a-token' },
      payload: { starting_cash: '2000.00', starting_online: '0.00' },
    });

    // Offline expense recorded on 2 Nov (after baseline)
    const postBaselineTime = new Date(Date.now() + 5000).toISOString();
    const syncRes = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: uuidv7(),
        amount: '500.00',
        type: 'expense',
        category_id: foodCategoryId,
        transaction_date: '2026-11-02',
        payment_method: 'cash',
        necessity: 'essential',
        recorded_at: postBaselineTime,
      },
    });
    assert.equal(syncRes.statusCode, 201);

    // Balances must reflect deduction from snapshot: ₹2,000 - ₹500 = ₹1,500 Cash
    const balRes = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const bal: AccountBalancesDTO = balRes.json();
    assert.equal(bal.current_cash_paise, 150000, 'Post-baseline transaction must deduct from snapshot');
  });
});
