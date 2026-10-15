/** Read one health response within the startup probe's request deadline. */
export async function readHealthWithDeadline(url, timeoutMs = 2000) {
  const controller = new AbortController();
  let timer;
  // AbortSignal.timeout uses an unreferenced timer. Startup must remain alive
  // through this bounded request even if fetch temporarily has no active handle.
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new DOMException("Health request timed out", "TimeoutError");
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { signal: controller.signal });
        return { ok: response.ok, health: await response.json() };
      })(),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
