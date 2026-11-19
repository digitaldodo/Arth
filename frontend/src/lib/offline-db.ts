import type {
  TransactionDTO,
  AccountBalancesDTO,
  DashboardSummaryResponse,
  CategoryDTO,
  CreateTransactionRequest,
  CreateTransferRequest,
  CreateAdjustmentRequest,
  UpdateTransactionRequest,
  ConfigureStartingBalancesRequest,
  PersonDTO,
  PersonDetailDTO,
} from '@arth/contracts';
import { formatPaiseToINR } from './format';

const DB_NAME = 'arth_offline_db';
const DB_VERSION = 7;

export interface StatementImportBatch {
  id: string;
  user_id: string;
  source: string;
  created_at: string;
  imported_ids: string[];
  detected_count: number;
  status: 'processing' | 'completed' | 'partial' | 'undone';
  account_id?: string | null;
  statement_start?: string | null;
  statement_end?: string | null;
  opening_balance_paise?: string | null;
  closing_balance_paise?: string | null;
  parser_id?: string;
  source_format?: 'pdf' | 'csv' | 'xlsx' | 'xls';
  source_sha256?: string | null;
  duplicate_count?: number;
  discrepancy_count?: number;
  skipped_rows?: Array<{ transaction_date: string; amount_paise: string; state: string; reason: 'possible_duplicate' | 'ambiguous' | 'balance_mismatch' | 'deselected' | 'import_error' }>;
}

export interface CachedPwaUser {
  id: string;
  email?: string;
  displayName?: string;
  username?: string;
  providers?: string[];
  passwordStatus?: 'configured' | 'not_configured' | 'unknown';
}

export type MutationType =
  | 'create_transaction'
  | 'update_transaction'
  | 'delete_transaction'
  | 'configure_starting_balances'
  | 'create_transfer'
  | 'create_adjustment';

export interface PendingMutation {
  id: string; // unique operation UUID v7
  entityId: string; // target entity ID (transaction ID, user ID, movement ID)
  userId: string; // authenticated account ownership context
  type: MutationType;
  payload:
    | CreateTransactionRequest
    | { id: string; updates: UpdateTransactionRequest }
    | { id: string }
    | ConfigureStartingBalancesRequest
    | CreateTransferRequest
    | CreateAdjustmentRequest;
  createdAt: number;
  attempts: number;
  lastAttemptAt?: number | null;
  lastError?: string | null;
  status: 'pending' | 'syncing' | 'failed';
}

export interface OfflineTransactionDTO extends TransactionDTO {
  user_id?: string;
  sync_status?: 'synced' | 'pending' | 'failed';
  deleted_locally?: boolean;
}

export interface SyncMetadata {
  lastSyncedAt: number | null;
  lastError: string | null;
  transactionsSnapshotComplete: boolean;
  categoriesSnapshotComplete: boolean;
  balancesCachedAt: number | null;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const tx = (event.target as IDBOpenDBRequest).transaction;

      // 1. Transactions Store
      let txnStore: IDBObjectStore;
      if (!db.objectStoreNames.contains('transactions')) {
        txnStore = db.createObjectStore('transactions', { keyPath: 'id' });
        txnStore.createIndex('user_id', 'user_id', { unique: false });
        txnStore.createIndex('created_at', 'created_at', { unique: false });
      } else if (tx) {
        txnStore = tx.objectStore('transactions');
        if (!txnStore.indexNames.contains('user_id')) {
          txnStore.createIndex('user_id', 'user_id', { unique: false });
        }
        if (!txnStore.indexNames.contains('created_at')) {
          txnStore.createIndex('created_at', 'created_at', { unique: false });
        }
      }

      // 2. Pending Mutations Store (Outbox)
      let mutationStore: IDBObjectStore;
      if (!db.objectStoreNames.contains('pending_mutations')) {
        mutationStore = db.createObjectStore('pending_mutations', { keyPath: 'id' });
        mutationStore.createIndex('user_id', 'userId', { unique: false });
        mutationStore.createIndex('createdAt', 'createdAt', { unique: false });
        mutationStore.createIndex('status', 'status', { unique: false });
      } else if (tx) {
        mutationStore = tx.objectStore('pending_mutations');
        if (!mutationStore.indexNames.contains('user_id')) {
          mutationStore.createIndex('user_id', 'userId', { unique: false });
        }
        if (!mutationStore.indexNames.contains('createdAt')) {
          mutationStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!mutationStore.indexNames.contains('status')) {
          mutationStore.createIndex('status', 'status', { unique: false });
        }
      }

