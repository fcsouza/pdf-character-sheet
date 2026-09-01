/**
 * Local cache of PDF bytes, so a book fetched once opens instantly after.
 *
 * IndexedDB rather than the Cache API: pruning needs to know how many bytes
 * each entry costs, and the Cache API does not say.
 *
 * Two stores. `bytes` holds the file. `meta` holds size and last-access time,
 * which is all pruning reads — so deciding what to evict never loads a single
 * PDF into memory. The v10 version kept them together and read whole files to
 * sort them.
 */
const DB_NAME = 'pdf-character-sheet';
const DB_VERSION = 1;
const BYTES = 'bytes';
const META = 'meta';

interface Meta {
  url: string;
  size: number;
  lastRead: number;
}

let db: IDBDatabase | undefined;

function open(): Promise<IDBDatabase> {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(BYTES)) database.createObjectStore(BYTES);
      if (!database.objectStoreNames.contains(META)) database.createObjectStore(META);
    };
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
}

/** Promise wrapper over a single-store transaction. */
function run<T>(store: string, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>) {
  return open().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const request = op(database.transaction(store, mode).objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export async function read(url: string): Promise<Uint8Array | undefined> {
  try {
    const bytes = await run<Uint8Array | undefined>(BYTES, 'readonly', (s) => s.get(url));
    if (!bytes) return undefined;
    const meta = await run<Meta | undefined>(META, 'readonly', (s) => s.get(url));
    if (meta) await run(META, 'readwrite', (s) => s.put({ ...meta, lastRead: Date.now() }, url));
    return bytes;
  } catch {
    // A cache miss and a broken cache should look the same to the caller:
    // both mean "fetch it".
    return undefined;
  }
}

export async function write(url: string, bytes: Uint8Array, maxBytes: number): Promise<void> {
  try {
    await run(BYTES, 'readwrite', (s) => s.put(bytes, url));
    await run(META, 'readwrite', (s) =>
      s.put({ url, size: bytes.byteLength, lastRead: Date.now() } satisfies Meta, url),
    );
    await prune(maxBytes);
  } catch {
    // Caching is an optimisation. Failing to cache must not fail the read.
  }
}

/** Drop least-recently-read entries until the total fits the budget. */
export async function prune(maxBytes: number): Promise<void> {
  const all = await run<Meta[]>(META, 'readonly', (s) => s.getAll());
  let total = all.reduce((sum, m) => sum + m.size, 0);
  if (total <= maxBytes) return;

  for (const entry of [...all].sort((a, b) => a.lastRead - b.lastRead)) {
    if (total <= maxBytes) break;
    await run(BYTES, 'readwrite', (s) => s.delete(entry.url));
    await run(META, 'readwrite', (s) => s.delete(entry.url));
    total -= entry.size;
  }
}

export async function purge(): Promise<void> {
  await run(BYTES, 'readwrite', (s) => s.clear());
  await run(META, 'readwrite', (s) => s.clear());
}

/** Total bytes held, for the settings display. */
export async function size(): Promise<number> {
  const all = await run<Meta[]>(META, 'readonly', (s) => s.getAll());
  return all.reduce((sum, m) => sum + m.size, 0);
}

/** Fetch through the cache. */
export async function fetchPdf(url: string, maxBytes: number): Promise<Uint8Array> {
  const cached = await read(url);
  if (cached) return cached;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch ${url}: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await write(url, bytes, maxBytes);
  return bytes;
}
