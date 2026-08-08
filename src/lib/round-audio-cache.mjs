const AUDIO_CACHE_TTL_MS = 60_000;
const MAX_AUDIO_CACHE_ENTRIES = 8;
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/**
 * @typedef {{ bytes: ArrayBuffer, contentType: string }} CachedRoundAudio
 * @typedef {{ createdAt: number, promise: Promise<CachedRoundAudio> }} AudioCacheEntry
 */

/** @type {Map<string, AudioCacheEntry>} */
const roundAudioCache = globalThis.__queueArcadeRoundAudioCache ?? new Map();
globalThis.__queueArcadeRoundAudioCache = roundAudioCache;

/** @param {string} roundId @param {number} clip */
function cacheKey(roundId, clip) {
  return `${roundId}:${clip}`;
}

/** @param {number} now */
function pruneAudioCache(now) {
  for (const [key, entry] of roundAudioCache) {
    if (now - entry.createdAt >= AUDIO_CACHE_TTL_MS) roundAudioCache.delete(key);
  }

  while (roundAudioCache.size >= MAX_AUDIO_CACHE_ENTRIES) {
    const oldestKey = roundAudioCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    roundAudioCache.delete(oldestKey);
  }
}

/** @param {string} source @returns {Promise<CachedRoundAudio>} */
async function loadRoundAudio(source) {
  const upstream = await fetch(source, { cache: "force-cache" });
  if (!upstream.ok) throw new Error(`Upstream audio returned ${upstream.status}.`);

  const advertisedLength = Number(upstream.headers.get("content-length"));
  if (Number.isFinite(advertisedLength) && advertisedLength > MAX_AUDIO_BYTES) {
    throw new Error("Round audio exceeds the preload limit.");
  }

  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength > MAX_AUDIO_BYTES) throw new Error("Round audio exceeds the preload limit.");

  return {
    bytes,
    contentType: upstream.headers.get("content-type") ?? "application/octet-stream",
  };
}

/** @param {string} roundId @param {number} clip @param {string} source */
export function warmRoundAudio(roundId, clip, source) {
  const key = cacheKey(roundId, clip);
  const now = Date.now();
  pruneAudioCache(now);
  const existing = roundAudioCache.get(key);
  if (existing) return existing.promise;

  /** @type {AudioCacheEntry} */
  let entry;
  const promise = loadRoundAudio(source).catch((error) => {
    if (roundAudioCache.get(key) === entry) roundAudioCache.delete(key);
    throw error;
  });
  entry = { createdAt: now, promise };
  roundAudioCache.set(key, entry);
  return promise;
}

/** @param {string} roundId @param {number} clip */
export async function cachedRoundAudio(roundId, clip) {
  const key = cacheKey(roundId, clip);
  const entry = roundAudioCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt >= AUDIO_CACHE_TTL_MS) {
    roundAudioCache.delete(key);
    return null;
  }

  try {
    return await entry.promise;
  } catch {
    return null;
  }
}

/** @param {string | null} range @param {number} totalBytes */
export function parseAudioRange(range, totalBytes) {
  if (!range) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match || totalBytes <= 0) return null;

  const [, startText, endText] = match;
  if (!startText && !endText) return null;

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    return {
      start: Math.max(0, totalBytes - suffixLength),
      end: totalBytes - 1,
    };
  }

  const start = Number(startText);
  const requestedEnd = endText ? Number(endText) : totalBytes - 1;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(requestedEnd) ||
    start < 0 ||
    start >= totalBytes ||
    requestedEnd < start
  ) {
    return null;
  }

  return { start, end: Math.min(requestedEnd, totalBytes - 1) };
}

/** @param {CachedRoundAudio} audio @param {string | null} rangeHeader */
export function cachedAudioResponse(audio, rangeHeader) {
  const totalBytes = audio.bytes.byteLength;
  const range = parseAudioRange(rangeHeader, totalBytes);
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=60",
    "Content-Type": audio.contentType,
    "X-Content-Type-Options": "nosniff",
    "X-Queue-Arcade-Audio-Cache": "hit",
  });

  if (range) {
    const body = audio.bytes.slice(range.start, range.end + 1);
    headers.set("Content-Length", String(body.byteLength));
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${totalBytes}`);
    return new Response(body, { status: 206, headers });
  }

  headers.set("Content-Length", String(totalBytes));
  return new Response(audio.bytes, { status: 200, headers });
}
