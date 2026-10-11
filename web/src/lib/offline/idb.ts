/**
 * Minimal promise wrapper over IndexedDB for the family area's offline data:
 *  - `outbox`: check-ins not yet stored by the server (key: clientId)
 *  - `meta`: small cached documents such as the rule bundle and the last session
 *
 * Browser only. Everything throws {@link StorageUnavailableError} when the
 * device has no IndexedDB (some private modes), so callers can fall back to
 * sending directly.
 */

export const DB_NAME = "tuntas-family";
export const DB_VERSION = 1;
export type StoreName = "outbox" | "meta";

export class StorageUnavailableError extends Error {
  constructor() {
    super("IndexedDB is not available on this device");
    this.name = "StorageUnavailableError";
  }
}

let connection: Promise<IDBDatabase> | undefined;

export function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new StorageUnavailableError());
  connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "clientId" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgrading or the browser reclaiming storage: reopen on next use.
      db.onclose = () => {
        connection = undefined;
      };
      db.onversionchange = () => {
        db.close();
        connection = undefined;
      };
      resolve(db);
    };
    request.onerror = () => {
      connection = undefined;
      reject(request.error ?? new StorageUnavailableError());
    };
  });
  return connection;
}

/** Closes the connection; the next call reopens it. Used to simulate a page reload in tests. */
export async function closeDb(): Promise<void> {
  if (!connection) return;
  const db = await connection;
  connection = undefined;
  db.close();
}

/** Runs one request in its own transaction and resolves with its result once the transaction commits. */
export async function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  make: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = make(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error ?? request.error);
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
  });
}