      // 3. Balances Store
      if (!db.objectStoreNames.contains('balances')) {
        db.createObjectStore('balances', { keyPath: 'key' });
      }

      // 4. Categories Store
      if (!db.objectStoreNames.contains('categories')) {
        const catStore = db.createObjectStore('categories', { keyPath: 'id' });
        catStore.createIndex('user_id', 'user_id', { unique: false });
      }

      // 5. Dashboard Summary Cache
      if (!db.objectStoreNames.contains('dashboard_cache')) {
        db.createObjectStore('dashboard_cache', { keyPath: 'key' });
      }

      // 6. Sync Metadata Store
      if (!db.objectStoreNames.contains('sync_meta')) {
        db.createObjectStore('sync_meta', { keyPath: 'key' });
      }

      // v4 adds snapshot completeness; v5 adds user-scoped people cache stores.
      if (!db.objectStoreNames.contains('people')) {
        const people = db.createObjectStore('people', { keyPath: 'id' });
        people.createIndex('user_id', 'user_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('person_details')) {
        const details = db.createObjectStore('person_details', { keyPath: 'key' });
        details.createIndex('user_id', 'user_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('pwa_users')) db.createObjectStore('pwa_users', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('pwa_context')) db.createObjectStore('pwa_context', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('statement_import_batches')) {
        const batches = db.createObjectStore('statement_import_batches', { keyPath: 'id' });
        batches.createIndex('user_id', 'user_id', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveStatementImportBatch(batch: StatementImportBatch): Promise<void> {
  if (!batch.user_id) throw new Error('A signed-in user is required to save import history.');
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('statement_import_batches', 'readwrite');
    tx.objectStore('statement_import_batches').put(batch);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not save statement import history.'));
  });
}

export async function getStatementImportBatches(userId: string): Promise<StatementImportBatch[]> {
  if (!userId) return [];
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const request = db.transaction('statement_import_batches', 'readonly').objectStore('statement_import_batches').index('user_id').getAll(userId);
      request.onsuccess = () => resolve((request.result as StatementImportBatch[]).filter((item) => item.user_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at)));
      request.onerror = () => resolve([]);
    });
  } catch { return []; }
}

export async function setCachedPwaUser(user: CachedPwaUser): Promise<void> {
  if (!user.id) return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['pwa_users', 'pwa_context'], 'readwrite');
    tx.objectStore('pwa_users').put(user);
    tx.objectStore('pwa_context').put({ key: 'current', userId: user.id });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not save the local PWA account context.'));
  });
}

export async function getCachedPwaUser(): Promise<CachedPwaUser | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(['pwa_users', 'pwa_context'], 'readonly');
      const contextReq = tx.objectStore('pwa_context').get('current');
      contextReq.onsuccess = () => {
        const userId = contextReq.result?.userId as string | undefined;
        if (!userId) { resolve(null); return; }
        const userReq = tx.objectStore('pwa_users').get(userId);
        userReq.onsuccess = () => resolve((userReq.result as CachedPwaUser | undefined) || null);
        userReq.onerror = () => resolve(null);
      };
      contextReq.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export async function clearCachedPwaUserContext(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction('pwa_context', 'readwrite');
      tx.objectStore('pwa_context').delete('current');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* preserve the outbox; clearing the active account pointer is best effort */ }
}

export async function getCachedPeople(userId: string): Promise<PersonDTO[]> {
  if (!userId) return [];
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const req = db.transaction('people', 'readonly').objectStore('people').index('user_id').getAll(userId);
      req.onsuccess = () => resolve((req.result || []).filter((person: PersonDTO & { user_id?: string }) => person.user_id === userId));
      req.onerror = () => resolve([]);
    });
  } catch { return []; }
}

