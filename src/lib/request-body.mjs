function rejectBody(status, error) {
  return { response: Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } }) };
}

function cancelBody(body) {
  // A custom stream's cancel hook can stall, so rejection must not await it.
  void body?.cancel().catch(() => undefined);
}

/**
 * Read a small JSON request without buffering an unbounded stream.
 *
 * @param {Request} request
 * @param {{ maxBytes?: number; timeoutMs?: number }} [options]
 * @returns {Promise<{body: unknown} | {response: Response}>}
 */
export async function readJsonBody(request, { maxBytes = 8_192, timeoutMs = 5_000 } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new RangeError("Body limits must be positive finite numbers.");
  }

  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    cancelBody(request.body);
    return rejectBody(415, "Use application/json for this request.");
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && !/^\d+$/.test(contentLength.trim())) {
    cancelBody(request.body);
    return rejectBody(400, "Invalid request length.");
  }
  if (contentLength !== null && Number(contentLength) > maxBytes) {
    cancelBody(request.body);
    return rejectBody(413, "Request body too large.");
  }
  if (!request.body) return rejectBody(400, "Invalid JSON.");

  let reader;
  try {
    reader = request.body.getReader();
  } catch {
    return rejectBody(400, "Request body is unavailable.");
  }
  const timedOut = Symbol("body-timeout");
  let timeout;
  const deadline = new Promise((resolve) => {
    timeout = setTimeout(() => resolve(timedOut), timeoutMs);
  });
  const chunks = [];
  let byteLength = 0;

  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk === timedOut) {
        cancelBody(reader);
        return rejectBody(408, "Request body timed out.");
      }
      if (chunk.done) break;
      byteLength += chunk.value.byteLength;
      if (byteLength > maxBytes) {
        cancelBody(reader);
        return rejectBody(413, "Request body too large.");
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { body: JSON.parse(text) };
  } catch {
    cancelBody(reader);
    return rejectBody(400, "Invalid JSON.");
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}
