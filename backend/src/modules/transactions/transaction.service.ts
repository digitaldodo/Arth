import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  paiseToDecimal,
  formatPaiseToINR,
  type TransactionDTO,
  type CategoryDTO,
  type TransactionListResponse,
  type CategoryListResponse,
  type TransactionType,
} from '@arth/contracts';
import type { AppConfig } from '../../config/index.js';
import {
  ValidationError,
  ConflictError,
  type ValidatedCreateTransactionInput,
  type ValidatedTransactionListQuery,
  type ValidatedCategoryListQuery,
} from './transaction.validation.js';

export interface StoredTransactionRecord {
  id: string;
  user_id: string;
  amount_paise: number;
  type: TransactionType;
  category_id: string;
  category_name?: string;
  transaction_date: string;
  payment_method: 'online' | 'cash';
  necessity: 'essential' | 'optional' | 'luxury' | null;
  description: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface StoredCategoryRecord {
  id: string;
  user_id: string;
  name: string;
  type: TransactionType;
  icon: string | null;
  color: string | null;
  sort_order: number;
  is_default: boolean;
  archived_at: string | null;
}

export interface StoredOutboxRecord {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: 'pending';
  created_at: string;
}

export interface ITransactionService {
  createTransaction(
    userId: string,
    input: ValidatedCreateTransactionInput,
    token?: string
  ): Promise<{ transaction: TransactionDTO; isReplay: boolean }>;

  listTransactions(
    userId: string,
    query: ValidatedTransactionListQuery,
    token?: string
  ): Promise<TransactionListResponse>;

  listCategories(
    userId: string,
    query: ValidatedCategoryListQuery,
    token?: string
  ): Promise<CategoryListResponse>;
}

function mapToTransactionDTO(
  rec: StoredTransactionRecord,
  categoryName?: string
): TransactionDTO {
  const paise = rec.amount_paise;
  return {
    id: rec.id,
    amount_paise: paise,
    amount_decimal: paiseToDecimal(paise),
    formatted_inr: formatPaiseToINR(paise),
    type: rec.type,
    category_id: rec.category_id,
    category_name: categoryName || rec.category_name || undefined,
    transaction_date: rec.transaction_date,
    payment_method: rec.payment_method,
    necessity: rec.necessity,
    description: rec.description,
    notes: rec.notes,
    created_at: rec.created_at,
    updated_at: rec.updated_at,
  };
}

/**
 * Production implementation using user-scoped Supabase client carrying the caller's JWT.
 */
export class SupabaseTransactionService implements ITransactionService {
  constructor(private readonly config: AppConfig) {}