export async function setCachedPeople(userId: string, people: PersonDTO[]): Promise<void> {
  if (!userId) return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('people', 'readwrite');
    const store = tx.objectStore('people');
    const req = store.index('user_id').getAllKeys(userId);
    req.onsuccess = () => { for (const key of req.result) store.delete(key); for (const person of people) store.put({ ...person, user_id: userId }); };
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedPersonDetail(userId: string, personId: string): Promise<PersonDetailDTO | null> {
  if (!userId || !personId) return null;
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const req = db.transaction('person_details', 'readonly').objectStore('person_details').get(`${userId}:${personId}`);
      req.onsuccess = () => resolve(req.result?.user_id === userId ? req.result.data as PersonDetailDTO : null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export async function setCachedPersonDetail(userId: string, personId: string, detail: PersonDetailDTO): Promise<void> {
  if (!userId || !personId) return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('person_details', 'readwrite');
    tx.objectStore('person_details').put({ key: `${userId}:${personId}`, user_id: userId, data: detail });
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
}

// -------------------------------------------------------------
// Transactions Cache (User-Scoped)
// -------------------------------------------------------------

export async function getCachedTransactions(userId: string): Promise<OfflineTransactionDTO[]> {
  if (!userId) return [];
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('transactions', 'readonly');
      const store = tx.objectStore('transactions');

      const processResults = (raw: OfflineTransactionDTO[]) => {
        const filtered = raw.filter((t) => t.user_id === userId && !t.deleted_locally);
        // Canonical deterministic newest-first ordering:
        // 1. transaction_date DESC
        // 2. recorded_at DESC
        // 3. created_at DESC
        // 4. Transaction ID DESC (stable tie-breaker)
        filtered.sort((a, b) => {
          if (a.transaction_date !== b.transaction_date) {
            return b.transaction_date.localeCompare(a.transaction_date);
          }
          const recA = a.recorded_at || a.created_at || '';
          const recB = b.recorded_at || b.created_at || '';
          if (recA !== recB) {
            return recB.localeCompare(recA);
          }
          const crA = a.created_at || '';
          const crB = b.created_at || '';
          if (crA !== crB) {
            return crB.localeCompare(crA);
          }
          return (b.id || '').localeCompare(a.id || '');
        });
        resolve(filtered);
      };

      if (store.indexNames.contains('user_id')) {
        const index = store.index('user_id');
        const req = index.getAll(userId);
        req.onsuccess = () => processResults((req.result || []) as OfflineTransactionDTO[]);
        req.onerror = () => resolve([]);
      } else {
        const req = store.getAll();
        req.onsuccess = () => processResults((req.result || []) as OfflineTransactionDTO[]);
        req.onerror = () => resolve([]);
      }
    });
  } catch {
    return [];
  }
}

export async function getCachedTransactionById(
  id: string,
  userId: string
): Promise<OfflineTransactionDTO | null> {
  if (!userId) return null;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('transactions', 'readonly');
      const store = tx.objectStore('transactions');
      const req = store.get(id);
      req.onsuccess = () => {
        const record = req.result as OfflineTransactionDTO | undefined;
        if (!record || record.deleted_locally) {
          resolve(null);
          return;
        }
        if (record.user_id !== userId) {
          resolve(null);
          return;
        }
        resolve(record);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveCachedTransactions(
  txns: TransactionDTO[],
  userId: string
): Promise<void> {
  if (!userId) throw new Error('A signed-in user is required to cache transactions.');
  {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('transactions', 'readwrite');
      const store = tx.objectStore('transactions');
      for (const t of txns) {
        const offlineRecord: OfflineTransactionDTO = {
          ...t,
          user_id: userId,
          sync_status: (t as OfflineTransactionDTO).sync_status || 'synced',
          deleted_locally: false,
        };
        store.put(offlineRecord);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not persist transactions locally.'));
    });
  }
}

/** Replace a complete server snapshot while retaining queued local edits and deletes. */
export async function replaceCachedTransactions(txns: TransactionDTO[], userId: string): Promise<void> {
  if (!userId) throw new Error('A signed-in user is required to replace transactions.');
  const db = await openDB();
  const pending = await getPendingMutations(userId);
  const pendingIds = new Set(pending.map((item) => item.entityId));
  const existing = await new Promise<OfflineTransactionDTO[]>((resolve, reject) => {
    const tx = db.transaction('transactions', 'readonly');
    const req = tx.objectStore('transactions').index('user_id').getAll(userId);
    req.onsuccess = () => resolve(req.result as OfflineTransactionDTO[]);
    req.onerror = () => reject(req.error);
  });
  return new Promise((resolve, reject) => {
    const tx = db.transaction('transactions', 'readwrite');
    const store = tx.objectStore('transactions');
    for (const item of existing) if (!pendingIds.has(item.id)) store.delete(item.id);
    for (const item of txns) if (!pendingIds.has(item.id)) store.put({ ...item, user_id: userId, sync_status: 'synced', deleted_locally: false });
    for (const item of existing) if (pendingIds.has(item.id)) store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not replace local transaction snapshot.'));
  });
}

export async function saveCachedTransaction(
  txn: TransactionDTO,
  userId: string,
  syncStatus: 'synced' | 'pending' | 'failed' = 'synced'
): Promise<void> {
  if (!userId) throw new Error('A signed-in user is required to cache transactions.');
  {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('transactions', 'readwrite');
      const store = tx.objectStore('transactions');
      const offlineRecord: OfflineTransactionDTO = {
        ...txn,
        user_id: userId,
        sync_status: syncStatus,
        deleted_locally: false,
      };
      store.put(offlineRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not persist a transaction locally.'));
    });
  }
}

