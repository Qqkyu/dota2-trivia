export const AUDIO_HOSTS = new Set(["dotabase.dillerm.io"]);
export const IMAGE_HOSTS = new Set([
  "cdn.cloudflare.steamstatic.com",
  "cdn.steamstatic.com",
  "cdn.akamai.steamstatic.com",
]);
export const AUDIO_TYPES = new Map([
  ["audio/mpeg", "audio/mpeg"],
  ["audio/mp3", "audio/mpeg"],
  ["audio/wav", "audio/wav"],
  ["audio/x-wav", "audio/wav"],
  ["audio/wave", "audio/wav"],
]);
export const IMAGE_TYPES = new Map(
  ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"].map((type) => [type, type]),
);

function allowedUrl(source, hosts) {
  const url = new URL(source);
  if (
    url.protocol !== "https:" ||
    !hosts.has(url.hostname) ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new Error("Media source host is not allowed.");
  }
  return url;
}

/** Enforce the same host, byte and time limits across every redirect and chunk. */
export async function fetchMedia(source, { hosts, types, maxBytes, timeoutMs = 8_000, signal }) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason ?? new Error("Media request aborted."));
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Media download timed out.")), timeoutMs);
  let reader;
  let upstream;
  try {
    let url = allowedUrl(source, hosts);
    for (let redirects = 0; ; redirects += 1) {
      controller.signal.throwIfAborted();
      upstream = await fetch(url, { cache: "no-store", redirect: "manual", signal: controller.signal });
      if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
      void upstream.body?.cancel().catch(() => undefined);
      const location = upstream.headers.get("location");
      if (!location || redirects >= 2) throw new Error("Media redirect limit exceeded.");
      url = allowedUrl(new URL(location, url), hosts);
    }
    if (!upstream.ok) throw new Error(`Upstream media returned ${upstream.status}.`);
    const contentType = types.get((upstream.headers.get("content-type") ?? "").split(";", 1)[0].toLowerCase().trim());
    if (!contentType) throw new Error("Upstream media type is not allowed.");
    const length = Number(upstream.headers.get("content-length"));
    if (Number.isFinite(length) && length > maxBytes) throw new Error("Media exceeds the size limit.");
    if (!upstream.body) throw new Error("Upstream media is empty.");
    reader = upstream.body.getReader();
    const bytes = new Uint8Array(maxBytes);
    let total = 0;
    while (true) {
      controller.signal.throwIfAborted();
      // Remove each read's abort listener before the next chunk. One shared
      // rejection promise would retain a reaction for every completed chunk.
      const { done, value } = await waitForMedia(reader.read(), controller.signal);
      if (done) break;
      if (total + value.byteLength > maxBytes) throw new Error("Media exceeds the size limit.");
      bytes.set(value, total);
      total += value.byteLength;
    }
    if (!total) throw new Error("Upstream media is empty.");
    return { bytes: bytes.buffer.slice(0, total), contentType };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    // Cancellation does not wait for an uncooperative remote stream to close.
    if (reader) void reader.cancel().catch(() => undefined);
    else void upstream?.body?.cancel().catch(() => undefined);
    controller.abort();
  }
}
import { waitForMedia } from "./media-work.mjs";
