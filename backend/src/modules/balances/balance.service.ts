import { v7 as uuidv7 } from 'uuid';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  formatPaiseToINR,
  type AccountBalancesDTO,
  type BalanceMovementDTO,
  type BalanceMovementListResponse,
  type PaymentMethod,
} from '@arth/contracts';
import type { AppConfig } from '../../config/index.js';
import {
  BalanceValidationError,
  type ValidatedConfigureStartingBalances,
  ValidatedCreateTransfer,
  ValidatedCreateAdjustment,
} from './balance.validation.js';
import type { InMemoryTransactionService } from '../transactions/transaction.service.js';

export interface IBalanceService {
  getBalances(userId: string, token?: string): Promise<AccountBalancesDTO>;
  configureStartingBalances(
    userId: string,
    data: ValidatedConfigureStartingBalances,
    token?: string
  ): Promise<AccountBalancesDTO>;
  createTransfer(
    userId: string,
    data: ValidatedCreateTransfer,
    token?: string
  ): Promise<{ movement: BalanceMovementDTO; balances: AccountBalancesDTO }>;
  createAdjustment(
    userId: string,
    data: ValidatedCreateAdjustment,
    token?: string
  ): Promise<{ movement: BalanceMovementDTO; balances: AccountBalancesDTO }>;
  getMovements(userId: string, token?: string): Promise<BalanceMovementListResponse>;
}

export class SupabaseBalanceService implements IBalanceService {
  constructor(
    private readonly config: AppConfig,
    private readonly customClient?: SupabaseClient
  ) {}

