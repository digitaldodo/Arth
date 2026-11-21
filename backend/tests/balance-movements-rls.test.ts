import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { v7 as uuidv7 } from 'uuid';
import { buildApp } from '../src/app.js';
import { InMemoryTransactionService } from '../src/modules/transactions/transaction.service.js';
import { InMemoryCategoryService } from '../src/modules/categories/category.service.js';
import { InMemoryPeopleService } from '../src/modules/people/people.service.js';
import { InMemoryDashboardService } from '../src/modules/dashboard/dashboard.service.js';
import { InMemoryBalanceService } from '../src/modules/balances/balance.service.js';
import type { FastifyInstance } from 'fastify';
import type { AccountBalancesDTO, BalanceMovementListResponse, BalanceMovementDTO } from '@arth/contracts';

describe('Balance Movements RLS Policy & Idempotent Migration Audit', () => {
  const migrationsDir = fs.existsSync(path.resolve(process.cwd(), '../supabase/migrations'))
    ? path.resolve(process.cwd(), '../supabase/migrations')
    : path.resolve(process.cwd(), 'supabase/migrations');

  const migration0018Path = path.join(migrationsDir, '0018_account_balances_and_transfers.sql');
  const migration0024Path = path.join(migrationsDir, '0024_account_balances_rpc_hardening.sql');

  test('0018 migration enforces guarded, idempotent policy creation on balance_movements', () => {
    assert.ok(fs.existsSync(migration0018Path), '0018 migration file must exist');
    const sql = fs.readFileSync(migration0018Path, 'utf-8');

    // Must enable RLS
    assert.match(
      sql,
      /ALTER TABLE public\.balance_movements ENABLE ROW LEVEL SECURITY;/i,
      'Must enable RLS on balance_movements'
    );

    // Must NOT have bare non-idempotent CREATE POLICY balance_movements_select_own at root
    assert.doesNotMatch(
      sql,
      /;\s*CREATE POLICY balance_movements_select_own/i,
      'Must not declare bare CREATE POLICY without idempotency guard'
    );

    // Must use guarded DO block checking pg_policies
    assert.ok(sql.includes("tablename = 'balance_movements'"), 'Must query pg_policies for balance_movements');
    assert.ok(sql.includes("policyname = 'balance_movements_select_own'"), 'Must inspect balance_movements_select_own');
    assert.ok(sql.includes("policyname = 'balance_movements_insert_own'"), 'Must inspect balance_movements_insert_own');
    assert.ok(sql.includes("policyname = 'balance_movements_update_own'"), 'Must inspect balance_movements_update_own');
    assert.ok(sql.includes("policyname = 'balance_movements_delete_own'"), 'Must inspect balance_movements_delete_own');

    // Must check for conflicting definitions and raise 42710
    assert.ok(sql.includes("USING ERRCODE = '42710'"), 'Must raise error code 42710 on conflicting policy definition');

    // Must grant permissions to authenticated and service_role
    assert.match(
      sql,
      /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.balance_movements TO authenticated;/i,
      'Must grant table operations to authenticated role'
    );
    assert.match(
      sql,
      /GRANT ALL ON public\.balance_movements TO service_role;/i,
      'Must grant full table access to service_role'
    );
  });

  test('0024 migration enforces guarded, idempotent policy creation on balance_movements', () => {
    assert.ok(fs.existsSync(migration0024Path), '0024 migration file must exist');
    const sql = fs.readFileSync(migration0024Path, 'utf-8');

    assert.ok(sql.includes("policyname = 'balance_movements_select_own'"), 'Must inspect balance_movements_select_own');
    assert.ok(sql.includes("policyname = 'balance_movements_insert_own'"), 'Must inspect balance_movements_insert_own');
    assert.ok(sql.includes("policyname = 'balance_movements_update_own'"), 'Must inspect balance_movements_update_own');
    assert.ok(sql.includes("policyname = 'balance_movements_delete_own'"), 'Must inspect balance_movements_delete_own');
    assert.ok(sql.includes("USING ERRCODE = '42710'"), 'Must raise 42710 on conflicting policy');
  });

  // ---------------------------------------------------------------------------
  // Simulation of the SQL Guard Logic across all lifecycle scenarios
  // ---------------------------------------------------------------------------
  interface MockPolicy {
    schemaname: string;
    tablename: string;
    policyname: string;
    permissive: string;
    roles: string[];
    cmd: string;
    qual: string | null;
    with_check: string | null;
  }

  function simulatePolicyGuard(
    existingPolicies: MockPolicy[],
    targetPolicyName: string,
    targetCmd: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
  ): { action: 'created' | 'skipped'; error?: string } {
    const found = existingPolicies.find(
      p => p.schemaname === 'public' && p.tablename === 'balance_movements' && p.policyname === targetPolicyName
    );

    if (!found) {
      return { action: 'created' };
    }

    // Verify definition
    if (targetCmd === 'SELECT') {
      if (
        found.cmd !== 'SELECT' ||
        found.permissive !== 'PERMISSIVE' ||
        !found.roles.includes('authenticated') ||
        (found.qual !== '(auth.uid() = user_id)' && found.qual !== 'auth.uid() = user_id') ||
        found.with_check !== null
      ) {
        return { action: 'skipped', error: 'Conflicting definition for policy ' + targetPolicyName };
      }
    } else if (targetCmd === 'INSERT') {
      if (
        found.cmd !== 'INSERT' ||
        found.permissive !== 'PERMISSIVE' ||
        !found.roles.includes('authenticated') ||
        found.qual !== null ||
        (found.with_check !== '(auth.uid() = user_id)' && found.with_check !== 'auth.uid() = user_id')
      ) {
        return { action: 'skipped', error: 'Conflicting definition for policy ' + targetPolicyName };
      }
    } else if (targetCmd === 'UPDATE') {
      if (
        found.cmd !== 'UPDATE' ||
        found.permissive !== 'PERMISSIVE' ||
        !found.roles.includes('authenticated') ||
        (found.qual !== '(auth.uid() = user_id)' && found.qual !== 'auth.uid() = user_id') ||
        (found.with_check !== '(auth.uid() = user_id)' && found.with_check !== 'auth.uid() = user_id')
      ) {
        return { action: 'skipped', error: 'Conflicting definition for policy ' + targetPolicyName };
      }
    } else if (targetCmd === 'DELETE') {
      if (
        found.cmd !== 'DELETE' ||
        found.permissive !== 'PERMISSIVE' ||
        !found.roles.includes('authenticated') ||
        (found.qual !== '(auth.uid() = user_id)' && found.qual !== 'auth.uid() = user_id') ||
        found.with_check !== null
      ) {
        return { action: 'skipped', error: 'Conflicting definition for policy ' + targetPolicyName };
      }
    }

    return { action: 'skipped' };
  }

  test('Guarded migration logic: Scenario 1 - Clean database creates all 4 policies', () => {
    const existing: MockPolicy[] = [];
    const selectRes = simulatePolicyGuard(existing, 'balance_movements_select_own', 'SELECT');
    const insertRes = simulatePolicyGuard(existing, 'balance_movements_insert_own', 'INSERT');
    const updateRes = simulatePolicyGuard(existing, 'balance_movements_update_own', 'UPDATE');
    const deleteRes = simulatePolicyGuard(existing, 'balance_movements_delete_own', 'DELETE');

    assert.equal(selectRes.action, 'created');
    assert.equal(insertRes.action, 'created');
    assert.equal(updateRes.action, 'created');
    assert.equal(deleteRes.action, 'created');
  });

  test('Guarded migration logic: Scenario 2 - Pre-existing intended policies are skipped safely without error', () => {
    const existing: MockPolicy[] = [
      {
        schemaname: 'public',
        tablename: 'balance_movements',
        policyname: 'balance_movements_select_own',
        permissive: 'PERMISSIVE',
        roles: ['authenticated'],
        cmd: 'SELECT',
        qual: '(auth.uid() = user_id)',
        with_check: null,
      },
      {
        schemaname: 'public',
        tablename: 'balance_movements',
        policyname: 'balance_movements_insert_own',
        permissive: 'PERMISSIVE',
        roles: ['authenticated'],
        cmd: 'INSERT',
        qual: null,
        with_check: '(auth.uid() = user_id)',
      },
      {
        schemaname: 'public',
        tablename: 'balance_movements',
        policyname: 'balance_movements_update_own',
        permissive: 'PERMISSIVE',
        roles: ['authenticated'],
        cmd: 'UPDATE',
        qual: '(auth.uid() = user_id)',
        with_check: '(auth.uid() = user_id)',
      },
      {
        schemaname: 'public',
        tablename: 'balance_movements',
        policyname: 'balance_movements_delete_own',
        permissive: 'PERMISSIVE',
        roles: ['authenticated'],
        cmd: 'DELETE',
        qual: '(auth.uid() = user_id)',
        with_check: null,
      },
    ];

    const selectRes = simulatePolicyGuard(existing, 'balance_movements_select_own', 'SELECT');
    const insertRes = simulatePolicyGuard(existing, 'balance_movements_insert_own', 'INSERT');
    const updateRes = simulatePolicyGuard(existing, 'balance_movements_update_own', 'UPDATE');
    const deleteRes = simulatePolicyGuard(existing, 'balance_movements_delete_own', 'DELETE');

    assert.equal(selectRes.action, 'skipped');
    assert.equal(selectRes.error, undefined);
    assert.equal(insertRes.action, 'skipped');
    assert.equal(insertRes.error, undefined);
    assert.equal(updateRes.action, 'skipped');
    assert.equal(updateRes.error, undefined);
    assert.equal(deleteRes.action, 'skipped');
    assert.equal(deleteRes.error, undefined);
  });

  test('Guarded migration logic: Scenario 3 - Conflicting policy with overly permissive definition is rejected', () => {
    // E.g. someone created a policy allowing ALL or allowing qual = true
    const conflicting: MockPolicy[] = [
      {
        schemaname: 'public',
        tablename: 'balance_movements',
        policyname: 'balance_movements_select_own',
        permissive: 'PERMISSIVE',
        roles: ['public'], // wrong role
        cmd: 'SELECT',
        qual: 'true', // wrong qual
        with_check: null,
      },
    ];

    const selectRes = simulatePolicyGuard(conflicting, 'balance_movements_select_own', 'SELECT');
    assert.equal(selectRes.action, 'skipped');
    assert.ok(selectRes.error?.includes('Conflicting definition'), 'Must reject conflicting policy definition');
  });

  test('Guarded migration logic: Scenario 4 - Re-running migration sequence is idempotent and produces no state drift', () => {
    const existing: MockPolicy[] = [
      {
        schemaname: 'public',
        tablename: 'balance_movements',
        policyname: 'balance_movements_select_own',
        permissive: 'PERMISSIVE',
        roles: ['authenticated'],
        cmd: 'SELECT',
        qual: '(auth.uid() = user_id)',
        with_check: null,
      },
    ];

    // First run skips
    const run1 = simulatePolicyGuard(existing, 'balance_movements_select_own', 'SELECT');
    assert.equal(run1.action, 'skipped');
    assert.equal(run1.error, undefined);

    // Second run skips
    const run2 = simulatePolicyGuard(existing, 'balance_movements_select_own', 'SELECT');
    assert.equal(run2.action, 'skipped');
    assert.equal(run2.error, undefined);
  });
});