export async function markCachedTransactionDeleted(
  id: string,
  userId: string
): Promise<void> {
  if (!userId) throw new Error('A signed-in user is required to delete a cached transaction.');
  {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('transactions', 'readwrite');
      const store = tx.objectStore('transactions');
      const req = store.get(id);
      req.onsuccess = () => {
        const record = req.result as OfflineTransactionDTO | undefined;
        if (record) {
          if (record.user_id !== userId) {
            resolve();
            return;
          }
          record.deleted_locally = true;
          record.sync_status = 'pending';
          store.put(record);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not mark the transaction deleted locally.'));
    });
  }
}

export async function deleteCachedTransactionPermanently(id: string, userId: string): Promise<void> {
  if (!userId) throw new Error('A signed-in user is required to remove a cached transaction.');
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('transactions', 'readwrite');
      const store = tx.objectStore('transactions');
      const req = store.get(id);
      req.onsuccess = () => {
        const record = req.result as OfflineTransactionDTO | undefined;
        if (record?.user_id === userId) store.delete(id);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not remove the cached transaction.'));
    });
  } catch (error) {
    throw error;
  }
}

// -------------------------------------------------------------
// Durable Pending Mutations Queue (User-Scoped Outbox)
// -------------------------------------------------------------

export async function enqueuePendingMutation(
  mutation: Omit<PendingMutation, 'createdAt' | 'attempts' | 'status'> & {
    createdAt?: number;
    attempts?: number;
    status?: 'pending' | 'syncing' | 'failed';
  }
): Promise<void> {
  if (!mutation.userId) throw new Error('A signed-in user is required to queue a change.');
  {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending_mutations', 'readwrite');
      const store = tx.objectStore('pending_mutations');
      const record: PendingMutation = {
        id: mutation.id,
        entityId: mutation.entityId,
        userId: mutation.userId,
        type: mutation.type,
        payload: mutation.payload,
        createdAt: mutation.createdAt || Date.now(),
        attempts: mutation.attempts || 0,
        status: mutation.status || 'pending',
        lastAttemptAt: null,
        lastError: null,
      };
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not queue this change locally.'));
    });
  }
}

