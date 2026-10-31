import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SupabaseBalanceService } from '../src/modules/balances/balance.service.js';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('Database Function fn_account_balances & RPC Contract Audit', () => {
  const migrationsDir = path.resolve(process.cwd(), '../supabase/migrations');
  const migration0024 = path.join(migrationsDir, '0024_account_balances_rpc_hardening.sql');
  const migration0018 = path.join(migrationsDir, '0018_account_balances_and_transfers.sql');

  test('0024 migration defines exact public.fn_account_balances() signature with 0 parameters', () => {
    assert.ok(fs.existsSync(migration0024), '0024 migration must exist');
    const sql = fs.readFileSync(migration0024, 'utf-8');

    // Function signature
    assert.match(
      sql,
      /CREATE OR REPLACE FUNCTION public\.fn_account_balances\(\)\s*RETURNS JSONB/i,
      'Must define fn_account_balances without parameters returning JSONB'
    );
    assert.match(sql, /SECURITY INVOKER/i, 'Must enforce SECURITY INVOKER for caller security context');
    assert.match(sql, /SET search_path = public, auth/i, 'Must restrict search_path to public and auth');
  });

  test('0024 migration explicitly grants EXECUTE to authenticated and revokes from public and anon', () => {
    const sql = fs.readFileSync(migration0024, 'utf-8');
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.fn_account_balances\(\) FROM PUBLIC;/i,
      'Must revoke execution from PUBLIC'
    );
    assert.match(
      sql,
      /REVOKE ALL ON FUNCTION public\.fn_account_balances\(\) FROM anon;/i,
      'Must revoke execution from anon'
    );
    assert.match(
      sql,
      /GRANT EXECUTE ON FUNCTION public\.fn_account_balances\(\) TO authenticated;/i,
      'Must grant execution to authenticated role'
    );
    assert.match(
      sql,
      /NOTIFY pgrst, 'reload schema';/i,
      'Must reload PostgREST schema cache'
    );
  });

  test('0024 migration enforces user isolation via auth.uid() and rejects unauthenticated callers', () => {
    const sql = fs.readFileSync(migration0024, 'utf-8');
    assert.ok(sql.includes('v_user_id := auth.uid();'), 'Must derive identity from auth.uid()');
    assert.ok(sql.includes("RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';"), 'Must reject unauthenticated calls');
    assert.ok(sql.includes('WHERE user_id = v_user_id'), 'Transactions and movements must filter strictly by v_user_id');
    assert.ok(sql.includes('AND deleted_at IS NULL'), 'Soft-deleted transactions and movements must be excluded');
  });

  test('0024 migration computes exact integer paise balances without double-counting', () => {
    const sql = fs.readFileSync(migration0024, 'utf-8');

    // Cash balance derivation
    assert.ok(
      sql.includes('v_current_cash := v_starting_cash + v_cash_income - v_cash_expense + (v_transfers_cash_in - v_transfers_cash_out) + v_cash_adjustments;'),
      'Must accurately derive current cash balance'
    );

    // Online balance derivation
    assert.ok(
      sql.includes('v_current_online := v_starting_online + v_online_income - v_online_expense + (v_transfers_online_in - v_transfers_online_out) + v_online_adjustments;'),
      'Must accurately derive current online balance'
    );

    // Total available
    assert.ok(
      sql.includes('v_total_available := v_current_cash + v_current_online;'),
      'Must compute Total Available as Cash + Online'
    );

    // Transfer direction isolation (no double counting)
    assert.ok(
      sql.includes("WHERE movement_type = 'transfer' AND to_method = 'cash'"),
      'Must sum cash in transfers'
    );
    assert.ok(
      sql.includes("WHERE movement_type = 'transfer' AND from_method = 'cash'"),
      'Must sum cash out transfers'
    );
  });

  test('SupabaseBalanceService calls fn_account_balances with no parameters', async () => {
    let calledRpc: string | null = null;
    let rpcArgs: unknown = null;

    const mockClient = {
      rpc: async (fnName: string, args?: unknown) => {
        calledRpc = fnName;
        rpcArgs = args;
        return {
          data: {
            starting_cash_paise: 500000,
            starting_online_paise: 1500000,
            starting_total_paise: 2000000,
            current_cash_paise: 450000,
            current_online_paise: 1600000,
            total_available_paise: 2050000,
            balances_configured: true,
            balances_configured_at: '2026-10-31T00:00:00.000Z',
          },
          error: null,
        };
      },
    } as unknown as SupabaseClient;

    const service = new SupabaseBalanceService(
      {
        env: 'test',
        port: 3001,
        host: '0.0.0.0',
        corsOrigin: '*',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        jwtAudience: 'authenticated',
      },
      mockClient
    );

    const result = await service.getBalances('user-test-uuid', 'token-abc');

    assert.equal(calledRpc, 'fn_account_balances', 'Must call public.fn_account_balances');
    assert.equal(rpcArgs, undefined, 'Must invoke without parameters');
    assert.equal(result.starting_cash_paise, 500000);
    assert.equal(result.starting_online_paise, 1500000);
    assert.equal(result.starting_total_paise, 2000000);
    assert.equal(result.current_cash_paise, 450000);
    assert.equal(result.current_online_paise, 1600000);
    assert.equal(result.total_available_paise, 2050000);
    assert.equal(result.balances_configured, true);
    assert.equal(result.formatted_starting_cash, '₹5,000.00');
    assert.equal(result.formatted_starting_online, '₹15,000.00');
    assert.equal(result.formatted_total_available, '₹20,500.00');
  });

  test('SupabaseBalanceService correctly diagnoses PostgREST schema cache missing function error', async () => {
    const mockClient = {
      rpc: async () => ({
        data: null,
        error: {
          code: 'PGRST202',
          message: 'Could not find the function public.fn_account_balances without parameters in the schema cache',
          details: null,
          hint: null,
        },
      }),
    } as unknown as SupabaseClient;

    const service = new SupabaseBalanceService(
      {
        env: 'test',
        port: 3001,
        host: '0.0.0.0',
        corsOrigin: '*',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        jwtAudience: 'authenticated',
      },
      mockClient
    );

    await assert.rejects(
      async () => {
        await service.getBalances('user-test-uuid', 'token-abc');
      },
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes('Could not find the function public.fn_account_balances without parameters in the schema cache')
        );
        return true;
      }
    );
  });
});
