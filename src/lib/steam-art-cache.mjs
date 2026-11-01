import { fetchMedia, IMAGE_HOSTS, IMAGE_TYPES } from "./media-fetch.mjs";
import { STEAM_AVATAR_HOSTS } from "./steam-profile.mjs";

/** Every Dota icon and portrait the app uses fits in about 15 MB, so most players hit memory. */
export const ART_CACHE_MAX_BYTES = 48 * 1024 * 1024;
const ART_MAX_BYTES = 2 * 1024 * 1024;
const ART_TTL_MS = 12 * 60 * 60 * 1000;
const FETCH_HOSTS = new Set([...IMAGE_HOSTS, ...STEAM_AVATAR_HOSTS]);

const cache = (globalThis.__queueArcadeArtCache ??= { entries: new Map(), bytes: 0, inflight: new Map() });

function remember(url, entry) {
  const previous = cache.entries.get(url);
  if (previous) {
    cache.entries.delete(url);
    cache.bytes -= previous.bytes.byteLength;
  }
  cache.entries.set(url, entry);
  cache.bytes += entry.bytes.byteLength;
  // Map order is insertion order: drop the least recently used first.
  while (cache.bytes > ART_CACHE_MAX_BYTES && cache.entries.size > 1) {
    const [oldest, value] = cache.entries.entries().next().value;
    cache.entries.delete(oldest);
    cache.bytes -= value.bytes.byteLength;
  }
}

/**
 * Art bytes from memory, or fetched once from Valve with the media limits. Concurrent
 * requests for the same URL share one download. No visitor header is forwarded.
 *
 * @param {string} url an address from steamArtTarget
 * @param {{ now?: number, fetcher?: typeof fetchMedia }} [options]
 */
export async function cachedSteamArt(url, { now = Date.now(), fetcher = fetchMedia } = {}) {
  const hit = cache.entries.get(url);
  if (hit && now - hit.at < ART_TTL_MS) {
    cache.entries.delete(url);
    cache.entries.set(url, hit);
    return hit;
  }
  const pending = cache.inflight.get(url);
  if (pending) return pending;
  const task = fetcher(url, { hosts: FETCH_HOSTS, types: IMAGE_TYPES, maxBytes: ART_MAX_BYTES, timeoutMs: 8_000 })
    .then((media) => {
      const entry = { bytes: media.bytes, contentType: media.contentType, at: now };
      remember(url, entry);
      return entry;
    })
    .finally(() => cache.inflight.delete(url));
  cache.inflight.set(url, task);
  return task;
}

export function artCacheStatsForTests() {
  return { entries: cache.entries.size, bytes: cache.bytes };
}

export function resetArtCacheForTests() {
  cache.entries.clear();
  cache.bytes = 0;
  cache.inflight.clear();
}
