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
  markCachedTransactionDeleted,
  deleteCachedTransactionPermanently,
  getCachedBalances,
  setCachedBalances,
  getCachedCategories,
  setCachedCategories,
  getSyncMeta,
  setSyncMeta,
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

export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
}

type SyncListener = (state: SyncState) => void;

class SyncEngine {
  private isSyncing = false;
  private syncListeners = new Set<SyncListener>();
  private currentUserId: string | null = null;
  private currentPendingCount = 0;
  private lastSyncedAt: number | null = null;
  private lastError: string | null = null;
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
        }
      });

      window.addEventListener('offline', () => {
        this.isOnlineState = false;
        this.notify();
      });

      window.addEventListener('focus', () => {
        if (this.isOnlineState && this.currentUserId) {
          void this.processQueue(this.currentUserId);
        }
      });
    }
  }

  public setUserId(userId: string | null) {
    if (this.currentUserId !== userId) {
      this.currentUserId = userId;
      if (userId) {
        // Load initial sync metadata
        void getSyncMeta(userId).then((meta) => {
          this.lastSyncedAt = meta.lastSyncedAt;
          this.lastError = meta.lastError;
          this.updatePendingCount(userId);
        });
      }
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
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
    };
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
    const paise = parseINRToPaise(payload.amount);
    const category = categories.find((c) => c.id === payload.category_id);

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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sync_status: 'pending',
      deleted_locally: false,
    };

    // 1. Save to local IndexedDB immediately
    await saveCachedTransaction(optimisticTxn, userId, 'pending');

    // 2. Adjust local balances
    await this.applyLocalTransactionBalanceDelta(optimisticTxn, userId);

    // 3. Add to durable outbox queue
    await enqueuePendingMutation({
      id: uuidv7(),
      entityId: payload.id,
      userId,
      type: 'create_transaction',
      payload,
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

    await saveCachedTransaction(updatedTxn, userId, 'pending');

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
    const existing = await getCachedTransactionById(id, userId);
    if (existing) {
      // Reverse balance delta
      await this.reverseLocalTransactionBalanceDelta(existing, userId);
      await markCachedTransactionDeleted(id, userId);
    }

    await enqueuePendingMutation({
      id: uuidv7(),
      entityId: id,
      userId,
      type: 'delete_transaction',
      payload: { id },
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
    const existing = (await getCachedBalances(userId)) || {
      starting_cash_paise: 0,
      starting_online_paise: 0,
      starting_total_paise: 0,
      current_cash_paise: 0,
      current_online_paise: 0,
      total_available_paise: 0,
      formatted_starting_cash: '₹0.00',
      formatted_starting_online: '₹0.00',
      formatted_starting_total: '₹0.00',
      formatted_current_cash: '₹0.00',
      formatted_current_online: '₹0.00',
      formatted_total_available: '₹0.00',
      balances_configured: false,
      balances_configured_at: null,
    };

    const reqCashPaise = Number(parseINRToPaise(req.starting_cash || '0'));
    const reqOnlinePaise = Number(parseINRToPaise(req.starting_online || '0'));

    const deltaCash = reqCashPaise - existing.starting_cash_paise;
    const deltaOnline = reqOnlinePaise - existing.starting_online_paise;

    const newStartingCash = reqCashPaise;
    const newStartingOnline = reqOnlinePaise;
    const newStartingTotal = newStartingCash + newStartingOnline;
    const newCurrentCash = existing.current_cash_paise + deltaCash;
    const newCurrentOnline = existing.current_online_paise + deltaOnline;
    const newTotalAvailable = newCurrentCash + newCurrentOnline;

    const updatedBalances: AccountBalancesDTO = {
      starting_cash_paise: newStartingCash,
      starting_online_paise: newStartingOnline,
      starting_total_paise: newStartingTotal,
      current_cash_paise: newCurrentCash,
      current_online_paise: newCurrentOnline,
      total_available_paise: newTotalAvailable,
      formatted_starting_cash: formatPaiseToINR(newStartingCash),
      formatted_starting_online: formatPaiseToINR(newStartingOnline),
      formatted_starting_total: formatPaiseToINR(newStartingTotal),
      formatted_current_cash: formatPaiseToINR(newCurrentCash),
      formatted_current_online: formatPaiseToINR(newCurrentOnline),
      formatted_total_available: formatPaiseToINR(newTotalAvailable),
      balances_configured: true,
      balances_configured_at: existing.balances_configured_at || new Date().toISOString(),
    };

    await setCachedBalances(updatedBalances, userId);

    await enqueuePendingMutation({
      id: uuidv7(),
      entityId: userId,
      userId,
      type: 'configure_starting_balances',
      payload: req,
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
          await this.executeMutation(mutation, userId);
          // Mutation confirmed by server — safely remove from outbox
          await removePendingMutation(mutation.id);
        } catch (itemErr: unknown) {
          const isNetError =
            itemErr instanceof TypeError ||
            /failed to fetch|network|offline/i.test(String(itemErr));

          if (isNetError) {
            // Stop processing queue on network loss
            this.isOnlineState = false;
            await updatePendingMutation(mutation.id, {
              attempts: mutation.attempts + 1,
              lastAttemptAt: Date.now(),
              lastError: 'Network disconnected during synchronization',
            });
            break;
          }

          // Unrecoverable validation error (400, 422) or client error
          const statusCode = (itemErr as { statusCode?: number })?.statusCode;
          if (statusCode === 400 || statusCode === 422) {
            await updatePendingMutation(mutation.id, {
              status: 'failed',
              attempts: mutation.attempts + 1,
              lastAttemptAt: Date.now(),
              lastError: itemErr instanceof Error ? itemErr.message : 'Server rejected mutation',
            });
          } else {
            // Temporary server error (500, 503) — increment attempt and back off
            await updatePendingMutation(mutation.id, {
              attempts: mutation.attempts + 1,
              lastAttemptAt: Date.now(),
              lastError: itemErr instanceof Error ? itemErr.message : 'Sync temporary failure',
            });
          }
        }
      }

      // Re-evaluate pending count
      const remaining = await getPendingMutations(userId);
      this.currentPendingCount = remaining.length;

      // Reconcile with server if queue is empty or online
      if (navigator.onLine) {
        await this.reconcileServerState(userId);
        this.lastSyncedAt = Date.now();
        await setSyncMeta(userId, { lastSyncedAt: this.lastSyncedAt, lastError: null });
      }
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'Synchronization failed';
      await setSyncMeta(userId, { lastError: this.lastError });
    } finally {
      this.isSyncing = false;
      this.notify();
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
            await deleteCachedTransactionPermanently(id);
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
          await deleteCachedTransactionPermanently(id);
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404) {
            // Already deleted on server
            await deleteCachedTransactionPermanently(id);
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
   */
  private async reconcileServerState(userId: string): Promise<void> {
    try {
      const [serverTxRes, serverBalances, serverCategories] = await Promise.allSettled([
        apiFetchTransactions({ page_size: 100 }),
        apiFetchBalances(),
        apiFetchCategories(),
      ]);

      if (serverBalances.status === 'fulfilled') {
        // Only overwrite cached balances if there are no pending starting balance or transfer mutations
        const pending = await getPendingMutations(userId);
        const hasBalanceMutations = pending.some(
          (m) =>
            m.type === 'configure_starting_balances' ||
            m.type === 'create_transfer' ||
            m.type === 'create_adjustment'
        );
        if (!hasBalanceMutations) {
          await setCachedBalances(serverBalances.value, userId);
        }
      }

      if (serverCategories.status === 'fulfilled') {
        await setCachedCategories(serverCategories.value.categories, userId);
      }

      if (serverTxRes.status === 'fulfilled') {
        const serverTransactions = serverTxRes.value.items;
        const pending = await getPendingMutations(userId);
        const pendingEntityIds = new Set(pending.map((m) => m.entityId));

        // Read local transactions
        const localTransactions = await getCachedTransactions(userId);
        const localPending = localTransactions.filter((t) => t.sync_status === 'pending');

        // Merge: server transactions + local pending transactions
        const mergedMap = new Map<string, OfflineTransactionDTO>();

        for (const st of serverTransactions) {
          // If this record has a local pending mutation, preserve the local un-synced edit!
          if (pendingEntityIds.has(st.id)) {
            const pendingRecord = localPending.find((t) => t.id === st.id);
            if (pendingRecord) {
              mergedMap.set(st.id, pendingRecord);
              continue;
            }
          }
          mergedMap.set(st.id, {
            ...st,
            user_id: userId,
            sync_status: 'synced',
            deleted_locally: false,
          });
        }

        // Add any newly created local pending transactions not yet on server
        for (const lp of localPending) {
          if (!mergedMap.has(lp.id) && !lp.deleted_locally) {
            mergedMap.set(lp.id, lp);
          }
        }

        for (const txn of mergedMap.values()) {
          await saveCachedTransaction(txn, userId, txn.sync_status);
        }
      }
    } catch {
      // Reconcile is best effort
    }
  }

  private async applyLocalTransactionBalanceDelta(
    txn: OfflineTransactionDTO,
    userId: string
  ): Promise<void> {
    const balances = await getCachedBalances(userId);
    if (!balances) return;

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
