import type {
  TransactionDTO,
  AccountBalancesDTO,
  CreateTransactionRequest,
  CreateTransferRequest,
  CreateAdjustmentRequest,
} from '@arth/contracts';

const DB_NAME = 'arth_offline_db';
const DB_VERSION = 1;

export interface PendingMutation {
  id: string; // Transaction or Movement UUID
  type: 'create_transaction' | 'create_transfer' | 'create_adjustment';
  payload: CreateTransactionRequest | CreateTransferRequest | CreateAdjustmentRequest;
  createdAt: number;
  attempts: number;
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

      if (!db.objectStoreNames.contains('transactions')) {
        db.createObjectStore('transactions', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('pending_mutations')) {
        db.createObjectStore('pending_mutations', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('balances')) {
        db.createObjectStore('balances', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// -------------------------------------------------------------
// Balances Cache
// -------------------------------------------------------------

export async function getCachedBalances(): Promise<AccountBalancesDTO | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('balances', 'readonly');
      const store = tx.objectStore('balances');
      const req = store.get('current');
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedBalances(balances: AccountBalancesDTO): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('balances', 'readwrite');
      const store = tx.objectStore('balances');
      store.put({ key: 'current', data: balances, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Gracefully ignore local caching errors
  }
}

// -------------------------------------------------------------
// Transactions Cache
// -------------------------------------------------------------

export async function getCachedTransactions(): Promise<TransactionDTO[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('transactions', 'readonly');
      const store = tx.objectStore('transactions');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function saveCachedTransactions(txns: TransactionDTO[]): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('transactions', 'readwrite');
      const store = tx.objectStore('transactions');
      for (const t of txns) {
        store.put(t);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Gracefully ignore local caching errors
  }
}

export async function saveCachedTransaction(txn: TransactionDTO): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('transactions', 'readwrite');
      const store = tx.objectStore('transactions');
      store.put(txn);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Gracefully ignore local caching errors
  }
}

// -------------------------------------------------------------
// Pending Mutations Queue (Outbox)
// -------------------------------------------------------------

export async function enqueuePendingMutation(
  mutation: Omit<PendingMutation, 'createdAt' | 'attempts'>
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('pending_mutations', 'readwrite');
      const store = tx.objectStore('pending_mutations');
      store.put({
        ...mutation,
        createdAt: Date.now(),
        attempts: 0,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Gracefully ignore local caching errors
  }
}

export async function getPendingMutations(): Promise<PendingMutation[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('pending_mutations', 'readonly');
      const store = tx.objectStore('pending_mutations');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
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
