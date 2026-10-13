import { StoreProfile } from '../data/types';

export const DB_NAME = 'SlotAnalyzerDB';
export const DB_VERSION = 2; // Incremented from 1 to 2
export const STORE_NAME = 'stores';

/**
 * Opens the IndexedDB database with schema migration support
 */
export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;
      const tx = (event.target as IDBOpenDBRequest).transaction;

      let store: IDBObjectStore;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      } else if (tx) {
        store = tx.objectStore(STORE_NAME);
      } else {
        return;
      }

      // Migration to v2: create indices if they don't already exist
      if (oldVersion < 2) {
        if (!store.indexNames.contains('name')) {
          store.createIndex('name', 'name', { unique: false });
        }
        if (!store.indexNames.contains('updatedAt')) {
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      console.warn('IndexedDB upgrade blocked: please close other active tabs using this app');
    };
  });
}

/**
 * Puts a single store into IndexedDB and awaits transaction completion
 */
export function putStoreToIdb(store: StoreProfile): Promise<void> {
  return new Promise((resolve, reject) => {
    openDb()
      .then((db) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const objectStore = tx.objectStore(STORE_NAME);
        objectStore.put(store);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      })
      .catch(reject);
  });
}

/**
 * Deletes a single store from IndexedDB by ID and awaits transaction completion
 */
export function deleteStoreFromIdb(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    openDb()
      .then((db) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const objectStore = tx.objectStore(STORE_NAME);
        objectStore.delete(id);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      })
      .catch(reject);
  });
}

/**
 * Save stores to IndexedDB without destructive clear.
 * Updates/inserts current stores via put, and removes obsolete stores via delete.
 * Awaits tx.oncomplete.
 */
export function saveStoresToIdb(stores: StoreProfile[]): Promise<void> {
  return new Promise((resolve, reject) => {
    openDb()
      .then((db) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const objectStore = tx.objectStore(STORE_NAME);

        // Diff update: fetch existing keys, put active stores, delete removed stores
        const getKeysReq = objectStore.getAllKeys();
        getKeysReq.onsuccess = () => {
          const existingKeys = new Set<string>((getKeysReq.result as string[]) || []);
          const activeIds = new Set<string>();

          for (const s of stores) {
            if (s && s.id) {
              activeIds.add(s.id);
              objectStore.put(s);
            }
          }

          for (const oldKey of existingKeys) {
            if (!activeIds.has(oldKey)) {
              objectStore.delete(oldKey);
            }
          }
        };

        getKeysReq.onerror = () => {
          // If key retrieval fails, put stores directly
          for (const s of stores) {
            if (s && s.id) {
              objectStore.put(s);
            }
          }
        };

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      })
      .catch(reject);
  });
}

/**
 * Load all stores from IndexedDB
 */
export async function loadStoresFromIdb(): Promise<StoreProfile[] | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const results = req.result as StoreProfile[];
        resolve(Array.isArray(results) ? results : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB loadStoresFromIdb failed:', err);
    return null;
  }
}

/**
 * Clear all stores from IndexedDB and await tx.oncomplete
 */
export function clearStoresFromIdb(): Promise<void> {
  return new Promise((resolve, reject) => {
    openDb()
      .then((db) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      })
      .catch(reject);
  });
}
