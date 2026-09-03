import { persistedColorTraceSchema, type ColorTrace } from '@vcd/trace-model';

const DB_NAME = 'colortrace';
const DB_VERSION = 1;
const STORE = 'traces';

export type TraceHistory = {
  traces: ColorTrace[];
  invalidCount: number;
};

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Failed to open ColorTrace database'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'traceId' });
        store.createIndex('capturedAt', 'capturedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    request.onsuccess = () => resolve(request.result);
  });
}

export function transactionComplete(tx: IDBTransaction, failureMessage: string): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error(`${failureMessage} aborted`));
    tx.onerror = () => reject(tx.error ?? new Error(failureMessage));
  });
}

export function parsePersistedTraceHistory(raw: unknown[]): TraceHistory {
  const traces: ColorTrace[] = [];
  let invalidCount = 0;
  for (const entry of raw) {
    const parsed = persistedColorTraceSchema.safeParse(entry);
    if (parsed.success) traces.push(parsed.data);
    else invalidCount += 1;
  }
  traces.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  return { traces, invalidCount };
}

export async function saveTrace(trace: ColorTrace): Promise<void> {
  const safe = persistedColorTraceSchema.parse(trace);
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(safe);
    await transactionComplete(tx, 'Trace save failed');
  } finally {
    db.close();
  }
}

export async function listTraceHistory(): Promise<TraceHistory> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE, 'readonly');
    const rawPromise = requestResult(tx.objectStore(STORE).getAll());
    const completePromise = transactionComplete(tx, 'Trace history read failed');
    const [raw] = await Promise.all([rawPromise, completePromise]);
    return parsePersistedTraceHistory(raw);
  } finally {
    db.close();
  }
}

export async function listTraces(): Promise<ColorTrace[]> {
  return (await listTraceHistory()).traces;
}

export async function deleteTrace(traceId: string): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(traceId);
    await transactionComplete(tx, 'Trace deletion failed');
  } finally {
    db.close();
  }
}

export async function clearTraceHistory(): Promise<void> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await transactionComplete(tx, 'Trace history clear failed');
  } finally {
    db.close();
  }
}