export async function getPendingMutations(userId: string): Promise<PendingMutation[]> {
  if (!userId) return [];
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('pending_mutations', 'readonly');
      const store = tx.objectStore('pending_mutations');

      const req = store.getAll();
      req.onsuccess = () => {
        let results = (req.result || []) as PendingMutation[];
        results = results.filter((m) => m.userId === userId);
        // Sort in deterministic chronological creation order
        results.sort((a, b) => a.createdAt - b.createdAt);
        resolve(results);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function updatePendingMutation(
  id: string,
  updates: Partial<PendingMutation>
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('pending_mutations', 'readwrite');
      const store = tx.objectStore('pending_mutations');
      const req = store.get(id);
      req.onsuccess = () => {
        const item = req.result as PendingMutation | undefined;
        if (item) {
          Object.assign(item, updates);
          store.put(item);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Gracefully ignore local caching errors
  }
}

export async function removePendingMutation(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('pending_mutations', 'readwrite');
      const store = tx.objectStore('pending_mutations');
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Gracefully ignore local caching errors
  }
}

// -------------------------------------------------------------
// Account Balances Cache (User-Scoped)
// -------------------------------------------------------------

function balanceKey(userId: string): string {
  return `${userId}:balances`;
}

export async function getCachedBalances(userId: string): Promise<AccountBalancesDTO | null> {
  if (!userId) return null;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('balances', 'readonly');
      const store = tx.objectStore('balances');

      const key = balanceKey(userId);
      const req = store.get(key);
      req.onsuccess = () => {
        resolve(req.result?.data || null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedBalances(
  balances: AccountBalancesDTO,
  userId: string
): Promise<void> {
  if (!userId) throw new Error('A signed-in user is required to cache balances.');
  {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['balances', 'sync_meta'], 'readwrite');
      const store = tx.objectStore('balances');
      store.put({ key: balanceKey(userId), data: balances, updatedAt: Date.now() });

      const metaStore = tx.objectStore('sync_meta');
      const metaReq = metaStore.get(userId);
      metaReq.onsuccess = () => {
        const existing = metaReq.result?.data || {};
        metaStore.put({
          key: userId,
          data: { ...existing, balancesCachedAt: Date.now() },
          updatedAt: Date.now(),
        });
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not persist balances locally.'));
    });
  }
}

// -------------------------------------------------------------
// Atomic Multi-Store Persistence Operations
// -------------------------------------------------------------

export interface AtomicTransactionCreationParams {
  transaction: OfflineTransactionDTO;
  mutation: PendingMutation;
  userId: string;
}

export async function saveTransactionCreationAtomic({
  transaction,
  mutation,
  userId,
}: AtomicTransactionCreationParams): Promise<void> {
  if (!userId) throw new Error('A signed-in user is required.');
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['transactions', 'pending_mutations', 'balances', 'sync_meta'], 'readwrite');
    const txnStore = tx.objectStore('transactions');
    const mutationStore = tx.objectStore('pending_mutations');
    const balanceStore = tx.objectStore('balances');

    // 1. Put transaction in local transactions store (pending sync status)
    txnStore.put(transaction);

    // 2. Enqueue mutation in pending_mutations outbox store
    mutationStore.put(mutation);

    // 3. Apply local balance adjustment atomically
    const bKey = balanceKey(userId);
    const balReq = balanceStore.get(bKey);
    balReq.onsuccess = () => {
      const balances = balReq.result?.data as AccountBalancesDTO | undefined;
      if (balances) {
        const txnRecordedAt = transaction.recorded_at || transaction.created_at;
        if (!balances.balances_configured_at || txnRecordedAt > balances.balances_configured_at) {
          const delta = transaction.type === 'income' ? transaction.amount_paise : -transaction.amount_paise;
          const isCash = transaction.payment_method === 'cash';
          const newCash = isCash ? balances.current_cash_paise + delta : balances.current_cash_paise;
          const newOnline = !isCash ? balances.current_online_paise + delta : balances.current_online_paise;
          const newTotal = newCash + newOnline;

          const updatedBalances: AccountBalancesDTO = {
            ...balances,
            current_cash_paise: newCash,
            current_online_paise: newOnline,
            total_available_paise: newTotal,
            formatted_current_cash: formatPaiseToINR(newCash),
            formatted_current_online: formatPaiseToINR(newOnline),
            formatted_total_available: formatPaiseToINR(newTotal),
          };
          balanceStore.put({ key: bKey, data: updatedBalances, updatedAt: Date.now() });
        }
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Atomic transaction persistence failed.'));
    tx.onabort = () => reject(tx.error || new Error('Atomic transaction persistence aborted.'));
  });
}

export interface AtomicTransactionDeletionParams {
  id: string;
  mutation: PendingMutation;
  userId: string;
  existingTransaction?: OfflineTransactionDTO | null;
}

export async function saveTransactionDeletionAtomic({
  id,
  mutation,
  userId,
  existingTransaction,
}: AtomicTransactionDeletionParams): Promise<void> {
  if (!userId) throw new Error('A signed-in user is required.');
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['transactions', 'pending_mutations', 'balances', 'sync_meta'], 'readwrite');
    const txnStore = tx.objectStore('transactions');
    const mutationStore = tx.objectStore('pending_mutations');
    const balanceStore = tx.objectStore('balances');

    const req = txnStore.get(id);
    req.onsuccess = () => {
      const record = req.result as OfflineTransactionDTO | undefined;
      if (record && record.user_id === userId) {
        record.deleted_locally = true;
        record.sync_status = 'pending';
        txnStore.put(record);
      }
    };

    mutationStore.put(mutation);

    if (existingTransaction) {
      const bKey = balanceKey(userId);
      const balReq = balanceStore.get(bKey);
      balReq.onsuccess = () => {
        const balances = balReq.result?.data as AccountBalancesDTO | undefined;
        if (balances) {
          const txnRecordedAt = existingTransaction.recorded_at || existingTransaction.created_at;
          if (!balances.balances_configured_at || txnRecordedAt > balances.balances_configured_at) {
            const reverseDelta =
              existingTransaction.type === 'income'
                ? -existingTransaction.amount_paise
                : existingTransaction.amount_paise;
            const isCash = existingTransaction.payment_method === 'cash';
            const newCash = isCash ? balances.current_cash_paise + reverseDelta : balances.current_cash_paise;
            const newOnline = !isCash ? balances.current_online_paise + reverseDelta : balances.current_online_paise;
            const newTotal = newCash + newOnline;

            const updatedBalances: AccountBalancesDTO = {
              ...balances,
              current_cash_paise: newCash,
              current_online_paise: newOnline,
              total_available_paise: newTotal,
              formatted_current_cash: formatPaiseToINR(newCash),
              formatted_current_online: formatPaiseToINR(newOnline),
              formatted_total_available: formatPaiseToINR(newTotal),
            };
            balanceStore.put({ key: bKey, data: updatedBalances, updatedAt: Date.now() });
          }
        }
      };
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Atomic transaction deletion failed.'));
    tx.onabort = () => reject(tx.error || new Error('Atomic transaction deletion aborted.'));
  });
}