  private getScopedClient(token?: string): SupabaseClient {
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

  async createTransaction(
    userId: string,
    input: ValidatedCreateTransactionInput,
    token?: string
  ): Promise<{ transaction: TransactionDTO; isReplay: boolean }> {
    const client = this.getScopedClient(token);

    // 1. Check if transaction with this ID already exists
    const { data: existing, error: existingErr } = await client
      .from('transactions')
      .select('id, user_id, amount_paise, type, category_id, transaction_date, payment_method, necessity, description, notes, created_at, updated_at, deleted_at, categories(name)')
      .eq('id', input.id)
      .maybeSingle();

    if (existingErr && existingErr.code !== 'PGRST116') {
      throw new Error(`Database query error: ${existingErr.message}`);
    }

    if (existing) {
      // Rule 4: Soft-deleted transaction cannot be resurrected by replaying creation request
      if (existing.deleted_at) {
        throw new ConflictError(
          'Transaction with this ID was previously deleted and cannot be recreated'
        );
      }

      // Check normalized payload match
      const isMatch =
        Number(existing.amount_paise) === Number(input.amount_paise) &&
        existing.type === input.type &&
        existing.category_id === input.category_id &&
        existing.transaction_date === input.transaction_date &&
        existing.payment_method === input.payment_method &&
        (existing.necessity ?? null) === input.necessity &&
        (existing.description ?? null) === input.description &&
        (existing.notes ?? null) === input.notes;

      if (isMatch) {
        const catName = (existing.categories as unknown as { name?: string } | null)?.name;
        return {
          transaction: mapToTransactionDTO(existing as unknown as StoredTransactionRecord, catName),
          isReplay: true,
        };
      }

      // Rule 3: Reuse of same ID with different payload must return 409 Conflict
      throw new ConflictError(
        'A transaction with this ID already exists with different payload attributes'
      );
    }

    // 2. Validate category belongs to user and matches transaction type
    const { data: category, error: catErr } = await client
      .from('categories')
      .select('id, name, type')
      .eq('id', input.category_id)
      .is('archived_at', null)
      .maybeSingle();

    if (catErr || !category) {
      throw new ValidationError(
        'Selected category does not exist or does not belong to the user'
      );
    }

    if (category.type !== input.type) {
      throw new ValidationError(
        `Category '${category.name}' is of type '${category.type}', but transaction is '${input.type}'`
      );
    }

    // 3. Insert transaction. Note: RLS verifies user_id = auth.uid()
    const { data: inserted, error: insertErr } = await client
      .from('transactions')
      .insert({
        id: input.id,
        user_id: userId,
        amount_paise: Number(input.amount_paise),
        type: input.type,
        category_id: input.category_id,
        transaction_date: input.transaction_date,
        payment_method: input.payment_method,
        necessity: input.necessity,
        description: input.description,
        notes: input.notes,
      })
      .select('id, user_id, amount_paise, type, category_id, transaction_date, payment_method, necessity, description, notes, created_at, updated_at, deleted_at')
      .single();

    if (insertErr || !inserted) {
      throw new Error(`Failed to create transaction: ${insertErr?.message || 'Unknown error'}`);
    }

    return {
      transaction: mapToTransactionDTO(inserted as unknown as StoredTransactionRecord, category.name),
      isReplay: false,
    };
  }

  async listTransactions(
    userId: string,
    query: ValidatedTransactionListQuery,
    token?: string
  ): Promise<TransactionListResponse> {
    const client = this.getScopedClient(token);

    let qb = client
      .from('transactions')
      .select(
        'id, user_id, amount_paise, type, category_id, transaction_date, payment_method, necessity, description, notes, created_at, updated_at, deleted_at, categories(name)',
        { count: 'exact' }
      )
      .is('deleted_at', null)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (query.type) {
      qb = qb.eq('type', query.type);
    }
    if (query.category_id) {
      qb = qb.eq('category_id', query.category_id);
    }
    if (query.start_date) {
      qb = qb.gte('transaction_date', query.start_date);
    }
    if (query.end_date) {
      qb = qb.lte('transaction_date', query.end_date);
    }

    const from = (query.page - 1) * query.page_size;
    const to = from + query.page_size - 1;

    const { data, count, error } = await qb.range(from, to);

    if (error) {
      throw new Error(`Failed to list transactions: ${error.message}`);
    }

    const items = (data || []).map((row) => {
      const catName = (row.categories as unknown as { name?: string } | null)?.name;
      return mapToTransactionDTO(row as unknown as StoredTransactionRecord, catName);
    });

    const totalCount = count ?? items.length;
    const hasMore = from + items.length < totalCount;

    return {
      items,
      page: query.page,
      page_size: query.page_size,
      total_count: totalCount,
      has_more: hasMore,
    };
  }

  async listCategories(
    userId: string,
    query: ValidatedCategoryListQuery,
    token?: string
  ): Promise<CategoryListResponse> {
    const client = this.getScopedClient(token);

    let qb = client
      .from('categories')
      .select('id, name, type, icon, color, sort_order, is_default, archived_at')
      .is('archived_at', null)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (query.type) {
      qb = qb.eq('type', query.type);
    }

    const { data, error } = await qb;

    if (error) {
      throw new Error(`Failed to list categories: ${error.message}`);
    }

    const categories: CategoryDTO[] = (data || []).map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      icon: c.icon,
      color: c.color,
      sort_order: c.sort_order,
      is_default: c.is_default,
      archived_at: c.archived_at ?? null,
    }));

    return { categories };
  }
}

/**
 * In-memory transaction service implementing exact database schema constraints,
 * composite uniqueness, RLS isolation, outbox trigger event generation, and idempotency.
 * Used for deterministic automated unit and integration tests.
 */
export class InMemoryTransactionService implements ITransactionService {
  public transactions: StoredTransactionRecord[] = [];
  public categories: StoredCategoryRecord[] = [];
  public outboxEvents: StoredOutboxRecord[] = [];

  constructor() {
    this.seedDefaultCategories('test-user-id');
  }

  public seedDefaultCategories(userId: string): void {
    const defaults: Array<Pick<StoredCategoryRecord, 'name' | 'type' | 'sort_order'>> = [
      { name: 'Food & Dining', type: 'expense', sort_order: 1 },
      { name: 'Transport', type: 'expense', sort_order: 2 },
      { name: 'Housing', type: 'expense', sort_order: 3 },
      { name: 'Utilities', type: 'expense', sort_order: 4 },
      { name: 'Healthcare', type: 'expense', sort_order: 5 },
      { name: 'Entertainment', type: 'expense', sort_order: 6 },
      { name: 'Shopping', type: 'expense', sort_order: 7 },
      { name: 'Education', type: 'expense', sort_order: 8 },
      { name: 'Personal Care', type: 'expense', sort_order: 9 },
      { name: 'Travel', type: 'expense', sort_order: 10 },
      { name: 'Other Expense', type: 'expense', sort_order: 11 },
      { name: 'Salary', type: 'income', sort_order: 1 },
      { name: 'Freelance', type: 'income', sort_order: 2 },
      { name: 'Investments', type: 'income', sort_order: 3 },
      { name: 'Other Income', type: 'income', sort_order: 4 },
    ];

    defaults.forEach((def, idx) => {
      // Deterministic UUID for each category unique to userId
      const userPrefix = userId.replace(/-/g, '').slice(0, 8);
      const id = `${userPrefix}-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`;
      if (!this.categories.some((c) => c.user_id === userId && c.name === def.name)) {
        this.categories.push({
          id,
          user_id: userId,
          name: def.name,
          type: def.type,
          icon: null,
          color: null,
          sort_order: def.sort_order,
          is_default: true,
          archived_at: null,
        });
      }
    });
  }

