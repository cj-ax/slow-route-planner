// Minimal promise wrapper over IndexedDB. Two stores:
//   kv   - cached public-land data and UI prefs (key -> value)
//   logs - field observations (see logs.ts for the schema)

const DB_NAME = "deer-scout";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("logs")) {
        const s = db.createObjectStore("logs", { keyPath: "id" });
        s.createIndex("observedAt", "observedAt");
        s.createIndex("propertyId", "propertyId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Test hook: forget the cached connection. */
export function _resetDbForTests(): void {
  dbPromise = null;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export const kvGet = <T>(key: string) => tx<T | undefined>("kv", "readonly", (s) => s.get(key));
export const kvSet = (key: string, value: unknown) => tx("kv", "readwrite", (s) => s.put(value, key));

export const logsAll = <T>() => tx<T[]>("logs", "readonly", (s) => s.getAll());
export const logPut = (log: unknown) => tx("logs", "readwrite", (s) => s.put(log));
export const logDelete = (id: string) => tx("logs", "readwrite", (s) => s.delete(id));
