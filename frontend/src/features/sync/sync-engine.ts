'use client';

import { v7 as uuidv7 } from 'uuid';
import type {
  TransactionDTO,
  AccountBalancesDTO,
  CategoryDTO,
  CreateTransactionRequest,
  CreateTransactionResponse,
  UpdateTransactionRequest,
  UpdateTransactionResponse,
  DeleteTransactionResponse,
  ConfigureStartingBalancesRequest,
  CreateTransferRequest,
  CreateAdjustmentRequest,
} from '@arth/contracts';
import {
  enqueuePendingMutation,
  getPendingMutations,
  removePendingMutation,
  updatePendingMutation,
  saveCachedTransaction,
  getCachedTransactions,
  getCachedTransactionById,
  deleteCachedTransactionPermanently,
  getCachedBalances,
  setCachedBalances,
  setCachedCategories,
  getSyncMeta,
  setSyncMeta,
  replaceCachedTransactions,
  saveTransactionCreationAtomic,
  saveTransactionDeletionAtomic,
  saveStartingBalancesAtomic,
  type PendingMutation,
  type OfflineTransactionDTO,
} from '../../lib/offline-db';
import {
  createTransaction as apiCreateTransaction,
  updateTransaction as apiUpdateTransaction,
  deleteTransaction as apiDeleteTransaction,
  configureStartingBalances as apiConfigureStartingBalances,
  createBalanceTransfer as apiCreateTransfer,
  createBalanceAdjustment as apiCreateAdjustment,
  fetchTransactions as apiFetchTransactions,
  fetchBalances as apiFetchBalances,
  fetchCategories as apiFetchCategories,
} from '../../lib/api-client';
import { parseINRToPaise, formatPaiseToINR } from '../../lib/format';
import { isStandalonePwaClient } from '../../lib/platform-mode';
import { authEvents } from '../auth/auth-events';

export interface SyncResourceErrors {
  balances: string | null;
  categories: string | null;
  transactions: string | null;
}

export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  syncingCount: number;
  failedCount: number;
  syncedCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
  mutationError: string | null;
  refreshError: string | null;
  resourceErrors: SyncResourceErrors;
}

type SyncListener = (state: SyncState) => void;