export interface AtomicStartingBalancesParams {
  balances: AccountBalancesDTO;
  mutation: PendingMutation;
  userId: string;
}

export async function saveStartingBalancesAtomic({
  balances,
  mutation,
  userId,
}: AtomicStartingBalancesParams): Promise<void> {
  if (!userId) throw new Error('A signed-in user is required.');
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['pending_mutations', 'balances', 'sync_meta'], 'readwrite');
    const mutationStore = tx.objectStore('pending_mutations');
    const balanceStore = tx.objectStore('balances');

    balanceStore.put({ key: balanceKey(userId), data: balances, updatedAt: Date.now() });
    mutationStore.put(mutation);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Atomic starting balances configuration failed.'));
    tx.onabort = () => reject(tx.error || new Error('Atomic starting balances configuration aborted.'));
  });
}

// -------------------------------------------------------------
// Categories Cache (User-Scoped)
// -------------------------------------------------------------

export async function getCachedCategories(userId: string): Promise<CategoryDTO[]> {
  if (!userId) return [];
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('categories', 'readonly');
      const store = tx.objectStore('categories');

      if (store.indexNames.contains('user_id')) {
        const index = store.index('user_id');
        const req = index.getAll(userId);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } else {
        const req = store.getAll();
        req.onsuccess = () => {
          const results = (req.result || []) as (CategoryDTO & { user_id?: string })[];
          resolve(results.filter((c) => c.user_id === userId));
        };
        req.onerror = () => resolve([]);
      }
    });
  } catch {
    return [];
  }
}

export async function setCachedCategories(
  categories: CategoryDTO[],
  userId: string
): Promise<void> {
  if (!userId) throw new Error('A signed-in user is required to cache categories.');
  {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('categories', 'readwrite');
      const store = tx.objectStore('categories');
      for (const c of categories) {
        store.put({ ...c, user_id: userId });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Could not persist categories locally.'));
    });
  }
}

// -------------------------------------------------------------
// Sync Metadata (User-Scoped)
// -------------------------------------------------------------

