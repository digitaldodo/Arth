import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  formatPaiseToINR,
  paiseToDecimal,
  type DashboardSummaryResponse,
  type CategorySpendingDTO,
  type NecessitySpendingDTO,
  type NecessityClass,
  type TransactionDTO,
} from '@arth/contracts';
import type { AppConfig } from '../../config/index.js';
import type { ValidatedDashboardSummaryQuery } from './dashboard.validation.js';
import type {
  StoredTransactionRecord,
  StoredCategoryRecord,
  InMemoryTransactionService,
} from '../transactions/transaction.service.js';
import type { InMemoryCategoryService } from '../categories/category.service.js';

export interface IDashboardService {
  getSummary(
    userId: string,
    query: ValidatedDashboardSummaryQuery,
    token?: string
  ): Promise<DashboardSummaryResponse>;
}

export class SupabaseDashboardService implements IDashboardService {
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

  async getSummary(
    userId: string,
    query: ValidatedDashboardSummaryQuery,
    token?: string
  ): Promise<DashboardSummaryResponse> {
    const client = this.getScopedClient(token);

    // Call authoritative PostgreSQL database function fn_dashboard_summary
    const { data: rpcData, error: rpcErr } = await client.rpc('fn_dashboard_summary', {
      p_start_date: query.start_date,
      p_end_date: query.end_date,
    });

    if (rpcErr || !rpcData) {
      // Diagnostic logging without leaking tokens, credentials, or financial details
      console.error(
        `[DashboardService] Database RPC fn_dashboard_summary failed (code: ${rpcErr?.code || 'NO_DATA'}): ${rpcErr?.message || 'Empty response'}`
      );
      throw new Error(
        `Failed to retrieve dashboard summary from database: ${rpcErr?.message || 'Empty response'}`
      );
    }

    const incomePaise = Number(rpcData.income_paise || 0);
    const expensesPaise = Number(rpcData.expenses_paise || 0);
    const netCashFlowPaise = Number(rpcData.net_cash_flow_paise || 0);

    const spendingComposition: CategorySpendingDTO[] = (rpcData.spending_composition || []).map(
      (c: Record<string, unknown>) => ({
        category_id: String(c.category_id),
        category_name: String(c.category_name || 'Uncategorized'),
        category_color: (c.category_color as string) || null,
        category_icon: (c.category_icon as string) || null,
        amount_paise: Number(c.amount_paise || 0),
        formatted_inr: formatPaiseToINR(Number(c.amount_paise || 0)),
        share_percentage: Number(c.share_percentage || 0),
      })
    );

    const recentTransactions: TransactionDTO[] = (rpcData.recent_transactions || []).map(
      (t: Record<string, unknown>) => ({
        id: String(t.id),
        amount_paise: Number(t.amount_paise),
        amount_decimal: paiseToDecimal(Number(t.amount_paise)),
        formatted_inr: formatPaiseToINR(Number(t.amount_paise)),
        type: t.type as 'income' | 'expense',
        category_id: String(t.category_id),
        category_name: t.category_name ? String(t.category_name) : undefined,
        transaction_date: String(t.transaction_date),
        payment_method: t.payment_method as 'online' | 'cash',
        necessity: (t.necessity as 'essential' | 'optional' | 'luxury') || null,
        description: (t.description as string) || null,
        notes: (t.notes as string) || null,
        created_at: String(t.created_at),
        updated_at: String(t.updated_at),
      })
    );

    let spendingByNecessity: NecessitySpendingDTO[] = [];

    if (Array.isArray(rpcData.spending_by_necessity) && rpcData.spending_by_necessity.length > 0) {
      spendingByNecessity = (rpcData.spending_by_necessity as Record<string, unknown>[]).map((item) => {
        const nec = String(item.necessity || '').toLowerCase().trim() as NecessityClass;
        const amount = Number(item.amount_paise || 0);
        const label =
          item.label && typeof item.label === 'string'
            ? item.label
            : nec
            ? nec.charAt(0).toUpperCase() + nec.slice(1)
            : 'Unknown';

        return {
          necessity: nec,
          label,
          amount_paise: amount,
          formatted_inr: formatPaiseToINR(amount),
          share_percentage:
            expensesPaise > 0
              ? Math.round((amount / expensesPaise) * 1000) / 10
              : 0,
        };
      });
    }

    const totalNecessityPaise = spendingByNecessity.reduce(
      (sum, item) => sum + (item.amount_paise || 0),
      0
    );

    // Fallback & Authoritative Reconciliation:
    // If the database RPC function did not return spending_by_necessity, or returned 0s while expenses exist
    if (expensesPaise > 0 && totalNecessityPaise === 0) {
      const { data: necRows, error: necErr } = await client
        .from('transactions')
        .select('amount_paise, necessity')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .eq('type', 'expense')
        .gte('transaction_date', query.start_date)
        .lte('transaction_date', query.end_date);

      if (!necErr && Array.isArray(necRows)) {
        let essentialPaise = 0;
        let optionalPaise = 0;
        let luxuryPaise = 0;

        for (const row of necRows) {
          const amt = Number(row.amount_paise || 0);
          const nec = String(row.necessity || '').toLowerCase().trim();
          if (nec === 'essential') {
            essentialPaise += amt;
          } else if (nec === 'optional') {
            optionalPaise += amt;
          } else if (nec === 'luxury') {
            luxuryPaise += amt;
          }
        }

        spendingByNecessity = [
          {
            necessity: 'essential',
            label: 'Essential',
            amount_paise: essentialPaise,
            formatted_inr: formatPaiseToINR(essentialPaise),
            share_percentage:
              expensesPaise > 0
                ? Math.round((essentialPaise / expensesPaise) * 1000) / 10
                : 0,
          },
          {
            necessity: 'optional',
            label: 'Optional',
            amount_paise: optionalPaise,
            formatted_inr: formatPaiseToINR(optionalPaise),
            share_percentage:
              expensesPaise > 0
                ? Math.round((optionalPaise / expensesPaise) * 1000) / 10
                : 0,
          },
          {
            necessity: 'luxury',
            label: 'Luxury',
            amount_paise: luxuryPaise,
            formatted_inr: formatPaiseToINR(luxuryPaise),
            share_percentage:
              expensesPaise > 0
                ? Math.round((luxuryPaise / expensesPaise) * 1000) / 10
                : 0,
          },
        ];
      }
    }

    // If still empty (e.g. no expenses recorded at all in this range), provide deterministic 3 zero tiers
    if (spendingByNecessity.length === 0) {
      spendingByNecessity = [
        { necessity: 'essential', label: 'Essential', amount_paise: 0, formatted_inr: formatPaiseToINR(0), share_percentage: 0 },
        { necessity: 'optional', label: 'Optional', amount_paise: 0, formatted_inr: formatPaiseToINR(0), share_percentage: 0 },
        { necessity: 'luxury', label: 'Luxury', amount_paise: 0, formatted_inr: formatPaiseToINR(0), share_percentage: 0 },
      ];
    }

    return {
      start_date: query.start_date,
      end_date: query.end_date,
      income_paise: incomePaise,
      expenses_paise: expensesPaise,
      net_cash_flow_paise: netCashFlowPaise,
      formatted_income: formatPaiseToINR(incomePaise),
      formatted_expenses: formatPaiseToINR(expensesPaise),
      formatted_net_cash_flow: formatPaiseToINR(netCashFlowPaise),
      spending_composition: spendingComposition,
      spending_by_necessity: spendingByNecessity,
      recent_transactions: recentTransactions,
      has_activity_in_range: Boolean(rpcData.has_activity_in_range),
      total_active_transaction_count: Number(rpcData.total_active_transaction_count || 0),
    };
  }
}

