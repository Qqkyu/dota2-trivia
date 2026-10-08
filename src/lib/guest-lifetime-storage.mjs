import { readGuestLifetimeStats } from "./guest-accuracy.mjs";

const DATABASE_NAME = "queue-arcade-guest-v1";
const STORE_NAME = "state";
const RECORD_KEY = "lifetime";
const STATS_KEY = "queue-arcade:stats:v2";
const KEYS = [STATS_KEY, "queue-arcade:settled-rounds:v2", "queue-arcade:run-scores:v1"];
let databasePromise;
let unavailable = false;
let latestRevision = -1;
let fallbackValues;
let accessQueue = Promise.resolve();

function storageAdapter(values) {
  return {
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => {
      values[key] = String(value);
    },
  };
}

function importedValues(storage) {
  return Object.fromEntries(
    KEYS.map((key) => [
      key,
      storage.getItem(key) ?? (key === STATS_KEY ? storage.getItem("queue-trivia:stats:v1") : null),
    ]).filter(([, value]) => value !== null),
  );
}

function openDatabase() {
  if (unavailable) return Promise.reject(new Error("Guest persistence unavailable"));
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      let finished = false;
      const fail = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        unavailable = true;
        reject(new Error("Guest persistence unavailable"));
      };
      const timeout = setTimeout(fail, 2000);
      try {
        const request = indexedDB.open(DATABASE_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
        request.onblocked = fail;
        request.onerror = fail;
        request.onsuccess = () => {
          if (finished) {
            request.result.close();
            return;
          }
          finished = true;
          clearTimeout(timeout);
          request.result.onversionchange = () => request.result.close();
          resolve(request.result);
        };
      } catch {
        fail();
      }
    });
  }
  return databasePromise;
}

/**
 * IndexedDB serializes the entire read, modify, and write across renderer processes.
 * A Web Lock alone cannot make another renderer's localStorage cache current.
 * @template T
 * @param {{getItem: Function, setItem: Function}} storage
 * @param {(storage: {getItem: Function, setItem: Function}) => T} apply
 * @param {boolean} change
 * @returns {Promise<{value: T, current: boolean, persisted: boolean}>}
 */
async function accessLifetime(storage, apply, change) {
  let callbackError;
  let callbackFailed = false;
  try {
    const database = await openDatabase();
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(RECORD_KEY);
      let value;
      let revision;
      let committedValues;
      transaction.onerror = () => reject(transaction.error ?? new Error("Guest transaction failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Guest transaction aborted"));
      transaction.oncomplete = () => {
        const current = revision >= latestRevision;
        if (current) latestRevision = revision;
        fallbackValues = { ...committedValues };
        resolve({ value, current, persisted: true });
      };
      request.onsuccess = () => {
        try {
          const existing = request.result;
          const values = existing?.values ?? importedValues(storage);
          fallbackValues = { ...values };
          committedValues = values;
          revision = (existing?.revision ?? 0) + (change || !existing ? 1 : 0);
          try {
            value = apply(storageAdapter(values));
          } catch (error) {
            callbackError = error;
            callbackFailed = true;
            transaction.abort();
            return;
          }
          const mirror = () => {
            // Publish while this transaction still owns the store. A later transaction
            // must publish after this one, even when its UI callback arrives sooner.
            for (const key of KEYS) {
              if (values[key] !== undefined) storage.setItem(key, values[key]);
            }
          };
          if (change || !existing) {
            const write = store.put({ revision, values }, RECORD_KEY);
            write.onsuccess = mirror;
          } else {
            mirror();
          }
        } catch {
          transaction.abort();
        }
      };
    });
  } catch {
    if (callbackFailed) throw callbackError;
    // Without IndexedDB, retain this page's data only. Do not perform a shared
    // localStorage read-modify-write that could erase another tab's accepted vote.
    unavailable = true;
    fallbackValues ??= importedValues(storage);
    const nextValues = { ...fallbackValues };
    const value = apply(storageAdapter(nextValues));
    fallbackValues = nextValues;
    return { value, current: true, persisted: false };
  }
}

function queueAccess(storage, callback, change) {
  const result = accessQueue.then(() => accessLifetime(storage, callback, change));
  accessQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function updateGuestLifetimeStorage(storage, update) {
  return queueAccess(storage, update, true);
}

export function loadGuestLifetimeStats(storage) {
  return queueAccess(storage, (snapshot) => readGuestLifetimeStats(snapshot, STATS_KEY), false);
}