export async function getSyncMeta(userId: string): Promise<SyncMetadata> {
  const fallback: SyncMetadata = {
    lastSyncedAt: null,
    lastError: null,
    transactionsSnapshotComplete: false,
    categoriesSnapshotComplete: false,
    balancesCachedAt: null,
  };
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('sync_meta', 'readonly');
      const store = tx.objectStore('sync_meta');
      const req = store.get(userId);
      req.onsuccess = () => resolve({ ...fallback, ...(req.result?.data || {}) });
      req.onerror = () => resolve(fallback);
    });
  } catch {
    return fallback;
  }
}

export async function setSyncMeta(
  userId: string,
  meta: Partial<SyncMetadata>
): Promise<void> {
  try {
    const db = await openDB();
    const existing = await getSyncMeta(userId);
    return new Promise((resolve) => {
      const tx = db.transaction('sync_meta', 'readwrite');
      const store = tx.objectStore('sync_meta');
      store.put({
        key: userId,
        data: { ...existing, ...meta },
        updatedAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Gracefully ignore
  }
}

// -------------------------------------------------------------
// Dashboard Summary Cache
// -------------------------------------------------------------

export async function getCachedDashboardSummary(
  userId: string,
  key: string
): Promise<DashboardSummaryResponse | null> {
  if (!userId) return null;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('dashboard_cache', 'readonly');
      const store = tx.objectStore('dashboard_cache');
      const req = store.get(`${userId}:${key}`);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedDashboardSummary(
  userId: string,
  key: string,
  summary: DashboardSummaryResponse
): Promise<void> {
  if (!userId) return;
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('dashboard_cache', 'readwrite');
      const store = tx.objectStore('dashboard_cache');
      store.put({ key: `${userId}:${key}`, data: summary, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Gracefully ignore local caching errors
  }
}

// -------------------------------------------------------------
// Clear User Offline Data (Isolation on Logout/Switch)
// -------------------------------------------------------------

export async function clearUserOfflineData(userId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(
      ['transactions', 'pending_mutations', 'balances', 'categories', 'dashboard_cache', 'sync_meta', 'people', 'person_details', 'pwa_users', 'pwa_context'],
      'readwrite'
    );

    // Delete user transactions
    const txnStore = tx.objectStore('transactions');
    if (txnStore.indexNames.contains('user_id')) {
      const index = txnStore.index('user_id');
      const req = index.getAllKeys(userId);
      req.onsuccess = () => {
        for (const key of req.result) {
          txnStore.delete(key);
        }
      };
    }

    // Delete user pending mutations
    const mutStore = tx.objectStore('pending_mutations');
    const reqMut = mutStore.getAll();
    reqMut.onsuccess = () => {
      for (const mut of (reqMut.result || []) as PendingMutation[]) {
        if (mut.userId === userId) {
          mutStore.delete(mut.id);
        }
      }
    };

    // Delete user balances & meta
    tx.objectStore('balances').delete(balanceKey(userId));
    const categories = tx.objectStore('categories');
    const catReq = categories.index('user_id').getAllKeys(userId);
    catReq.onsuccess = () => { for (const key of catReq.result) categories.delete(key); };
    const dashboards = tx.objectStore('dashboard_cache');
    const dashboardReq = dashboards.getAllKeys();
    dashboardReq.onsuccess = () => { for (const key of dashboardReq.result) if (String(key).startsWith(`${userId}:`)) dashboards.delete(key); };
    const people = tx.objectStore('people');
    const peopleKeys = people.index('user_id').getAllKeys(userId);
    peopleKeys.onsuccess = () => { for (const key of peopleKeys.result) people.delete(key); };
    const details = tx.objectStore('person_details');
    const detailKeys = details.index('user_id').getAllKeys(userId);
    detailKeys.onsuccess = () => { for (const key of detailKeys.result) details.delete(key); };
    tx.objectStore('pwa_users').delete(userId);
    const contextStore = tx.objectStore('pwa_context');
    const contextReq = contextStore.get('current');
    contextReq.onsuccess = () => { if (contextReq.result?.userId === userId) contextStore.delete('current'); };
    tx.objectStore('sync_meta').delete(userId);
  } catch {
    // Best effort
  }
}