/**
 * High-fidelity in-memory implementation for automated tests, CI, and local emulation.
 */
export class InMemoryDashboardService implements IDashboardService {
  constructor(
    private readonly transactionService?: InMemoryTransactionService,
    private readonly categoryService?: InMemoryCategoryService
  ) {}

  async getSummary(
    userId: string,
    query: ValidatedDashboardSummaryQuery
  ): Promise<DashboardSummaryResponse> {
    const allTransactions: StoredTransactionRecord[] =
      this.transactionService?.transactions || [];
    const allCategories: StoredCategoryRecord[] =
      this.categoryService?.categories || [];

    // Filter strictly to caller's non-deleted transactions within the inclusive date range
    const userTxns = allTransactions.filter(
      (t) =>
        t.user_id === userId &&
        t.deleted_at === null &&
        t.transaction_date >= query.start_date &&
        t.transaction_date <= query.end_date
    );

    const totalActiveCount = allTransactions.filter(
      (t) => t.user_id === userId && t.deleted_at === null
    ).length;

    let incomePaise = 0n;
    let expensesPaise = 0n;
    let essentialPaise = 0n;
    let optionalPaise = 0n;
    let luxuryPaise = 0n;
    const categoryTotalsMap = new Map<
      string,
      {
        name: string;
        color: string | null;
        icon: string | null;
        amountPaise: bigint;
      }
    >();

    for (const t of userTxns) {
      const amount = BigInt(t.amount_paise);
      if (t.type === 'income') {
        incomePaise += amount;
      } else if (t.type === 'expense') {
        expensesPaise += amount;
        const nec = String(t.necessity || '').toLowerCase().trim();
        if (nec === 'essential') {
          essentialPaise += amount;
        } else if (nec === 'optional') {
          optionalPaise += amount;
        } else if (nec === 'luxury') {
          luxuryPaise += amount;
        }
        const cat = allCategories.find((c) => c.id === t.category_id);
        const existing = categoryTotalsMap.get(t.category_id) || {
          name: cat?.name || t.category_name || 'Uncategorized',
          color: cat?.color || null,
          icon: cat?.icon || null,
          amountPaise: 0n,
        };
        existing.amountPaise += amount;
        categoryTotalsMap.set(t.category_id, existing);
      }
    }

    const totalIncome = Number(incomePaise);
    const totalExpenses = Number(expensesPaise);
    const netCashFlow = Number(incomePaise - expensesPaise);

    const spendingComposition: CategorySpendingDTO[] = Array.from(categoryTotalsMap.entries())
      .map(([catId, val]) => {
        const catPaise = Number(val.amountPaise);
        const share =
          totalExpenses > 0
            ? Math.round((catPaise / totalExpenses) * 1000) / 10
            : 0;
        return {
          category_id: catId,
          category_name: val.name,
          category_color: val.color,
          category_icon: val.icon,
          amount_paise: catPaise,
          formatted_inr: formatPaiseToINR(catPaise),
          share_percentage: share,
        };
      })
      .sort((a, b) => b.amount_paise - a.amount_paise);

    // Bounded and deterministically ordered recent transactions (up to 10)
    const recentTransactions: TransactionDTO[] = [...userTxns]
      .sort((a, b) => {
        if (a.transaction_date !== b.transaction_date) {
          return b.transaction_date.localeCompare(a.transaction_date);
        }
        if (a.created_at !== b.created_at) {
          return b.created_at.localeCompare(a.created_at);
        }
        return b.id.localeCompare(a.id);
      })
      .slice(0, 10)
      .map((t) => {
        const cat = allCategories.find((c) => c.id === t.category_id);
        return {
          id: t.id,
          amount_paise: t.amount_paise,
          amount_decimal: paiseToDecimal(t.amount_paise),
          formatted_inr: formatPaiseToINR(t.amount_paise),
          type: t.type,
          category_id: t.category_id,
          category_name: cat?.name || t.category_name || undefined,
          transaction_date: t.transaction_date,
          payment_method: t.payment_method,
          necessity: t.necessity,
          description: t.description,
          notes: t.notes,
          created_at: t.created_at,
          updated_at: t.updated_at,
        };
      });

    const spendingByNecessity: NecessitySpendingDTO[] = [
      {
        necessity: 'essential',
        label: 'Essential',
        amount_paise: Number(essentialPaise),
        formatted_inr: formatPaiseToINR(Number(essentialPaise)),
        share_percentage:
          totalExpenses > 0
            ? Math.round((Number(essentialPaise) / totalExpenses) * 1000) / 10
            : 0,
      },
      {
        necessity: 'optional',
        label: 'Optional',
        amount_paise: Number(optionalPaise),
        formatted_inr: formatPaiseToINR(Number(optionalPaise)),
        share_percentage:
          totalExpenses > 0
            ? Math.round((Number(optionalPaise) / totalExpenses) * 1000) / 10
            : 0,
      },
      {
        necessity: 'luxury',
        label: 'Luxury',
        amount_paise: Number(luxuryPaise),
        formatted_inr: formatPaiseToINR(Number(luxuryPaise)),
        share_percentage:
          totalExpenses > 0
            ? Math.round((Number(luxuryPaise) / totalExpenses) * 1000) / 10
            : 0,
      },
    ];

    return {
      start_date: query.start_date,
      end_date: query.end_date,
      income_paise: totalIncome,
      expenses_paise: totalExpenses,
      net_cash_flow_paise: netCashFlow,
      formatted_income: formatPaiseToINR(totalIncome),
      formatted_expenses: formatPaiseToINR(totalExpenses),
      formatted_net_cash_flow: formatPaiseToINR(netCashFlow),
      spending_composition: spendingComposition,
      spending_by_necessity: spendingByNecessity,
      recent_transactions: recentTransactions,
      has_activity_in_range: recentTransactions.length > 0,
      total_active_transaction_count: totalActiveCount,
    };
  }
}
