import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  paiseToDecimal,
  formatPaiseToINR,
  type TransactionDTO,
  type CategoryDTO,
  type TransactionListResponse,
  type CategoryListResponse,
  type TransactionType,
  type AccountBalancesDTO,
} from '@arth/contracts';
import type { AppConfig } from '../../config/index.js';
import {
  ValidationError,
  ConflictError,
  NotFoundError,
  type ValidatedCreateTransactionInput,
  type ValidatedUpdateTransactionInput,
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
  recorded_at?: string;
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

  updateTransaction(
    userId: string,
    id: string,
    input: ValidatedUpdateTransactionInput,
    token?: string
  ): Promise<TransactionDTO>;

  deleteTransaction(
    userId: string,
    id: string,
    token?: string
  ): Promise<{ success: boolean; id: string }>;

  restoreTransaction(
    userId: string,
    id: string,
    token?: string
  ): Promise<TransactionDTO>;

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
    recorded_at: rec.recorded_at || rec.created_at,
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
      .select('id, user_id, amount_paise, type, category_id, transaction_date, payment_method, necessity, description, notes, recorded_at, created_at, updated_at, deleted_at, categories(name)')
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
    const insertPayload: Record<string, unknown> = {
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
      recorded_at: input.recorded_at,
    };
    if (input.created_at) {
      insertPayload.created_at = input.created_at;
    }

    const { data: inserted, error: insertErr } = await client
      .from('transactions')
      .insert(insertPayload)
      .select('id, user_id, amount_paise, type, category_id, transaction_date, payment_method, necessity, description, notes, recorded_at, created_at, updated_at, deleted_at')
      .single();

    if (insertErr || !inserted) {
      if (
        insertErr?.code === '22003' ||
        insertErr?.message?.includes('Insufficient') ||
        insertErr?.message?.includes('Starting balances have not been configured')
      ) {
        throw new ValidationError(insertErr.message);
      }
      if (insertErr?.code === '23505') {
        // Concurrent replay detected: another request inserted with this ID
        const { data: concurrentExisting } = await client
          .from('transactions')
          .select('id, user_id, amount_paise, type, category_id, transaction_date, payment_method, necessity, description, notes, recorded_at, created_at, updated_at, deleted_at, categories(name)')
          .eq('id', input.id)
          .maybeSingle();

        if (concurrentExisting) {
          if (concurrentExisting.deleted_at) {
            throw new ConflictError(
              'Transaction with this ID was previously deleted and cannot be recreated'
            );
          }

          const isMatch =
            Number(concurrentExisting.amount_paise) === Number(input.amount_paise) &&
            concurrentExisting.type === input.type &&
            concurrentExisting.category_id === input.category_id &&
            concurrentExisting.transaction_date === input.transaction_date &&
            concurrentExisting.payment_method === input.payment_method &&
            (concurrentExisting.necessity ?? null) === input.necessity &&
            (concurrentExisting.description ?? null) === input.description &&
            (concurrentExisting.notes ?? null) === input.notes;

          if (isMatch) {
            const catName = (concurrentExisting.categories as unknown as { name?: string } | null)?.name;
            return {
              transaction: mapToTransactionDTO(concurrentExisting as unknown as StoredTransactionRecord, catName),
              isReplay: true,
            };
          }

          throw new ConflictError(
            'A transaction with this ID already exists with different payload attributes'
          );
        }
      }
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
        'id, user_id, amount_paise, type, category_id, transaction_date, payment_method, necessity, description, notes, recorded_at, created_at, updated_at, deleted_at, categories(name)',
        { count: 'exact' }
      )
      .is('deleted_at', null);

    if (query.sort_by === 'date_asc') {
      qb = qb
        .order('transaction_date', { ascending: true })
        .order('recorded_at', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
    } else if (query.sort_by === 'amount_desc') {
      qb = qb
        .order('amount_paise', { ascending: false })
        .order('transaction_date', { ascending: false })
        .order('recorded_at', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });
    } else if (query.sort_by === 'amount_asc') {
      qb = qb
        .order('amount_paise', { ascending: true })
        .order('transaction_date', { ascending: false })
        .order('recorded_at', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });
    } else {
      // Default: date_desc (Newest First)
      qb = qb
        .order('transaction_date', { ascending: false })
        .order('recorded_at', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });
    }

    if (query.type) {
      qb = qb.eq('type', query.type);
    }
    if (query.category_id) {
      qb = qb.eq('category_id', query.category_id);
    }
    if (query.necessity) {
      qb = qb.eq('necessity', query.necessity);
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

    async updateTransaction(
    userId: string,
    id: string,
    input: ValidatedUpdateTransactionInput,
    token?: string
  ): Promise<TransactionDTO> {
    const client = this.getScopedClient(token);

    // 1. Fetch existing transaction belonging to caller
    const { data: existing, error: fetchErr } = await client
      .from('transactions')
      .select('id, user_id, amount_paise, type, category_id, transaction_date, payment_method, necessity, description, notes, recorded_at, created_at, updated_at, deleted_at, categories(name)')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !existing || existing.deleted_at !== null) {
      throw new NotFoundError('Transaction not found or has been deleted');
    }

    if (input.user_id && input.user_id !== existing.user_id) {
      throw new ValidationError('Cannot change user ownership of a transaction');
    }

    const finalType = input.type ?? (existing.type as TransactionType);
    const finalCategoryId = input.category_id ?? (existing.category_id as string);

    // 2. Validate category if category or type changed
    const { data: category, error: catErr } = await client
      .from('categories')
      .select('id, name, type')
      .eq('id', finalCategoryId)
      .is('archived_at', null)
      .maybeSingle();

    if (catErr || !category) {
      throw new ValidationError('Selected category does not exist or does not belong to the user');
    }

    if (category.type !== finalType) {
      throw new ValidationError(
        `Category '${category.name}' is of type '${category.type}', but transaction is '${finalType}'`
      );
    }

    // 3. Validate necessity against final type
    let finalNecessity: 'essential' | 'optional' | 'luxury' | null;
    if (finalType === 'income') {
      finalNecessity = null;
    } else {
      finalNecessity = input.necessity !== undefined
        ? input.necessity
        : (existing.necessity as 'essential' | 'optional' | 'luxury' | null);
      if (!finalNecessity) {
        throw new ValidationError(
          "Expense transactions require a valid necessity ('essential', 'optional', or 'luxury')"
        );
      }
    }

    // 4. Build update payload
    const updateData: Record<string, unknown> = {
      type: finalType,
      category_id: finalCategoryId,
      necessity: finalNecessity,
      updated_at: new Date().toISOString(),
    };

    if (input.amount_paise !== undefined) {
      updateData.amount_paise = Number(input.amount_paise);
    }
    if (input.transaction_date !== undefined) {
      updateData.transaction_date = input.transaction_date;
    }
    if (input.payment_method !== undefined) {
      updateData.payment_method = input.payment_method;
    }
    if (input.description !== undefined) {
      updateData.description = input.description;
    }
    if (input.notes !== undefined) {
      updateData.notes = input.notes;
    }

    const { data: updated, error: updateErr } = await client
      .from('transactions')
      .update(updateData)
      .eq('id', id)
      .select('id, user_id, amount_paise, type, category_id, transaction_date, payment_method, necessity, description, notes, recorded_at, created_at, updated_at, deleted_at, categories(name)')
      .single();

    if (updateErr || !updated) {
      if (
        updateErr?.code === '22003' ||
        updateErr?.message?.includes('Insufficient') ||
        updateErr?.message?.includes('Cannot delete')
      ) {
        throw new ValidationError(updateErr.message);
      }
      throw new Error(`Failed to update transaction: ${updateErr?.message || 'Unknown error'}`);
    }

    const catName = (updated.categories as unknown as { name?: string } | null)?.name || category.name;
    return mapToTransactionDTO(updated as unknown as StoredTransactionRecord, catName);
  }

  async deleteTransaction(
    userId: string,
    id: string,
    token?: string
  ): Promise<{ success: boolean; id: string }> {
    const client = this.getScopedClient(token);

    // Verify existing active record
    const { data: existing, error: fetchErr } = await client
      .from('transactions')
      .select('id, deleted_at')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !existing || existing.deleted_at !== null) {
      throw new NotFoundError('Transaction not found or already deleted');
    }

    const now = new Date().toISOString();
    const { error: updateErr } = await client
      .from('transactions')
      .update({ deleted_at: now, updated_at: now })
      .eq('id', id);

    if (updateErr) {
      if (
        updateErr.code === '22003' ||
        updateErr.message?.includes('Cannot delete')
      ) {
        throw new ValidationError(updateErr.message);
      }
      throw new Error(`Failed to delete transaction: ${updateErr.message}`);
    }

    return { success: true, id };
  }

  async restoreTransaction(
    userId: string,
    id: string,
    token?: string
  ): Promise<TransactionDTO> {
    const client = this.getScopedClient(token);

    const { data: existing, error: fetchErr } = await client
      .from('transactions')
      .select('id, deleted_at')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !existing) {
      throw new NotFoundError('Transaction not found');
    }

    const now = new Date().toISOString();
    const { data: restored, error: updateErr } = await client
      .from('transactions')
      .update({ deleted_at: null, updated_at: now })
      .eq('id', id)
      .select('id, user_id, amount_paise, type, category_id, transaction_date, payment_method, necessity, description, notes, recorded_at, created_at, updated_at, deleted_at, categories(name)')
      .single();

    if (updateErr || !restored) {
      throw new Error(`Failed to restore transaction: ${updateErr?.message || 'Unknown error'}`);
    }

    const catName = (restored.categories as unknown as { name?: string } | null)?.name;
    return mapToTransactionDTO(restored as unknown as StoredTransactionRecord, catName);
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
  public balanceService?: { getBalances: (userId: string) => Promise<AccountBalancesDTO> };
  private userLocks = new Map<string, Promise<void>>();

  public async withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const prevLock = this.userLocks.get(userId) || Promise.resolve();
    let release: () => void = () => {};
    const currentLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.userLocks.set(userId, currentLock);
    try {
      await prevLock;
      return await fn();
    } finally {
      release();
      if (this.userLocks.get(userId) === currentLock) {
        this.userLocks.delete(userId);
      }
    }
  }

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
    return this.withUserLock(userId, async () => {
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

      let nowMs = Date.now();
      let currentBalances: AccountBalancesDTO | null = null;
      if (this.balanceService) {
        currentBalances = await this.balanceService.getBalances(userId);
        if (currentBalances.balances_configured_at && nowMs <= Date.parse(currentBalances.balances_configured_at)) {
          nowMs = Date.parse(currentBalances.balances_configured_at) + 1;
        }
      }
      const now = new Date(nowMs).toISOString();
      const effectiveRecordedAt = input.recorded_at || input.created_at || now;

      if (input.type === 'expense' && currentBalances) {
        const isPostBaseline = !currentBalances.balances_configured_at || effectiveRecordedAt > currentBalances.balances_configured_at;
        if (isPostBaseline) {
          const avail = input.payment_method === 'cash' ? currentBalances.current_cash_paise : currentBalances.current_online_paise;
          if (Number(input.amount_paise) > avail) {
            throw new ValidationError(
              `Insufficient ${input.payment_method} balance. Available balance is ${avail} paise, but attempted expense is ${input.amount_paise} paise.`
            );
          }
        }
      }

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
        recorded_at: effectiveRecordedAt,
        created_at: input.created_at || now,
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
    });
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
    if (query.necessity) {
      filtered = filtered.filter((t) => t.necessity === query.necessity);
    }
    if (query.start_date) {
      filtered = filtered.filter((t) => t.transaction_date >= query.start_date!);
    }
    if (query.end_date) {
      filtered = filtered.filter((t) => t.transaction_date <= query.end_date!);
    }

    const sortBy = query.sort_by || 'date_desc';
    filtered.sort((a, b) => {
      if (sortBy === 'amount_desc') {
        if (b.amount_paise !== a.amount_paise) {
          return b.amount_paise - a.amount_paise;
        }
      } else if (sortBy === 'amount_asc') {
        if (a.amount_paise !== b.amount_paise) {
          return a.amount_paise - b.amount_paise;
        }
      }

      if (sortBy === 'date_asc') {
        if (a.transaction_date !== b.transaction_date) {
          return a.transaction_date.localeCompare(b.transaction_date);
        }
        const recA = a.recorded_at || a.created_at || '';
        const recB = b.recorded_at || b.created_at || '';
        if (recA !== recB) {
          return recA.localeCompare(recB);
        }
        if (a.created_at !== b.created_at) {
          return a.created_at.localeCompare(b.created_at);
        }
        return a.id.localeCompare(b.id);
      }

      // Default: date_desc (Newest First)
      if (a.transaction_date !== b.transaction_date) {
        return b.transaction_date.localeCompare(a.transaction_date);
      }
      const recA = a.recorded_at || a.created_at || '';
      const recB = b.recorded_at || b.created_at || '';
      if (recA !== recB) {
        return recB.localeCompare(recA);
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

  async updateTransaction(
    userId: string,
    id: string,
    input: ValidatedUpdateTransactionInput
  ): Promise<TransactionDTO> {
    const existing = this.transactions.find((t) => t.id === id);
    if (!existing || existing.user_id !== userId || existing.deleted_at !== null) {
      throw new NotFoundError('Transaction not found or has been deleted');
    }

    if (input.user_id && input.user_id !== existing.user_id) {
      throw new ValidationError('Cannot change user ownership of a transaction');
    }

    const finalType = input.type ?? existing.type;
    const finalCategoryId = input.category_id ?? existing.category_id;

    const category = this.categories.find(
      (c) => c.id === finalCategoryId && c.user_id === userId && c.archived_at === null
    );

    if (!category) {
      throw new ValidationError('Selected category does not exist or does not belong to the user');
    }

    if (category.type !== finalType) {
      throw new ValidationError(
        `Category '${category.name}' is of type '${category.type}', but transaction is '${finalType}'`
      );
    }

    let finalNecessity: 'essential' | 'optional' | 'luxury' | null;
    if (finalType === 'income') {
      finalNecessity = null;
    } else {
      finalNecessity = input.necessity !== undefined ? input.necessity : existing.necessity;
      if (!finalNecessity) {
        throw new ValidationError(
          "Expense transactions require a valid necessity ('essential', 'optional', or 'luxury')"
        );
      }
    }

    if (finalType === 'expense' && this.balanceService) {
      const currentBalances = await this.balanceService.getBalances(userId);
      const isPostBaseline = !currentBalances.balances_configured_at || (existing.recorded_at || existing.created_at) > currentBalances.balances_configured_at;
      if (isPostBaseline) {
        const finalMethod = input.payment_method ?? existing.payment_method;
        let avail = finalMethod === 'cash' ? currentBalances.current_cash_paise : currentBalances.current_online_paise;
        if (existing.type === 'expense' && existing.payment_method === finalMethod) {
          avail += existing.amount_paise;
        }
        const newAmountPaise = input.amount_paise !== undefined ? Number(input.amount_paise) : existing.amount_paise;
        if (newAmountPaise > avail) {
          throw new ValidationError(
            `Insufficient ${finalMethod} balance. Available balance is ${avail} paise, but attempted expense is ${newAmountPaise} paise.`
          );
        }
      }
    }

    const now = new Date().toISOString();
    if (input.amount_paise !== undefined) existing.amount_paise = Number(input.amount_paise);
    existing.type = finalType;
    existing.category_id = finalCategoryId;
    existing.category_name = category.name;
    existing.necessity = finalNecessity;
    if (input.transaction_date !== undefined) existing.transaction_date = input.transaction_date;
    if (input.payment_method !== undefined) existing.payment_method = input.payment_method;
    if (input.description !== undefined) existing.description = input.description;
    if (input.notes !== undefined) existing.notes = input.notes;
    existing.updated_at = now;

    this.outboxEvents.push({
      id: `outbox-${id}-${Date.now()}`,
      user_id: userId,
      entity_type: 'transaction',
      entity_id: id,
      event_type: 'transaction.updated',
      payload: { ...existing },
      status: 'pending',
      created_at: now,
    });

    return mapToTransactionDTO(existing, category.name);
  }

  async deleteTransaction(
    userId: string,
    id: string
  ): Promise<{ success: boolean; id: string }> {
    const existing = this.transactions.find((t) => t.id === id);
    if (!existing || existing.user_id !== userId || existing.deleted_at !== null) {
      throw new NotFoundError('Transaction not found or already deleted');
    }

    if (existing.type === 'income' && this.balanceService) {
      const currentBalances = await this.balanceService.getBalances(userId);
      const isExistingPostBaseline = !currentBalances.balances_configured_at || (existing.recorded_at || existing.created_at) > currentBalances.balances_configured_at;
      if (isExistingPostBaseline) {
        const avail = existing.payment_method === 'cash' ? currentBalances.current_cash_paise : currentBalances.current_online_paise;
        if (avail - existing.amount_paise < 0) {
          throw new ValidationError(`Cannot delete income: remaining ${existing.payment_method} balance would become negative.`);
        }
      }
    }

    const now = new Date().toISOString();
    existing.deleted_at = now;
    existing.updated_at = now;

    this.outboxEvents.push({
      id: `outbox-${id}-${Date.now()}`,
      user_id: userId,
      entity_type: 'transaction',
      entity_id: id,
      event_type: 'transaction.deleted',
      payload: { ...existing },
      status: 'pending',
      created_at: now,
    });

    return { success: true, id };
  }

  async restoreTransaction(
    userId: string,
    id: string
  ): Promise<TransactionDTO> {
    const existing = this.transactions.find((t) => t.id === id);
    if (!existing || existing.user_id !== userId) {
      throw new NotFoundError('Transaction not found');
    }

    if (existing.type === 'expense' && this.balanceService) {
      const currentBalances = await this.balanceService.getBalances(userId);
      const isExistingPostBaseline = !currentBalances.balances_configured_at || (existing.recorded_at || existing.created_at) > currentBalances.balances_configured_at;
      if (isExistingPostBaseline) {
        const avail = existing.payment_method === 'cash' ? currentBalances.current_cash_paise : currentBalances.current_online_paise;
        if (avail - existing.amount_paise < 0) {
          throw new ValidationError(`Cannot restore expense: insufficient ${existing.payment_method} balance.`);
        }
      }
    }

    const now = new Date().toISOString();
    existing.deleted_at = null;
    existing.updated_at = now;

    this.outboxEvents.push({
      id: `outbox-${id}-${Date.now()}`,
      user_id: userId,
      entity_type: 'transaction',
      entity_id: id,
      event_type: 'transaction.restored',
      payload: { ...existing },
      status: 'pending',
      created_at: now,
    });

    const cat = this.categories.find((c) => c.id === existing.category_id);
    return mapToTransactionDTO(existing, cat?.name);
  }
}
