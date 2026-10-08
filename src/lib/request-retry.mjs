/** A finite entry attempt. Cancellation also stops retry delays and hung requests.
 * @template T
 * @param {(signal: AbortSignal) => Promise<T>} request
 * @param {{ signal?: AbortSignal, attempts?: number, timeoutMs?: number, retryDelayMs?: number, onRetry?: () => void }} options
 * @returns {Promise<T>}
 */
export async function requestWithRetry(
  request,
  { signal, attempts = 3, timeoutMs = 5000, retryDelayMs = 1000, onRetry = () => {} } = {},
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(cancel, timeoutMs);
    let rejectAborted;
    const aborted = new Promise((_, reject) => {
      rejectAborted = () => reject(new DOMException("Request timed out or was cancelled", "AbortError"));
      controller.signal.addEventListener("abort", rejectAborted, { once: true });
    });
    try {
      return await Promise.race([request(controller.signal), aborted]);
    } catch (error) {
      if (signal?.aborted || attempt + 1 === attempts) throw error;
      onRetry();
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
      controller.signal.removeEventListener("abort", rejectAborted);
      controller.abort();
    }
    await new Promise((resolve, reject) => {
      const cancelDelay = () => {
        signal?.removeEventListener("abort", cancelDelay);
        clearTimeout(timer);
        reject(new DOMException("Cancelled", "AbortError"));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", cancelDelay);
        resolve();
      }, retryDelayMs);
      signal?.addEventListener("abort", cancelDelay, { once: true });
      if (signal?.aborted) cancelDelay();
    });
  }
  throw new Error("No request attempts configured.");
}
