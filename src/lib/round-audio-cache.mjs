import { AUDIO_HOSTS, AUDIO_TYPES, fetchMedia } from "./media-fetch.mjs";
import { createMediaCache, createMediaQueue } from "./media-work.mjs";

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/**
 * @typedef {{ bytes: ArrayBuffer, contentType: string }} CachedRoundAudio
 */

const audioLoads = createMediaQueue(4, 8);
const roundAudioCache = createMediaCache({ maxEntries: 24, maxBytes: 24 * 1024 * 1024, maxPending: 12, ttlMs: 60_000 });
const cutAudioCache = createMediaCache({ maxEntries: 48, maxBytes: 24 * 1024 * 1024, maxPending: 10, ttlMs: 60_000 });

/** @param {string} roundId @param {number} clip */
function cacheKey(roundId, clip) {
  return `${roundId}:${clip}`;
}

/** @param {string} source @returns {Promise<CachedRoundAudio>} */
async function loadRoundAudio(source) {
  return audioLoads(() => fetchMedia(source, { hosts: AUDIO_HOSTS, types: AUDIO_TYPES, maxBytes: MAX_AUDIO_BYTES }));
}

/** @param {string} roundId @param {number} clip @param {string} source */
export function warmRoundAudio(roundId, clip, source) {
  const key = cacheKey(roundId, clip);
  return roundAudioCache.load(key, () => loadRoundAudio(source));
}

/** Cache each finite clue cut, including work that has not finished yet. */
export function cachedAudioCut(source, seconds, contentType, cut, startSeconds = 0) {
  return cutAudioCache.load(JSON.stringify([source, seconds, contentType, startSeconds]), async () => ({
    bytes: await cut(),
    contentType,
  }));
}

/** @param {string} roundId @param {number} clip */
export async function cachedRoundAudio(roundId, clip) {
  const key = cacheKey(roundId, clip);
  return roundAudioCache.get(key);
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
