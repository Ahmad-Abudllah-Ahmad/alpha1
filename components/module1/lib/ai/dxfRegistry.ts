/**
 * Store of raw DXF text keyed by floor id, used so exact re-extraction (local
 * and backend) still works after import without re-uploading.
 *
 * Small files are also saved on the floor itself (`rawSource`) and survive
 * reloads via the regular project JSON in localStorage. Large files (common
 * for DWG-converted or multi-view CAD sheets) skip that to avoid blowing the
 * localStorage quota — instead we keep them in an in-memory Map for
 * zero-latency access within the tab, backed by IndexedDB (much larger quota,
 * typically hundreds of MB+) so they also survive a page reload.
 */
const registry = new Map<string, string>();

const DB_NAME = "adicc-dxf-cache";
const STORE_NAME = "dxf";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE_NAME)) {
            req.result.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

async function idbGet(floorId: string): Promise<string | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(floorId);
      req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : undefined);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

async function idbSet(floorId: string, text: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(text, floorId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Registers DXF text for a floor. Returns immediately; IndexedDB persistence happens in the background. */
export function registerDxf(floorId: string, text: string): void {
  registry.set(floorId, text);
  void idbSet(floorId, text);
}

/**
 * Resolves DXF text for a floor: in-memory cache first (instant), then
 * IndexedDB (survives reloads), then the caller-provided fallback (the
 * floor's persisted `rawSource`, only present for small files).
 */
export async function getDxf(floorId: string, fallback?: string): Promise<string | undefined> {
  const cached = registry.get(floorId);
  if (cached) return cached;
  const fromDb = await idbGet(floorId);
  if (fromDb) {
    registry.set(floorId, fromDb);
    return fromDb;
  }
  return fallback;
}

export async function hasDxf(floorId: string, fallback?: string): Promise<boolean> {
  return (await getDxf(floorId, fallback)) !== undefined;
}
