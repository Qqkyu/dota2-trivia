export class MediaBusyError extends Error {
  constructor() {
    super("Media processing is busy. Try again shortly.");
    this.name = "MediaBusyError";
  }
}

/** Bound both running work and the number of waiting callers. */
export function createMediaQueue(concurrency, maxWaiting) {
  let active = 0;
  const waiting = [];
  function run(job) {
    active += 1;
    Promise.resolve()
      .then(job.work)
      .then(job.resolve, job.reject)
      .finally(() => {
        active -= 1;
        const next = waiting.shift();
        if (next) run(next);
      });
  }
  return (work) =>
    new Promise((resolve, reject) => {
      const job = { work, resolve, reject };
      if (active < concurrency) run(job);
      else if (waiting.length < maxWaiting) waiting.push(job);
      else reject(new MediaBusyError());
    });
}

/**
 * Keep pending work separate from the completed LRU cache. Eviction must not
 * allow callers to start a second copy of work that is still running.
 */
export function createMediaCache({ maxEntries, maxBytes, maxPending, ttlMs }) {
  const completed = new Map();
  const pending = new Map();
  let retainedBytes = 0;
  function remove(key) {
    const entry = completed.get(key);
    if (entry) retainedBytes -= entry.value.bytes.byteLength;
    completed.delete(key);
  }
  function prune() {
    for (const [key, entry] of completed) {
      if (entry.expiresAt <= Date.now()) remove(key);
    }
  }
  function get(key) {
    prune();
    if (pending.has(key)) return pending.get(key);
    const entry = completed.get(key);
    if (!entry) return null;
    completed.delete(key);
    completed.set(key, entry);
    return Promise.resolve(entry.value);
  }
  function load(key, work) {
    const found = get(key);
    if (found) return found;
    if (pending.size >= maxPending) return Promise.reject(new MediaBusyError());
    const promise = Promise.resolve()
      .then(work)
      .then((value) => {
        prune();
        const size = value.bytes.byteLength;
        if (size <= maxBytes) {
          while (completed.size >= maxEntries || retainedBytes + size > maxBytes) {
            remove(completed.keys().next().value);
          }
          completed.set(key, { value, expiresAt: Date.now() + ttlMs });
          retainedBytes += size;
        }
        return value;
      })
      .finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  }
  return { get, load };
}

/** A disconnected caller must not cancel a job still used by other callers. */
export function waitForMedia(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error("Request aborted."));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    // Observe shared job failures even when the caller was already disconnected.
    if (signal.aborted) abort();
  });
}