class SyncEngine {
  private isSyncing = false;
  private syncListeners = new Set<SyncListener>();
  private currentUserId: string | null = null;
  private currentPendingCount = 0;
  private currentSyncingCount = 0;
  private currentFailedCount = 0;
  private syncedCount = 0;
  private lastSyncedAt: number | null = null;
  private lastError: string | null = null;
  private mutationError: string | null = null;
  private refreshError: string | null = null;
  private resourceErrors: SyncResourceErrors = {
    balances: null,
    categories: null,
    transactions: null,
  };
  private isOnlineState =
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnlineState = true;
        this.notify();
        if (this.currentUserId) {
          void this.processQueue(this.currentUserId);
          void this.refreshAll(this.currentUserId);
        }
      });

      window.addEventListener('offline', () => {
        this.isOnlineState = false;
        this.notify();
      });

      window.addEventListener('focus', () => {
        if (this.isOnlineState && this.currentUserId) {
          void this.processQueue(this.currentUserId);
          void this.refreshAll(this.currentUserId);
        }
      });

      // Periodic background synchronization across active devices
      setInterval(() => {
        if (
          typeof document !== 'undefined' &&
          document.visibilityState === 'visible' &&
          this.isOnlineState &&
          this.currentUserId &&
          !this.isSyncing
        ) {
          void this.processQueue(this.currentUserId);
          void this.refreshAll(this.currentUserId);
        }
      }, 60000);
    }
  }

  private assertOfflineWriteIsAllowed(): void {
    if (typeof navigator !== 'undefined' && navigator.onLine === false && !isStandalonePwaClient()) {
      throw new Error('Offline changes are available in the installed SpendSense app. Reconnect to use SpendSense in a browser.');
    }
  }

  public setUserId(userId: string | null) {
    if (this.currentUserId !== userId) {
      this.currentUserId = userId;
      this.currentPendingCount = 0;
      this.currentSyncingCount = 0;
      this.currentFailedCount = 0;
      this.lastSyncedAt = null;
      this.lastError = null;
      this.mutationError = null;
      this.refreshError = null;
      this.resourceErrors = {
        balances: null,
        categories: null,
        transactions: null,
      };
      if (userId) {
        // Load initial sync metadata and local cache count without restoring old error as active error
        void Promise.all([getSyncMeta(userId), getCachedTransactions(userId)]).then(([meta, cached]) => {
          this.lastSyncedAt = meta.lastSyncedAt;
          this.syncedCount = cached.length;
          this.updatePendingCount(userId);
          this.notify();
        });
      }
      this.notify();
    }
  }

  public subscribe(listener: SyncListener): () => void {
    this.syncListeners.add(listener);
    listener(this.getState());
    return () => {
      this.syncListeners.delete(listener);
    };
  }

  public getState(): SyncState {
    return {
      isOnline: this.isOnlineState,
      isSyncing: this.isSyncing,
      pendingCount: this.currentPendingCount,
      syncingCount: this.currentSyncingCount,
      failedCount: this.currentFailedCount,
      syncedCount: this.syncedCount,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
      mutationError: this.mutationError,
      refreshError: this.refreshError,
      resourceErrors: { ...this.resourceErrors },
    };
  }

  public notifyAuthSessionExpired(): void {
    this.lastError = 'Authentication session expired';
    this.mutationError = 'Authentication session expired';
    this.notify();
  }

  private notify() {
    const state = this.getState();
    this.syncListeners.forEach((fn) => {
      try {
        fn(state);
      } catch (err) {
        console.warn('[SyncEngine] Listener error:', err);
      }
    });
  }

  public async updatePendingCount(userId: string) {
    try {
      const pending = await getPendingMutations(userId);
      this.currentPendingCount = pending.length;
      this.currentFailedCount = pending.filter((m) => m.status === 'failed').length;
      this.currentSyncingCount = this.isSyncing
        ? pending.filter((m) => m.status === 'syncing' || m.status === 'pending').length
        : 0;
      this.notify();
    } catch {
      // Ignore
    }
  }

  /**
   * Local-First Transaction Creation:
   * 1. Validates locally.
   * 2. Saves to IndexedDB immediately.
   * 3. Updates local balances immediately.
   * 4. Enqueues mutation to durable queue.
   * 5. Triggers background sync if online.
   * 6. Returns optimistic transaction immediately with honest sync status.
   */
  public async createTransactionLocalFirst(
    payload: CreateTransactionRequest,
    categories: CategoryDTO[],
    userId: string
  ): Promise<CreateTransactionResponse> {
    this.assertOfflineWriteIsAllowed();
    const paise = parseINRToPaise(payload.amount);
    const category = categories.find((c) => c.id === payload.category_id);

    const recorded_at = payload.recorded_at || new Date().toISOString();

    if (payload.type === 'expense') {
      const balances = await getCachedBalances(userId);
      if (balances && balances.balances_configured) {
        const isPreBaseline = balances.balances_configured_at && recorded_at <= balances.balances_configured_at;
        if (!isPreBaseline) {
          const avail = payload.payment_method === 'cash' ? balances.current_cash_paise : balances.current_online_paise;
          if (Number(paise) > avail) {
            throw new Error(`Insufficient ${payload.payment_method} balance. Available balance is ${formatPaiseToINR(avail)}, but attempted expense is ${formatPaiseToINR(paise)}.`);
          }
        }
      }
    }

    const optimisticTxn: OfflineTransactionDTO = {
      id: payload.id,
      user_id: userId,
      amount_paise: Number(paise),
      amount_decimal: payload.amount,
      formatted_inr: formatPaiseToINR(paise),
      type: payload.type,
      category_id: payload.category_id,
      category_name: category?.name || 'Uncategorized',
      transaction_date: payload.transaction_date,
      payment_method: payload.payment_method,
      necessity: payload.necessity ?? null,
      description: payload.description || null,
      notes: payload.notes || null,
      ...(payload.account_id ? { account_id: payload.account_id } : {}),
      ...(payload.import_batch_id ? { import_batch_id: payload.import_batch_id } : {}),
      ...(payload.statement_reference ? { statement_reference: payload.statement_reference } : {}),
      recorded_at,
      created_at: payload.created_at || recorded_at,
      updated_at: new Date().toISOString(),
      sync_status: 'pending',
      deleted_locally: false,
    };

    // 1. Save atomically to local IndexedDB (transaction + mutation outbox + balance adjustment)
    const mutationRecord: PendingMutation = {
      id: uuidv7(),
      entityId: payload.id,
      userId,
      type: 'create_transaction',
      payload: { ...payload, recorded_at, created_at: payload.created_at || recorded_at },
      createdAt: Date.now(),
      attempts: 0,
      status: 'pending',
      lastAttemptAt: null,
      lastError: null,
    };

    await saveTransactionCreationAtomic({
      transaction: optimisticTxn,
      mutation: mutationRecord,
      userId,
    });

    await this.updatePendingCount(userId);

    // 4. Trigger background synchronization if online
    if (this.isOnlineState) {
      void this.processQueue(userId);
    }

    return {
      transaction: optimisticTxn,
      idempotent_replay: false,
    };
  }

  /**
   * Local-First Transaction Update:
   * 1. Updates IndexedDB immediately with pending status.
   * 2. Enqueues update mutation.
   * 3. Triggers sync.
   */
  public async updateTransactionLocalFirst(
    id: string,
    updates: UpdateTransactionRequest,
    categories: CategoryDTO[],
    userId: string
  ): Promise<UpdateTransactionResponse> {
    this.assertOfflineWriteIsAllowed();
    const existing = await getCachedTransactionById(id, userId);
    if (!existing) {
      throw new Error('Transaction not found in local storage.');
    }

    let amountPaise = existing.amount_paise;
    let formattedInr = existing.formatted_inr;
    let amountDecimal = existing.amount_decimal;

    if (updates.amount) {
      const p = parseINRToPaise(updates.amount);
      amountPaise = Number(p);
      formattedInr = formatPaiseToINR(p);
      amountDecimal = updates.amount;
    }

    const categoryId = updates.category_id ?? existing.category_id;
    const category = categories.find((c) => c.id === categoryId);

    const updatedTxn: OfflineTransactionDTO = {
      ...existing,
      amount_paise: amountPaise,
      amount_decimal: amountDecimal,
      formatted_inr: formattedInr,
      type: updates.type ?? existing.type,
      category_id: categoryId,
      category_name: category?.name ?? existing.category_name,
      transaction_date: updates.transaction_date ?? existing.transaction_date,
      payment_method: updates.payment_method ?? existing.payment_method,
      necessity: updates.type === 'expense' ? (updates.necessity ?? existing.necessity) : null,
      description: updates.description !== undefined ? updates.description : existing.description,
      notes: updates.notes !== undefined ? updates.notes : existing.notes,
      updated_at: new Date().toISOString(),
      sync_status: 'pending',
    };

    await this.reverseLocalTransactionBalanceDelta(existing, userId);
    await saveCachedTransaction(updatedTxn, userId, 'pending');
    await this.applyLocalTransactionBalanceDelta(updatedTxn, userId);

    await enqueuePendingMutation({
      id: uuidv7(),
      entityId: id,
      userId,
      type: 'update_transaction',
      payload: { id, updates },
    });

    await this.updatePendingCount(userId);

    if (this.isOnlineState) {
      void this.processQueue(userId);
    }

    return {
      transaction: updatedTxn,
    };
  }

  /**
   * Local-First Transaction Deletion:
   * 1. Marks deleted locally immediately in IndexedDB.
   * 2. Adjusts local balances.
   * 3. Enqueues delete mutation.
   * 4. Triggers sync.
   */
  public async deleteTransactionLocalFirst(
    id: string,
    userId: string
  ): Promise<DeleteTransactionResponse> {
    this.assertOfflineWriteIsAllowed();
    const existing = await getCachedTransactionById(id, userId);

    const mutationRecord: PendingMutation = {
      id: uuidv7(),
      entityId: id,
      userId,
      type: 'delete_transaction',
      payload: { id },
      createdAt: Date.now(),
      attempts: 0,
      status: 'pending',
      lastAttemptAt: null,
      lastError: null,
    };

    await saveTransactionDeletionAtomic({
      id,
      mutation: mutationRecord,
      userId,
      existingTransaction: existing,
    });

    await this.updatePendingCount(userId);

    if (this.isOnlineState) {
      void this.processQueue(userId);
    }

    return {
      id,
      success: true,
      message: 'Transaction deleted locally. Queued for synchronization.',
    };
  }

  /**
   * Local-First Starting Balances Configuration:
   */
  public async configureStartingBalancesLocalFirst(
    req: ConfigureStartingBalancesRequest,
    userId: string
  ): Promise<AccountBalancesDTO> {
    this.assertOfflineWriteIsAllowed();
    const reqCashPaise = Number(parseINRToPaise(req.starting_cash || '0'));
    const reqOnlinePaise = Number(parseINRToPaise(req.starting_online || '0'));
    const nowIso = new Date().toISOString();

    const newStartingCash = reqCashPaise;
    const newStartingOnline = reqOnlinePaise;
    const newStartingTotal = newStartingCash + newStartingOnline;

    const updatedBalances: AccountBalancesDTO = {
      starting_cash_paise: newStartingCash,
      starting_online_paise: newStartingOnline,
      starting_total_paise: newStartingTotal,
      current_cash_paise: newStartingCash,
      current_online_paise: newStartingOnline,
      total_available_paise: newStartingTotal,
      formatted_starting_cash: formatPaiseToINR(newStartingCash),
      formatted_starting_online: formatPaiseToINR(newStartingOnline),
      formatted_starting_total: formatPaiseToINR(newStartingTotal),
      formatted_current_cash: formatPaiseToINR(newStartingCash),
      formatted_current_online: formatPaiseToINR(newStartingOnline),
      formatted_total_available: formatPaiseToINR(newStartingTotal),
      balances_configured: true,
      balances_configured_at: nowIso,
    };

    const mutationRecord: PendingMutation = {
      id: uuidv7(),
      entityId: userId,
      userId,
      type: 'configure_starting_balances',
      payload: req,
      createdAt: Date.now(),
      attempts: 0,
      status: 'pending',
      lastAttemptAt: null,
      lastError: null,
    };

    await saveStartingBalancesAtomic({
      balances: updatedBalances,
      mutation: mutationRecord,
      userId,
    });

    await this.updatePendingCount(userId);

    if (this.isOnlineState) {
      void this.processQueue(userId);
    }

    return updatedBalances;
  }

  /**
   * Processes the durable client-side outbox queue:
   * - Sends pending local operations sequentially in dependency order.
   * - Retries temporary failures with backoff.
   * - Marks successful operations as Synced.
   * - Pulls server updates to reconcile.
   */
  public async processQueue(userId: string): Promise<void> {
    if (this.isSyncing) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.isOnlineState = false;
      this.notify();
      return;
    }

    this.isSyncing = true;
    this.lastError = null;
    this.notify();

    try {
      const pending = await getPendingMutations(userId);
      this.currentPendingCount = pending.length;
      this.notify();

      for (const mutation of pending) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          this.isOnlineState = false;
          break;
        }

        try {
          await updatePendingMutation(mutation.id, {
            status: 'syncing',
            lastAttemptAt: Date.now(),
          });
          await this.updatePendingCount(userId);

          await this.executeMutation(mutation, userId);
          // Mutation confirmed by server — safely remove from outbox
          await removePendingMutation(mutation.id);
          this.syncedCount += 1;
        } catch (itemErr: unknown) {
          const isNetError =
            itemErr instanceof TypeError ||
            /failed to fetch|network|offline/i.test(String(itemErr));

          if (isNetError) {
            // Stop processing queue on network loss
            this.isOnlineState = false;
            this.mutationError = 'Network disconnected during synchronization';
            this.lastError = this.mutationError;
            await updatePendingMutation(mutation.id, {
              status: 'pending',
              attempts: mutation.attempts + 1,
              lastAttemptAt: Date.now(),
              lastError: 'Network disconnected during synchronization',
            });
            break;
          }

          // Unrecoverable validation error (400, 422) or server mutation failure
          const statusCode = (itemErr as { statusCode?: number })?.statusCode;
          const msg = itemErr instanceof Error ? itemErr.message : 'Server rejected mutation';
          this.mutationError = msg;
          this.lastError = msg;

          if (statusCode === 401 || statusCode === 403) {
            // Authentication session expired — halt queue immediately and preserve mutation for next login
            this.mutationError = 'Authentication session expired';
            this.lastError = 'Authentication session expired';
            await updatePendingMutation(mutation.id, {
              status: 'pending',
              lastAttemptAt: Date.now(),
              lastError: 'Authentication session expired',
            });
            authEvents.emitSessionExpired();
            break;
          } else if (statusCode === 400 || statusCode === 422) {
            await updatePendingMutation(mutation.id, {
              status: 'failed',
              attempts: mutation.attempts + 1,
              lastAttemptAt: Date.now(),
              lastError: msg,
            });
          } else {
            // Temporary server error (500, 503) — increment attempt and back off
            await updatePendingMutation(mutation.id, {
              status: 'pending',
              attempts: mutation.attempts + 1,
              lastAttemptAt: Date.now(),
              lastError: msg,
            });
          }
        }
      }

      // Re-evaluate pending count
      const remaining = await getPendingMutations(userId);
      this.currentPendingCount = remaining.length;
      if (remaining.length === 0) {
        this.mutationError = null;
      }

      // Reconcile with server if queue is empty or online (and session not expired)
      if (
        typeof navigator !== 'undefined' &&
        navigator.onLine &&
        this.lastError !== 'Authentication session expired'
      ) {
        const refreshed = await this.reconcileServerState(userId);
        if (refreshed) {
          this.lastSyncedAt = Date.now();
          if (!this.mutationError) {
            this.lastError = null;
          }
          await setSyncMeta(userId, { lastSyncedAt: this.lastSyncedAt, lastError: this.lastError });
        }
      }
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'Synchronization failed';
      await setSyncMeta(userId, { lastError: this.lastError });
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }

  public async retryFailedMutations(userId: string): Promise<void> {
    const pending = await getPendingMutations(userId);
    for (const m of pending) {
      if (m.status === 'failed') {
        await updatePendingMutation(m.id, {
          status: 'pending',
          attempts: 0,
          lastError: null,
        });
      }
    }
    this.mutationError = null;
    this.lastError = null;
    await this.updatePendingCount(userId);
    if (this.isOnlineState) {
      await this.processQueue(userId);
    }
  }

  private async executeMutation(mutation: PendingMutation, userId: string): Promise<void> {
    switch (mutation.type) {
      case 'create_transaction': {
        const payload = mutation.payload as CreateTransactionRequest;
        try {
          const res = await apiCreateTransaction(payload);
          // Mark transaction as synced in local cache
          await saveCachedTransaction(res.transaction, userId, 'synced');
        } catch (err: unknown) {
          // If 409 conflict, idempotent replay check
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 409) {
            // Transaction already exists on server — mark synced
            const cached = await getCachedTransactionById(payload.id, userId);
            if (cached) {
              await saveCachedTransaction(cached, userId, 'synced');
            }
            return;
          }
          throw err;
        }
        break;
      }

      case 'update_transaction': {
        const { id, updates } = mutation.payload as {
          id: string;
          updates: UpdateTransactionRequest;
        };
        try {
          const res = await apiUpdateTransaction(id, updates);
          await saveCachedTransaction(res.transaction, userId, 'synced');
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404) {
            // Transaction was deleted on server — remove from local cache
            await deleteCachedTransactionPermanently(id, userId);
            return;
          }
          throw err;
        }
        break;
      }

      case 'delete_transaction': {
        const { id } = mutation.payload as { id: string };
        try {
          await apiDeleteTransaction(id);
          await deleteCachedTransactionPermanently(id, userId);
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404) {
            // Already deleted on server
            await deleteCachedTransactionPermanently(id, userId);
            return;
          }
          throw err;
        }
        break;
      }

      case 'configure_starting_balances': {
        const payload = mutation.payload as ConfigureStartingBalancesRequest;
        const res = await apiConfigureStartingBalances(payload);
        await setCachedBalances(res, userId);
        break;
      }

      case 'create_transfer': {
        const payload = mutation.payload as CreateTransferRequest;
        await apiCreateTransfer(payload);
        break;
      }

      case 'create_adjustment': {
        const payload = mutation.payload as CreateAdjustmentRequest;
        await apiCreateAdjustment(payload);
        break;
      }
    }
  }

  /**
   * Reconciles server state into local IndexedDB cache:
   * - Pulls server transactions, balances, and categories.
   * - Preserves pending local mutations so un-synced local edits are not overwritten.
   * - Identifies specific failing resources instead of returning generic errors.
   */
  private checkAuthError(err: unknown): void {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 401 || statusCode === 403) {
      this.lastError = 'Authentication session expired';
      authEvents.emitSessionExpired();
    }
  }

  public async refreshAll(userId?: string): Promise<boolean> {
    const targetUserId = userId || this.currentUserId;
    if (!targetUserId) return false;
    return this.reconcileServerState(targetUserId);
  }

  public async reconcileServerState(userId: string): Promise<boolean> {
    const failedResources: string[] = [];

    // 1. Refresh account balances
    try {
      const serverBalances = await apiFetchBalances();
      const pending = await getPendingMutations(userId);
      const hasBalanceMutations = pending.some((m) =>
        ['configure_starting_balances', 'create_transfer', 'create_adjustment'].includes(m.type)
      );
      if (!hasBalanceMutations) {
        await setCachedBalances(serverBalances, userId);
        await setSyncMeta(userId, { balancesCachedAt: Date.now() });
      }
      this.resourceErrors.balances = null;
    } catch (err) {
      console.warn('[SyncEngine] Failed to refresh account balances:', err);
      this.checkAuthError(err);
      this.resourceErrors.balances = err instanceof Error ? err.message : 'Failed to refresh balances';
      failedResources.push('Account balances');
    }

    // 2. Refresh categories
    try {
      const serverCategories = await apiFetchCategories({ include_archived: true });
      await setCachedCategories(serverCategories.categories, userId);
      await setSyncMeta(userId, { categoriesSnapshotComplete: true });
      this.resourceErrors.categories = null;
    } catch (err) {
      console.warn('[SyncEngine] Failed to refresh categories:', err);
      this.checkAuthError(err);
      this.resourceErrors.categories = err instanceof Error ? err.message : 'Failed to refresh categories';
      failedResources.push('Categories');
    }

    // 3. Refresh transactions
    try {
      const all: TransactionDTO[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const result = await apiFetchTransactions({ page, page_size: 100 });
        all.push(...result.items);
        hasMore = result.has_more;
        page += 1;
        if (page > 1000) throw new Error('Transaction snapshot exceeded the safety page limit.');
      }
      await replaceCachedTransactions(all, userId);
      this.syncedCount = all.length;
      await setSyncMeta(userId, { transactionsSnapshotComplete: true });
      this.resourceErrors.transactions = null;
    } catch (err) {
      console.warn('[SyncEngine] Failed to refresh transactions:', err);
      this.checkAuthError(err);
      this.resourceErrors.transactions = err instanceof Error ? err.message : 'Failed to refresh transactions';
      failedResources.push('Transaction history');
    }

    if (failedResources.length === 0) {
      this.refreshError = null;
      this.lastSyncedAt = Date.now();
      if (!this.mutationError) {
        this.lastError = null;
        await setSyncMeta(userId, {
          lastSyncedAt: this.lastSyncedAt,
          lastError: null,
        });
      } else {
        await setSyncMeta(userId, {
          lastSyncedAt: this.lastSyncedAt,
          lastError: this.lastError,
        });
      }
      return true;
    }

    const failedList = failedResources.join(' and ');
    this.refreshError = `${failedList} could not be refreshed; showing the saved local copy.`;
    if (!this.mutationError) {
      this.lastError = this.refreshError;
    }
    await setSyncMeta(userId, { lastError: this.lastError });
    return false;
  }

  private async applyLocalTransactionBalanceDelta(
    txn: OfflineTransactionDTO,
    userId: string
  ): Promise<void> {
    const balances = await getCachedBalances(userId);
    if (!balances) return;

    // Pre-baseline transactions must never alter the baseline snapshot balances
    if (balances.balances_configured_at && (txn.recorded_at || txn.created_at) <= balances.balances_configured_at) {
      return;
    }

    const delta = txn.type === 'income' ? txn.amount_paise : -txn.amount_paise;
    const isCash = txn.payment_method === 'cash';

    const newCash = isCash ? balances.current_cash_paise + delta : balances.current_cash_paise;
    const newOnline = !isCash ? balances.current_online_paise + delta : balances.current_online_paise;
    const newTotal = newCash + newOnline;

    const updated: AccountBalancesDTO = {
      ...balances,
      current_cash_paise: newCash,
      current_online_paise: newOnline,
      total_available_paise: newTotal,
      formatted_current_cash: formatPaiseToINR(newCash),
      formatted_current_online: formatPaiseToINR(newOnline),
      formatted_total_available: formatPaiseToINR(newTotal),
    };

    await setCachedBalances(updated, userId);
  }

  private async reverseLocalTransactionBalanceDelta(
    txn: OfflineTransactionDTO,
    userId: string
  ): Promise<void> {
    const balances = await getCachedBalances(userId);
    if (!balances) return;

    // Pre-baseline transactions must never alter the baseline snapshot balances
    if (balances.balances_configured_at && (txn.recorded_at || txn.created_at) <= balances.balances_configured_at) {
      return;
    }

    // Opposite of apply
    const delta = txn.type === 'income' ? -txn.amount_paise : txn.amount_paise;
    const isCash = txn.payment_method === 'cash';

    const newCash = isCash ? balances.current_cash_paise + delta : balances.current_cash_paise;
    const newOnline = !isCash ? balances.current_online_paise + delta : balances.current_online_paise;
    const newTotal = newCash + newOnline;

    const updated: AccountBalancesDTO = {
      ...balances,
      current_cash_paise: newCash,
      current_online_paise: newOnline,
      total_available_paise: newTotal,
      formatted_current_cash: formatPaiseToINR(newCash),
      formatted_current_online: formatPaiseToINR(newOnline),
      formatted_total_available: formatPaiseToINR(newTotal),
    };

    await setCachedBalances(updated, userId);
  }
}

export const syncEngine = new SyncEngine();