  async createTransaction(
    userId: string,
    input: ValidatedCreateTransactionInput
  ): Promise<{ transaction: TransactionDTO; isReplay: boolean }> {
    // 1. Check existing
    const existing = this.transactions.find((t) => t.id === input.id);
    if (existing) {
      // Ensure RLS isolation: user can only see own transaction
      if (existing.user_id !== userId) {
        throw new ConflictError('A transaction with this ID already exists with different payload attributes');
      }

      if (existing.deleted_at) {
        throw new ConflictError('Transaction with this ID was previously deleted and cannot be recreated');
      }

      const isMatch =
        existing.amount_paise === Number(input.amount_paise) &&
        existing.type === input.type &&
        existing.category_id === input.category_id &&
        existing.transaction_date === input.transaction_date &&
        existing.payment_method === input.payment_method &&
        (existing.necessity ?? null) === input.necessity &&
        (existing.description ?? null) === input.description &&
        (existing.notes ?? null) === input.notes;

      if (isMatch) {
        const cat = this.categories.find((c) => c.id === existing.category_id);
        return {
          transaction: mapToTransactionDTO(existing, cat?.name),
          isReplay: true,
        };
      }

      throw new ConflictError('A transaction with this ID already exists with different payload attributes');
    }

    // 2. Validate category ownership and type match
    const category = this.categories.find(
      (c) => c.id === input.category_id && c.user_id === userId && c.archived_at === null
    );

    if (!category) {
      throw new ValidationError('Selected category does not exist or does not belong to the user');
    }

    if (category.type !== input.type) {
      throw new ValidationError(
        `Category '${category.name}' is of type '${category.type}', but transaction is '${input.type}'`
      );
    }

    const now = new Date().toISOString();
    const newRecord: StoredTransactionRecord = {
      id: input.id,
      user_id: userId,
      amount_paise: Number(input.amount_paise),
      type: input.type,
      category_id: input.category_id,
      category_name: category.name,
      transaction_date: input.transaction_date,
      payment_method: input.payment_method,
      necessity: input.necessity,
      description: input.description,
      notes: input.notes,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    this.transactions.push(newRecord);

    // Simulate database trigger trg_transactions_outbox
    this.outboxEvents.push({
      id: `outbox-${input.id}`,
      user_id: userId,
      entity_type: 'transaction',
      entity_id: input.id,
      event_type: 'transaction.created',
      payload: { ...newRecord },
      status: 'pending',
      created_at: now,
    });

    return {
      transaction: mapToTransactionDTO(newRecord, category.name),
      isReplay: false,
    };
  }

  async listTransactions(
    userId: string,
    query: ValidatedTransactionListQuery
  ): Promise<TransactionListResponse> {
    let filtered = this.transactions.filter(
      (t) => t.user_id === userId && t.deleted_at === null
    );

    if (query.type) {
      filtered = filtered.filter((t) => t.type === query.type);
    }
    if (query.category_id) {
      filtered = filtered.filter((t) => t.category_id === query.category_id);
    }
    if (query.start_date) {
      filtered = filtered.filter((t) => t.transaction_date >= query.start_date!);
    }
    if (query.end_date) {
      filtered = filtered.filter((t) => t.transaction_date <= query.end_date!);
    }

    // Deterministic sort: transaction_date DESC, created_at DESC, id DESC
    filtered.sort((a, b) => {
      if (a.transaction_date !== b.transaction_date) {
        return b.transaction_date.localeCompare(a.transaction_date);
      }
      if (a.created_at !== b.created_at) {
        return b.created_at.localeCompare(a.created_at);
      }
      return b.id.localeCompare(a.id);
    });

    const totalCount = filtered.length;
    const startIndex = (query.page - 1) * query.page_size;
    const pageItems = filtered.slice(startIndex, startIndex + query.page_size);
    const hasMore = startIndex + pageItems.length < totalCount;

    const items = pageItems.map((rec) => {
      const cat = this.categories.find((c) => c.id === rec.category_id);
      return mapToTransactionDTO(rec, cat?.name);
    });

    return {
      items,
      page: query.page,
      page_size: query.page_size,
      total_count: totalCount,
      has_more: hasMore,
    };
  }

  async listCategories(
    userId: string,
    query: ValidatedCategoryListQuery
  ): Promise<CategoryListResponse> {
    let filtered = this.categories.filter(
      (c) => c.user_id === userId && c.archived_at === null
    );

    if (query.type) {
      filtered = filtered.filter((c) => c.type === query.type);
    }

    filtered.sort((a, b) => {
      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }
      return a.name.localeCompare(b.name);
    });

    const categories: CategoryDTO[] = filtered.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      icon: c.icon,
      color: c.color,
      sort_order: c.sort_order,
      is_default: c.is_default,
      archived_at: c.archived_at ?? null,
    }));

    return { categories };
  }
}
