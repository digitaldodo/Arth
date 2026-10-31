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
} from '@arth/contracts';

const DB_NAME = 'arth_offline_db';
const DB_VERSION = 3;

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
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// -------------------------------------------------------------
// Transactions Cache (User-Scoped)
// -------------------------------------------------------------

export async function getCachedTransactions(userId?: string): Promise<OfflineTransactionDTO[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('transactions', 'readonly');
      const store = tx.objectStore('transactions');

      if (userId && store.indexNames.contains('user_id')) {
        const index = store.index('user_id');
        const req = index.getAll(userId);
        req.onsuccess = () => {
          const results = (req.result || []) as OfflineTransactionDTO[];
          // Filter out locally deleted records
          resolve(results.filter((t) => !t.deleted_locally));
        };
        req.onerror = () => resolve([]);
      } else {
        const req = store.getAll();
        req.onsuccess = () => {
          const results = (req.result || []) as OfflineTransactionDTO[];
          resolve(
            results.filter(
              (t) => (!userId || !t.user_id || t.user_id === userId) && !t.deleted_locally
            )
          );
        };
        req.onerror = () => resolve([]);
      }
    });
  } catch {
    return [];
  }
}

export async function getCachedTransactionById(
  id: string,
  userId?: string
): Promise<OfflineTransactionDTO | null> {
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
        if (userId && record.user_id && record.user_id !== userId) {
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
  userId?: string
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('transactions', 'readwrite');
      const store = tx.objectStore('transactions');
      for (const t of txns) {
        const offlineRecord: OfflineTransactionDTO = {
          ...t,
          user_id: userId || (t as OfflineTransactionDTO).user_id,
          sync_status: (t as OfflineTransactionDTO).sync_status || 'synced',
          deleted_locally: false,
        };
        store.put(offlineRecord);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Gracefully ignore local caching errors
  }
}

export async function saveCachedTransaction(
  txn: TransactionDTO,
  userId?: string,
  syncStatus: 'synced' | 'pending' | 'failed' = 'synced'
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('transactions', 'readwrite');
      const store = tx.objectStore('transactions');
      const offlineRecord: OfflineTransactionDTO = {
        ...txn,
        user_id: userId || (txn as OfflineTransactionDTO).user_id,
        sync_status: syncStatus,
        deleted_locally: false,
      };
      store.put(offlineRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Gracefully ignore local caching errors
  }
}

export async function markCachedTransactionDeleted(
  id: string,
  userId?: string
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('transactions', 'readwrite');
      const store = tx.objectStore('transactions');
      const req = store.get(id);
      req.onsuccess = () => {
        const record = req.result as OfflineTransactionDTO | undefined;
        if (record) {
          if (userId && record.user_id && record.user_id !== userId) {
            resolve();
            return;
          }
          record.deleted_locally = true;
          record.sync_status = 'pending';
          store.put(record);
        }
        resolve();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Gracefully ignore local caching errors
  }
}

export async function deleteCachedTransactionPermanently(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('transactions', 'readwrite');
      const store = tx.objectStore('transactions');
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Gracefully ignore local caching errors
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
  try {
    const db = await openDB();
    return new Promise((resolve) => {
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
      tx.onerror = () => resolve();
    });
  } catch {
    // Gracefully ignore local caching errors
  }
}

export async function getPendingMutations(userId?: string): Promise<PendingMutation[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('pending_mutations', 'readonly');
      const store = tx.objectStore('pending_mutations');

      const req = store.getAll();
      req.onsuccess = () => {
        let results = (req.result || []) as PendingMutation[];
        if (userId) {
          results = results.filter((m) => !m.userId || m.userId === userId);
        }
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

function balanceKey(userId?: string): string {
  return userId ? `${userId}:balances` : 'current';
}

export async function getCachedBalances(userId?: string): Promise<AccountBalancesDTO | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('balances', 'readonly');
      const store = tx.objectStore('balances');

      // Attempt user-scoped key first, fall back to 'current'
      const key = balanceKey(userId);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result?.data) {
          resolve(req.result.data);
          return;
        }
        // Fallback for legacy cached data
        if (userId && key !== 'current') {
          const fallbackReq = store.get('current');
          fallbackReq.onsuccess = () => resolve(fallbackReq.result ? fallbackReq.result.data : null);
          fallbackReq.onerror = () => resolve(null);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedBalances(
  balances: AccountBalancesDTO,
  userId?: string
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('balances', 'readwrite');
      const store = tx.objectStore('balances');
      store.put({ key: balanceKey(userId), data: balances, updatedAt: Date.now() });
      if (userId) {
        // Also keep legacy 'current' updated for backward compatibility
        store.put({ key: 'current', data: balances, updatedAt: Date.now() });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Gracefully ignore local caching errors
  }
}

// -------------------------------------------------------------
// Categories Cache (User-Scoped)
// -------------------------------------------------------------

export async function getCachedCategories(userId?: string): Promise<CategoryDTO[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('categories', 'readonly');
      const store = tx.objectStore('categories');

      if (userId && store.indexNames.contains('user_id')) {
        const index = store.index('user_id');
        const req = index.getAll(userId);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } else {
        const req = store.getAll();
        req.onsuccess = () => {
          const results = (req.result || []) as (CategoryDTO & { user_id?: string })[];
          resolve(results.filter((c) => !userId || !c.user_id || c.user_id === userId));
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
  userId?: string
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('categories', 'readwrite');
      const store = tx.objectStore('categories');
      for (const c of categories) {
        store.put({ ...c, user_id: userId });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Gracefully ignore local caching errors
  }
}

// -------------------------------------------------------------
// Sync Metadata (User-Scoped)
// -------------------------------------------------------------

export async function getSyncMeta(userId: string): Promise<SyncMetadata> {
  const fallback: SyncMetadata = { lastSyncedAt: null, lastError: null };
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('sync_meta', 'readonly');
      const store = tx.objectStore('sync_meta');
      const req = store.get(userId);
      req.onsuccess = () => resolve(req.result?.data || fallback);
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
  key: string
): Promise<DashboardSummaryResponse | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('dashboard_cache', 'readonly');
      const store = tx.objectStore('dashboard_cache');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedDashboardSummary(
  key: string,
  summary: DashboardSummaryResponse
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('dashboard_cache', 'readwrite');
      const store = tx.objectStore('dashboard_cache');
      store.put({ key, data: summary, updatedAt: Date.now() });
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
      ['transactions', 'pending_mutations', 'balances', 'categories', 'sync_meta'],
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
    tx.objectStore('sync_meta').delete(userId);
  } catch {
    // Best effort
  }
}