  private getScopedClient(token?: string): SupabaseClient {
    if (this.customClient) {
      return this.customClient;
    }

    if (!this.config.supabaseUrl || !this.config.supabaseAnonKey) {
      throw new Error('Supabase client is not configured on the backend');
    }

    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return createClient(this.config.supabaseUrl, this.config.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { headers },
    });
  }

  async getBalances(userId: string, token?: string): Promise<AccountBalancesDTO> {
    const client = this.getScopedClient(token);

    const { data: rpcData, error: rpcErr } = await client.rpc('fn_account_balances');
    if (rpcErr || !rpcData) {
      console.error(`[BalanceService] RPC fn_account_balances failed:`, rpcErr?.message);
      throw new Error(`Failed to calculate account balances: ${rpcErr?.message || 'Empty response'}`);
    }

    return this.mapRpcBalances(rpcData as Record<string, unknown>);
  }

  private mapRpcBalances(rpcData: Record<string, unknown>): AccountBalancesDTO {
    const startingCash = Number(rpcData.starting_cash_paise || 0);
    const startingOnline = Number(rpcData.starting_online_paise || 0);
    const startingTotal = Number(rpcData.starting_total_paise || 0);
    const currentCash = Number(rpcData.current_cash_paise || 0);
    const currentOnline = Number(rpcData.current_online_paise || 0);
    const totalAvailable = Number(rpcData.total_available_paise || 0);
    const balancesConfigured = Boolean(
      rpcData.balances_configured || startingCash > 0 || startingOnline > 0
    );

    return {
      starting_cash_paise: startingCash,
      starting_online_paise: startingOnline,
      starting_total_paise: startingTotal,
      current_cash_paise: currentCash,
      current_online_paise: currentOnline,
      total_available_paise: totalAvailable,
      formatted_starting_cash: formatPaiseToINR(startingCash),
      formatted_starting_online: formatPaiseToINR(startingOnline),
      formatted_starting_total: formatPaiseToINR(startingTotal),
      formatted_current_cash: formatPaiseToINR(currentCash),
      formatted_current_online: formatPaiseToINR(currentOnline),
      formatted_total_available: formatPaiseToINR(totalAvailable),
      balances_configured: balancesConfigured,
      balances_configured_at: (rpcData.balances_configured_at as string) || null,
    };
  }

  async configureStartingBalances(
    userId: string,
    data: ValidatedConfigureStartingBalances,
    token?: string
  ): Promise<AccountBalancesDTO> {
    const client = this.getScopedClient(token);

    // 1. Attempt authoritative RPC fn_configure_starting_balances if available
    try {
      const { data: rpcData, error: rpcErr } = await client.rpc('fn_configure_starting_balances', {
        p_starting_cash_paise: data.starting_cash_paise.toString(),
        p_starting_online_paise: data.starting_online_paise.toString(),
      });
      if (!rpcErr && rpcData) {
        return this.mapRpcBalances(rpcData as Record<string, unknown>);
      }
    } catch {
      // Fall through to direct table update
    }

    // 2. Direct profiles table update
    let { error } = await client
      .from('profiles')
      .update({
        starting_cash_paise: data.starting_cash_paise.toString(),
        starting_online_paise: data.starting_online_paise.toString(),
        balances_configured: true,
        balances_configured_at: new Date().toISOString(),
      })
      .eq('id', userId);

    // 3. Fallback: if PostgREST schema cache is missing "balances_configured" column
    if (
      error &&
      (error.message.includes('balances_configured') ||
        error.message.includes('schema cache') ||
        error.code === 'PGRST204')
    ) {
      console.warn(
        `[BalanceService] "balances_configured" not in schema cache. Updating starting balances without the column.`
      );
      const fallbackResult = await client
        .from('profiles')
        .update({
          starting_cash_paise: data.starting_cash_paise.toString(),
          starting_online_paise: data.starting_online_paise.toString(),
        })
        .eq('id', userId);

      if (fallbackResult.error) {
        console.error(`[BalanceService] Fallback profile update failed:`, fallbackResult.error.message);
        throw new Error(`Failed to save starting balances: ${fallbackResult.error.message}`);
      }
      error = null;
    }

    if (error) {
      console.error(`[BalanceService] Failed to configure starting balances:`, error.message);
      throw new Error(`Failed to save starting balances: ${error.message}`);
    }

    return this.getBalances(userId, token);
  }

  async createTransfer(
    userId: string,
    data: ValidatedCreateTransfer,
    token?: string
  ): Promise<{ movement: BalanceMovementDTO; balances: AccountBalancesDTO }> {
    const client = this.getScopedClient(token);
    const movementId = data.id || uuidv7();

    const insertPayload = {
      id: movementId,
      user_id: userId,
      movement_type: 'transfer',
      from_method: data.from_method,
      to_method: data.to_method,
      amount_paise: data.amount_paise.toString(),
      reason: data.reason || null,
      movement_date: data.movement_date || undefined,
      recorded_at: data.recorded_at || undefined,
    };

    const { data: inserted, error } = await client
      .from('balance_movements')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      if (error.code === '22003' || error.message?.includes('Insufficient')) {
        throw new BalanceValidationError(error.message);
      }
      console.error(`[BalanceService] Failed to record transfer:`, error.message);
      throw new Error(`Failed to record transfer: ${error.message}`);
    }

    const movement: BalanceMovementDTO = {
      id: inserted.id,
      movement_type: 'transfer',
      from_method: inserted.from_method,
      to_method: inserted.to_method,
      amount_paise: Number(inserted.amount_paise),
      adjustment_paise: 0,
      formatted_amount: formatPaiseToINR(Number(inserted.amount_paise)),
      reason: inserted.reason,
      movement_date: inserted.movement_date,
      recorded_at: inserted.recorded_at || inserted.created_at,
      created_at: inserted.created_at,
      updated_at: inserted.updated_at,
    };

    const balances = await this.getBalances(userId, token);
    return { movement, balances };
  }

  async createAdjustment(
    userId: string,
    data: ValidatedCreateAdjustment,
    token?: string
  ): Promise<{ movement: BalanceMovementDTO; balances: AccountBalancesDTO }> {
    const client = this.getScopedClient(token);
    const movementId = data.id || uuidv7();

    const insertPayload = {
      id: movementId,
      user_id: userId,
      movement_type: 'adjustment',
      payment_method: data.payment_method,
      adjustment_paise: data.adjustment_paise.toString(),
      reason: data.reason,
      movement_date: data.movement_date || undefined,
      recorded_at: data.recorded_at || undefined,
    };

    const { data: inserted, error } = await client
      .from('balance_movements')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) {
      if (error.code === '22003' || error.message?.includes('Insufficient')) {
        throw new BalanceValidationError(error.message);
      }
      console.error(`[BalanceService] Failed to record adjustment:`, error.message);
      throw new Error(`Failed to record adjustment: ${error.message}`);
    }

    const movement: BalanceMovementDTO = {
      id: inserted.id,
      movement_type: 'adjustment',
      payment_method: inserted.payment_method,
      amount_paise: Math.abs(Number(inserted.adjustment_paise)),
      adjustment_paise: Number(inserted.adjustment_paise),
      formatted_amount: formatPaiseToINR(Math.abs(Number(inserted.adjustment_paise))),
      reason: inserted.reason,
      movement_date: inserted.movement_date,
      recorded_at: inserted.recorded_at || inserted.created_at,
      created_at: inserted.created_at,
      updated_at: inserted.updated_at,
    };

    const balances = await this.getBalances(userId, token);
    return { movement, balances };
  }

  async getMovements(userId: string, token?: string): Promise<BalanceMovementListResponse> {
    const client = this.getScopedClient(token);

    const { data: rows, error, count } = await client
      .from('balance_movements')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('movement_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error(`[BalanceService] Failed to fetch movements:`, error.message);
      throw new Error(`Failed to retrieve balance movements: ${error.message}`);
    }

    const items: BalanceMovementDTO[] = (rows || []).map((row) => ({
      id: row.id,
      movement_type: row.movement_type,
      from_method: row.from_method || null,
      to_method: row.to_method || null,
      payment_method: row.payment_method || null,
      amount_paise: Number(row.amount_paise || 0),
      adjustment_paise: Number(row.adjustment_paise || 0),
      formatted_amount: formatPaiseToINR(
        row.movement_type === 'adjustment'
          ? Math.abs(Number(row.adjustment_paise || 0))
          : Number(row.amount_paise || 0)
      ),
      reason: row.reason || null,
      movement_date: row.movement_date,
      recorded_at: row.recorded_at || row.created_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return {
      items,
      total_count: count ?? items.length,
    };
  }
}

export interface InMemoryBalanceRecord {
  starting_cash_paise: bigint;
  starting_online_paise: bigint;
  balances_configured: boolean;
  balances_configured_at: string | null;
}

export interface StoredMovementRecord {
  id: string;
  user_id: string;
  movement_type: 'transfer' | 'adjustment';
  from_method?: PaymentMethod | null;
  to_method?: PaymentMethod | null;
  payment_method?: PaymentMethod | null;
  amount_paise: bigint;
  adjustment_paise: bigint;
  reason?: string | null;
  movement_date: string;
  recorded_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export class InMemoryBalanceService implements IBalanceService {
  private userBalances = new Map<string, InMemoryBalanceRecord>();
  public movements: StoredMovementRecord[] = [];

  constructor(private readonly transactionService?: InMemoryTransactionService) {
    if (transactionService) {
      transactionService.balanceService = this;
    }
  }

  async getBalances(userId: string): Promise<AccountBalancesDTO> {
    const starting = this.userBalances.get(userId) || {
      starting_cash_paise: 0n,
      starting_online_paise: 0n,
      balances_configured: false,
      balances_configured_at: null,
    };

    let cashIncome = 0n;
    let cashExpense = 0n;
    let onlineIncome = 0n;
    let onlineExpense = 0n;

    if (this.transactionService) {
      for (const t of this.transactionService.transactions) {
        if (t.user_id !== userId || t.deleted_at !== null || t.account_id != null) continue;
        if (starting.balances_configured_at && (t.recorded_at || t.created_at) <= starting.balances_configured_at) continue;
        const paise = BigInt(t.amount_paise);
        if (t.payment_method === 'cash') {
          if (t.type === 'income') cashIncome += paise;
          else if (t.type === 'expense') cashExpense += paise;
        } else if (t.payment_method === 'online') {
          if (t.type === 'income') onlineIncome += paise;
          else if (t.type === 'expense') onlineExpense += paise;
        }
      }
    }

    let transferCashIn = 0n;
    let transferCashOut = 0n;
    let transferOnlineIn = 0n;
    let transferOnlineOut = 0n;
    let cashAdjustments = 0n;
    let onlineAdjustments = 0n;

    for (const m of this.movements) {
      if (m.user_id !== userId || m.deleted_at !== null) continue;
      if (starting.balances_configured_at && (m.recorded_at || m.created_at) <= starting.balances_configured_at) continue;
      if (m.movement_type === 'transfer') {
        if (m.to_method === 'cash') transferCashIn += m.amount_paise;
        if (m.from_method === 'cash') transferCashOut += m.amount_paise;
        if (m.to_method === 'online') transferOnlineIn += m.amount_paise;
        if (m.from_method === 'online') transferOnlineOut += m.amount_paise;
      } else if (m.movement_type === 'adjustment') {
        if (m.payment_method === 'cash') cashAdjustments += m.adjustment_paise;
        if (m.payment_method === 'online') onlineAdjustments += m.adjustment_paise;
      }
    }

    let currentCash =
      starting.starting_cash_paise +
      cashIncome -
      cashExpense +
      (transferCashIn - transferCashOut) +
      cashAdjustments;

    let currentOnline =
      starting.starting_online_paise +
      onlineIncome -
      onlineExpense +
      (transferOnlineIn - transferOnlineOut) +
      onlineAdjustments;

    const startingCashNum = Number(starting.starting_cash_paise);
    const startingOnlineNum = Number(starting.starting_online_paise);
    const startingTotalNum = startingCashNum + startingOnlineNum;
    const currentCashNum = Number(currentCash);
    const currentOnlineNum = Number(currentOnline);
    const totalAvailableNum = currentCashNum + currentOnlineNum;

    return {
      starting_cash_paise: startingCashNum,
      starting_online_paise: startingOnlineNum,
      starting_total_paise: startingTotalNum,
      current_cash_paise: currentCashNum,
      current_online_paise: currentOnlineNum,
      total_available_paise: totalAvailableNum,
      formatted_starting_cash: formatPaiseToINR(startingCashNum),
      formatted_starting_online: formatPaiseToINR(startingOnlineNum),
      formatted_starting_total: formatPaiseToINR(startingTotalNum),
      formatted_current_cash: formatPaiseToINR(currentCashNum),
      formatted_current_online: formatPaiseToINR(currentOnlineNum),
      formatted_total_available: formatPaiseToINR(totalAvailableNum),
      balances_configured: starting.balances_configured,
      balances_configured_at: starting.balances_configured_at,
    };
  }

  async configureStartingBalances(
    userId: string,
    data: ValidatedConfigureStartingBalances
  ): Promise<AccountBalancesDTO> {
    this.userBalances.set(userId, {
      starting_cash_paise: data.starting_cash_paise,
      starting_online_paise: data.starting_online_paise,
      balances_configured: true,
      balances_configured_at: new Date(Date.now() - 1).toISOString(),
    });

    return this.getBalances(userId);
  }

  async createTransfer(
    userId: string,
    data: ValidatedCreateTransfer
  ): Promise<{ movement: BalanceMovementDTO; balances: AccountBalancesDTO }> {
    const current = await this.getBalances(userId);
    const avail = data.from_method === 'cash' ? BigInt(current.current_cash_paise) : BigInt(current.current_online_paise);
    if (data.amount_paise > avail) {
      throw new BalanceValidationError(
        `Insufficient ${data.from_method} balance for transfer. Available balance is ${avail} paise, attempted transfer is ${data.amount_paise} paise.`
      );
    }

    let nowMs = Date.now();
    if (current.balances_configured_at && nowMs <= Date.parse(current.balances_configured_at)) {
      nowMs = Date.parse(current.balances_configured_at) + 1;
    }
    const now = new Date(nowMs).toISOString();
    const today = now.slice(0, 10);
    const id = data.id || uuidv7();

    const record: StoredMovementRecord = {
      id,
      user_id: userId,
      movement_type: 'transfer',
      from_method: data.from_method,
      to_method: data.to_method,
      amount_paise: data.amount_paise,
      adjustment_paise: 0n,
      reason: data.reason || null,
      movement_date: data.movement_date || today,
      recorded_at: data.recorded_at || now,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    this.movements.push(record);
    const balances = await this.getBalances(userId);

    const movement: BalanceMovementDTO = {
      id: record.id,
      movement_type: 'transfer',
      from_method: record.from_method,
      to_method: record.to_method,
      amount_paise: Number(record.amount_paise),
      adjustment_paise: 0,
      formatted_amount: formatPaiseToINR(Number(record.amount_paise)),
      reason: record.reason,
      movement_date: record.movement_date,
      recorded_at: record.recorded_at || record.created_at,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };

    return { movement, balances };
  }

  async createAdjustment(
    userId: string,
    data: ValidatedCreateAdjustment
  ): Promise<{ movement: BalanceMovementDTO; balances: AccountBalancesDTO }> {
    if (data.adjustment_paise < 0n) {
      const current = await this.getBalances(userId);
      const avail = data.payment_method === 'cash' ? BigInt(current.current_cash_paise) : BigInt(current.current_online_paise);
      const reduction = -data.adjustment_paise;
      if (reduction > avail) {
        throw new BalanceValidationError(
          `Insufficient ${data.payment_method} balance for adjustment. Available balance is ${avail} paise, attempted reduction is ${reduction} paise.`
        );
      }
    }

    const current = await this.getBalances(userId);
    let nowMs = Date.now();
    if (current.balances_configured_at && nowMs <= Date.parse(current.balances_configured_at)) {
      nowMs = Date.parse(current.balances_configured_at) + 1;
    }
    const now = new Date(nowMs).toISOString();
    const today = now.slice(0, 10);
    const id = data.id || uuidv7();

    const record: StoredMovementRecord = {
      id,
      user_id: userId,
      movement_type: 'adjustment',
      payment_method: data.payment_method,
      amount_paise: data.adjustment_paise < 0n ? -data.adjustment_paise : data.adjustment_paise,
      adjustment_paise: data.adjustment_paise,
      reason: data.reason,
      movement_date: data.movement_date || today,
      recorded_at: data.recorded_at || now,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    this.movements.push(record);
    const balances = await this.getBalances(userId);

    const movement: BalanceMovementDTO = {
      id: record.id,
      movement_type: 'adjustment',
      payment_method: record.payment_method,
      amount_paise: Number(record.amount_paise),
      adjustment_paise: Number(record.adjustment_paise),
      formatted_amount: formatPaiseToINR(Number(record.amount_paise)),
      reason: record.reason,
      movement_date: record.movement_date,
      recorded_at: record.recorded_at || record.created_at,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };

    return { movement, balances };
  }

  async getMovements(userId: string): Promise<BalanceMovementListResponse> {
    const userMovements = this.movements
      .filter((m) => m.user_id === userId && m.deleted_at === null)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    const items: BalanceMovementDTO[] = userMovements.map((m) => ({
      id: m.id,
      movement_type: m.movement_type,
      from_method: m.from_method || null,
      to_method: m.to_method || null,
      payment_method: m.payment_method || null,
      amount_paise: Number(m.amount_paise),
      adjustment_paise: Number(m.adjustment_paise),
      formatted_amount: formatPaiseToINR(Number(m.amount_paise)),
      reason: m.reason || null,
      movement_date: m.movement_date,
      recorded_at: m.recorded_at || m.created_at,
      created_at: m.created_at,
      updated_at: m.updated_at,
    }));

    return {
      items,
      total_count: items.length,
    };
  }

  async updateMovement(
    userId: string,
    id: string,
    data: Partial<StoredMovementRecord>
  ): Promise<{ movement: BalanceMovementDTO; balances: AccountBalancesDTO }> {
    const existing = this.movements.find((m) => m.id === id);
    if (!existing || existing.user_id !== userId || existing.deleted_at !== null) {
      throw new BalanceValidationError('Movement not found or already deleted');
    }

    if (data.user_id && data.user_id !== existing.user_id) {
      throw new BalanceValidationError('Cannot change user ownership of a balance movement');
    }

    const proposed: StoredMovementRecord = {
      ...existing,
      ...data,
      user_id: existing.user_id,
      recorded_at: existing.recorded_at,
      created_at: existing.created_at,
      updated_at: new Date().toISOString(),
    };

    const starting = this.userBalances.get(userId) || {
      starting_cash_paise: 0n,
      starting_online_paise: 0n,
      balances_configured: false,
      balances_configured_at: null,
    };

    const isPostBaseline = !starting.balances_configured_at || proposed.recorded_at > starting.balances_configured_at;
    if (isPostBaseline && proposed.deleted_at === null) {
      let availCash = starting.balances_configured ? starting.starting_cash_paise : 0n;
      let availOnline = starting.balances_configured ? starting.starting_online_paise : 0n;

      if (this.transactionService) {
        for (const t of this.transactionService.transactions) {
          if (t.user_id !== userId || t.deleted_at !== null || t.account_id != null) continue;
          if (starting.balances_configured_at && (t.recorded_at || t.created_at) <= starting.balances_configured_at) continue;
          const paise = BigInt(t.amount_paise);
          if (t.payment_method === 'cash') {
            if (t.type === 'income') availCash += paise;
            else if (t.type === 'expense') availCash -= paise;
          } else if (t.payment_method === 'online') {
            if (t.type === 'income') availOnline += paise;
            else if (t.type === 'expense') availOnline -= paise;
          }
        }
      }

      for (const m of this.movements) {
        if (m.id === id || m.user_id !== userId || m.deleted_at !== null) continue;
        if (starting.balances_configured_at && (m.recorded_at || m.created_at) <= starting.balances_configured_at) continue;
        if (m.movement_type === 'transfer') {
          if (m.to_method === 'cash') availCash += m.amount_paise;
          if (m.from_method === 'cash') availCash -= m.amount_paise;
          if (m.to_method === 'online') availOnline += m.amount_paise;
          if (m.from_method === 'online') availOnline -= m.amount_paise;
        } else if (m.movement_type === 'adjustment') {
          if (m.payment_method === 'cash') availCash += m.adjustment_paise;
          if (m.payment_method === 'online') availOnline += m.adjustment_paise;
        }
      }

      if (proposed.movement_type === 'transfer') {
        if (proposed.from_method === 'cash') availCash -= proposed.amount_paise;
        if (proposed.from_method === 'online') availOnline -= proposed.amount_paise;
        if (proposed.to_method === 'cash') availCash += proposed.amount_paise;
        if (proposed.to_method === 'online') availOnline += proposed.amount_paise;
      } else if (proposed.movement_type === 'adjustment') {
        if (proposed.payment_method === 'cash') availCash += proposed.adjustment_paise;
        if (proposed.payment_method === 'online') availOnline += proposed.adjustment_paise;
      }

      if (availCash < 0n) {
        throw new BalanceValidationError(`Insufficient cash balance for movement. Resulting balance would be ${availCash} paise.`);
      }
      if (availOnline < 0n) {
        throw new BalanceValidationError(`Insufficient online balance for movement. Resulting balance would be ${availOnline} paise.`);
      }
    }

    Object.assign(existing, proposed);
    const balances = await this.getBalances(userId);
    const movement: BalanceMovementDTO = {
      id: existing.id,
      movement_type: existing.movement_type,
      from_method: existing.from_method,
      to_method: existing.to_method,
      payment_method: existing.payment_method,
      amount_paise: Number(existing.amount_paise),
      adjustment_paise: Number(existing.adjustment_paise),
      formatted_amount: formatPaiseToINR(
        existing.movement_type === 'adjustment'
          ? Math.abs(Number(existing.adjustment_paise))
          : Number(existing.amount_paise)
      ),
      reason: existing.reason,
      movement_date: existing.movement_date,
      recorded_at: existing.recorded_at,
      created_at: existing.created_at,
      updated_at: existing.updated_at,
    };
    return { movement, balances };
  }

  async deleteMovement(
    userId: string,
    id: string
  ): Promise<{ success: boolean; id: string; balances: AccountBalancesDTO }> {
    const existing = this.movements.find((m) => m.id === id);
    if (!existing || existing.user_id !== userId || existing.deleted_at !== null) {
      throw new BalanceValidationError('Movement not found or already deleted');
    }

    const starting = this.userBalances.get(userId) || {
      starting_cash_paise: 0n,
      starting_online_paise: 0n,
      balances_configured: false,
      balances_configured_at: null,
    };

    const isPostBaseline = !starting.balances_configured_at || existing.recorded_at > starting.balances_configured_at;
    if (isPostBaseline) {
      let availCash = starting.balances_configured ? starting.starting_cash_paise : 0n;
      let availOnline = starting.balances_configured ? starting.starting_online_paise : 0n;

      if (this.transactionService) {
        for (const t of this.transactionService.transactions) {
          if (t.user_id !== userId || t.deleted_at !== null || t.account_id != null) continue;
          if (starting.balances_configured_at && (t.recorded_at || t.created_at) <= starting.balances_configured_at) continue;
          const paise = BigInt(t.amount_paise);
          if (t.payment_method === 'cash') {
            if (t.type === 'income') availCash += paise;
            else if (t.type === 'expense') availCash -= paise;
          } else if (t.payment_method === 'online') {
            if (t.type === 'income') availOnline += paise;
            else if (t.type === 'expense') availOnline -= paise;
          }
        }
      }

      for (const m of this.movements) {
        if (m.id === id || m.user_id !== userId || m.deleted_at !== null) continue;
        if (starting.balances_configured_at && (m.recorded_at || m.created_at) <= starting.balances_configured_at) continue;
        if (m.movement_type === 'transfer') {
          if (m.to_method === 'cash') availCash += m.amount_paise;
          if (m.from_method === 'cash') availCash -= m.amount_paise;
          if (m.to_method === 'online') availOnline += m.amount_paise;
          if (m.from_method === 'online') availOnline -= m.amount_paise;
        } else if (m.movement_type === 'adjustment') {
          if (m.payment_method === 'cash') availCash += m.adjustment_paise;
          if (m.payment_method === 'online') availOnline += m.adjustment_paise;
        }
      }

      if (availCash < 0n) {
        throw new BalanceValidationError(`Insufficient cash balance for movement. Resulting balance would be ${availCash} paise.`);
      }
      if (availOnline < 0n) {
        throw new BalanceValidationError(`Insufficient online balance for movement. Resulting balance would be ${availOnline} paise.`);
      }
    }

    existing.deleted_at = new Date().toISOString();
    existing.updated_at = existing.deleted_at;
    const balances = await this.getBalances(userId);
    return { success: true, id, balances };
  }

  async restoreMovement(
    userId: string,
    id: string
  ): Promise<{ movement: BalanceMovementDTO; balances: AccountBalancesDTO }> {
    const existing = this.movements.find((m) => m.id === id);
    if (!existing || existing.user_id !== userId || existing.deleted_at === null) {
      throw new BalanceValidationError('Movement not found or not deleted');
    }

    const starting = this.userBalances.get(userId) || {
      starting_cash_paise: 0n,
      starting_online_paise: 0n,
      balances_configured: false,
      balances_configured_at: null,
    };

    const isPostBaseline = !starting.balances_configured_at || existing.recorded_at > starting.balances_configured_at;
    if (isPostBaseline) {
      let availCash = starting.balances_configured ? starting.starting_cash_paise : 0n;
      let availOnline = starting.balances_configured ? starting.starting_online_paise : 0n;

      if (this.transactionService) {
        for (const t of this.transactionService.transactions) {
          if (t.user_id !== userId || t.deleted_at !== null || t.account_id != null) continue;
          if (starting.balances_configured_at && (t.recorded_at || t.created_at) <= starting.balances_configured_at) continue;
          const paise = BigInt(t.amount_paise);
          if (t.payment_method === 'cash') {
            if (t.type === 'income') availCash += paise;
            else if (t.type === 'expense') availCash -= paise;
          } else if (t.payment_method === 'online') {
            if (t.type === 'income') availOnline += paise;
            else if (t.type === 'expense') availOnline -= paise;
          }
        }
      }

      for (const m of this.movements) {
        if (m.id === id || m.user_id !== userId || m.deleted_at !== null) continue;
        if (starting.balances_configured_at && (m.recorded_at || m.created_at) <= starting.balances_configured_at) continue;
        if (m.movement_type === 'transfer') {
          if (m.to_method === 'cash') availCash += m.amount_paise;
          if (m.from_method === 'cash') availCash -= m.amount_paise;
          if (m.to_method === 'online') availOnline += m.amount_paise;
          if (m.from_method === 'online') availOnline -= m.amount_paise;
        } else if (m.movement_type === 'adjustment') {
          if (m.payment_method === 'cash') availCash += m.adjustment_paise;
          if (m.payment_method === 'online') availOnline += m.adjustment_paise;
        }
      }

      if (existing.movement_type === 'transfer') {
        if (existing.from_method === 'cash') availCash -= existing.amount_paise;
        if (existing.from_method === 'online') availOnline -= existing.amount_paise;
        if (existing.to_method === 'cash') availCash += existing.amount_paise;
        if (existing.to_method === 'online') availOnline += existing.amount_paise;
      } else if (existing.movement_type === 'adjustment') {
        if (existing.payment_method === 'cash') availCash += existing.adjustment_paise;
        if (existing.payment_method === 'online') availOnline += existing.adjustment_paise;
      }

      if (availCash < 0n) {
        throw new BalanceValidationError(`Insufficient cash balance for movement. Resulting balance would be ${availCash} paise.`);
      }
      if (availOnline < 0n) {
        throw new BalanceValidationError(`Insufficient online balance for movement. Resulting balance would be ${availOnline} paise.`);
      }
    }

    existing.deleted_at = null;
    existing.updated_at = new Date().toISOString();
    const balances = await this.getBalances(userId);
    const movement: BalanceMovementDTO = {
      id: existing.id,
      movement_type: existing.movement_type,
      from_method: existing.from_method,
      to_method: existing.to_method,
      payment_method: existing.payment_method,
      amount_paise: Number(existing.amount_paise),
      adjustment_paise: Number(existing.adjustment_paise),
      formatted_amount: formatPaiseToINR(
        existing.movement_type === 'adjustment'
          ? Math.abs(Number(existing.adjustment_paise))
          : Number(existing.amount_paise)
      ),
      reason: existing.reason,
      movement_date: existing.movement_date,
      recorded_at: existing.recorded_at,
      created_at: existing.created_at,
      updated_at: existing.updated_at,
    };
    return { movement, balances };
  }
}