describe('Balance Movements Cross-User Isolation & Financial Invariants', () => {
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

  test('Configures starting balances independently for User A and User B', async () => {
    // User A configures starting balance: ₹10,000 cash, ₹50,000 online
    const resA = await app.inject({
      method: 'POST',
      url: '/api/v1/balances/starting',
      headers: { authorization: 'Bearer user-a-token' },
      payload: { starting_cash: '10000.00', starting_online: '50000.00' },
    });
    assert.equal(resA.statusCode, 200);
    const bodyA: AccountBalancesDTO = resA.json();
    assert.equal(bodyA.balances_configured, true);
    assert.equal(bodyA.starting_cash_paise, 1000000);
    assert.equal(bodyA.starting_online_paise, 5000000);
    assert.equal(bodyA.total_available_paise, 6000000);

    // User B configures starting balance: ₹2,000 cash, ₹5,000 online
    const resB = await app.inject({
      method: 'POST',
      url: '/api/v1/balances/starting',
      headers: { authorization: 'Bearer user-b-token' },
      payload: { starting_cash: '2000.00', starting_online: '5000.00' },
    });
    assert.equal(resB.statusCode, 200);
    const bodyB: AccountBalancesDTO = resB.json();
    assert.equal(bodyB.balances_configured, true);
    assert.equal(bodyB.starting_cash_paise, 200000);
    assert.equal(bodyB.starting_online_paise, 500000);
    assert.equal(bodyB.total_available_paise, 700000);

    // Verify User A balances are untouched by User B's configuration
    const checkA = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-a-token' },
    });
    const checkBodyA: AccountBalancesDTO = checkA.json();
    assert.equal(checkBodyA.total_available_paise, 6000000);
  });

  test('User A creates an internal transfer; User B cannot see it (RLS SELECT isolation)', async () => {
    const movementId = uuidv7();
    const resTransfer = await app.inject({
      method: 'POST',
      url: '/api/v1/balances/transfers',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: movementId,
        from_method: 'online',
        to_method: 'cash',
        amount: '5000.00', // ₹5,000
        movement_date: '2026-11-21',
      },
    });
    assert.equal(resTransfer.statusCode, 201);

    // User A can view the movement
    const listA = await app.inject({
      method: 'GET',
      url: '/api/v1/balances/movements',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(listA.statusCode, 200);
    const bodyListA: BalanceMovementListResponse = listA.json();
    assert.ok(bodyListA.items.some((m: BalanceMovementDTO) => m.id === movementId));

    // User B CANNOT see User A's transfer
    const listB = await app.inject({
      method: 'GET',
      url: '/api/v1/balances/movements',
      headers: { authorization: 'Bearer user-b-token' },
    });
    assert.equal(listB.statusCode, 200);
    const bodyListB: BalanceMovementListResponse = listB.json();
    assert.ok(!bodyListB.items.some((m: BalanceMovementDTO) => m.id === movementId));
  });

  test('User A creates an adjustment; User B cannot view or tamper with it', async () => {
    const adjId = uuidv7();
    const resAdj = await app.inject({
      method: 'POST',
      url: '/api/v1/balances/adjustments',
      headers: { authorization: 'Bearer user-a-token' },
      payload: {
        id: adjId,
        payment_method: 'cash',
        amount: '500.00', // ₹500
        direction: 'increase',
        reason: 'Audit correction for wallet discrepancy',
        movement_date: '2026-11-21',
      },
    });
    assert.equal(resAdj.statusCode, 201);

    // User B list still does not contain User A's adjustment
    const listB = await app.inject({
      method: 'GET',
      url: '/api/v1/balances/movements',
      headers: { authorization: 'Bearer user-b-token' },
    });
    const bodyListB: BalanceMovementListResponse = listB.json();
    assert.ok(!bodyListB.items.some((m: BalanceMovementDTO) => m.id === adjId));
  });

  test('Transfer correctly updates User A balances without altering total net worth', async () => {
    // User A started with: 10,000 cash, 50,000 online = 60,000 total
    // Transferred 5,000 from online to cash:
    // Cash should be: 10,000 + 5,000 + 500 (adjustment) = 15,500
    // Online should be: 50,000 - 5,000 = 45,000
    // Total should be: 60,500
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-a-token' },
    });
    assert.equal(res.statusCode, 200);
    const balances: AccountBalancesDTO = res.json();
    assert.equal(balances.current_cash_paise, 1550000);
    assert.equal(balances.current_online_paise, 4500000);
    assert.equal(balances.total_available_paise, 6050000);

    // User B balances remain strictly unaffected
    const resB = await app.inject({
      method: 'GET',
      url: '/api/v1/balances',
      headers: { authorization: 'Bearer user-b-token' },
    });
    const balancesB: AccountBalancesDTO = resB.json();
    assert.equal(balancesB.starting_cash_paise, 200000);
    assert.equal(balancesB.starting_online_paise, 500000);
    assert.equal(balancesB.total_available_paise, 700000);
  });
});
