/**
 * IndexedDB storage for ciphertext blobs and the vault record.
 *
 * Two object stores:
 *   blobs  — keyed by container id, holds the raw AEGS bytes
 *   meta   — single record holding the vault descriptor (salt, wrapped key, verifier)
 *
 * Nothing stored here is ever plaintext file content or a readable file name.
 * The vault index itself is encrypted and lives in `blobs` like any other payload.
 */

const DB_NAME = 'aegis-vault';
const DB_VERSION = 1;
const STORE_BLOBS = 'blobs';
const STORE_META = 'meta';
const META_KEY = 'vault';

let dbPromise = null;

export class StorageError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'StorageError';
    this.cause = cause;
  }
}

function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_BLOBS)) db.createObjectStore(STORE_BLOBS);
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new StorageError('Could not open local storage. Private browsing may be blocking it.', request.error));
  });

  return dbPromise;
}

function runTransaction(storeNames, mode, work) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeNames, mode);
        let result;

        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(new StorageError('A storage operation failed.', transaction.error));
        transaction.onabort = () => reject(new StorageError('A storage operation was aborted.', transaction.error));

        try {
          result = work(transaction);
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      }),
  );
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new StorageError('A storage request failed.', request.error));
  });
}

export const blobStore = {
  async put(id, bytes) {
    return runTransaction(STORE_BLOBS, 'readwrite', (tx) => tx.objectStore(STORE_BLOBS).put(bytes, id));
  },

  async get(id) {
    return runTransaction(STORE_BLOBS, 'readonly', (tx) => requestToPromise(tx.objectStore(STORE_BLOBS).get(id)));
  },

  async remove(id) {
    return runTransaction(STORE_BLOBS, 'readwrite', (tx) => tx.objectStore(STORE_BLOBS).delete(id));
  },

  async keys() {
    const keys = await runTransaction(STORE_BLOBS, 'readonly', (tx) => requestToPromise(tx.objectStore(STORE_BLOBS).getAllKeys()));
    return keys ?? [];
  },

  async clear() {
    return runTransaction(STORE_BLOBS, 'readwrite', (tx) => tx.objectStore(STORE_BLOBS).clear());
  },
};

export const metaStore = {
  async get() {
    const value = await runTransaction(STORE_META, 'readonly', (tx) => requestToPromise(tx.objectStore(STORE_META).get(META_KEY)));
    return value ?? null;
  },

  async put(value) {
    return runTransaction(STORE_META, 'readwrite', (tx) => tx.objectStore(STORE_META).put(value, META_KEY));
  },

  async clear() {
    return runTransaction(STORE_META, 'readwrite', (tx) => tx.objectStore(STORE_META).clear());
  },
};

/** Wipe the entire vault: both stores, and drop the cached connection. */
export async function destroyDatabase() {
  const db = await openDatabase();
  db.close();
  dbPromise = null;

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new StorageError('Could not delete the local database.', request.error));
    request.onblocked = () => resolve();
  });
}

/** Ask the browser how much room is left, so the UI can warn before a failure. */
export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota, ratio: quota ? usage / quota : 0 };
}

export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

export async function isPersisted() {
  if (!navigator.storage?.persisted) return false;
  return navigator.storage.persisted();
}
