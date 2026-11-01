import { STEAM_AVATAR_HOSTS } from "./steam-profile.mjs";

/**
 * Valve's game art and Steam avatars load from this site (`/api/art/<host>/<path>`), not
 * from Valve. Under the GDPR, a site needs a legal basis before it lets a visitor's
 * browser send their IP address to a third party; serving the files itself removes the
 * transfer. Only these hosts, the Dota art folder, and the query strings the app ships
 * are allowed, so the route cannot be used to fetch anything else.
 */
export const STEAM_ART_HOSTS = new Set(["cdn.cloudflare.steamstatic.com", "cdn.steamstatic.com"]);
export const STEAM_ART_PATH_PREFIX = "/apps/dota2/images/";
/** Older item art carries one fixed version query. */
export const STEAM_ART_QUERIES = new Set(["", "?t=1593393829403"]);
const AVATAR_HOSTS = new Set(STEAM_AVATAR_HOSTS);
const SEGMENT = /^[A-Za-z0-9._-]+$/;
export const ART_ROUTE = "/api/art";

/**
 * The remote URL for an allowed piece of art, or null.
 *
 * @param {unknown} host
 * @param {unknown} segments path segments after the host
 * @param {string} [search] "" or "?…"
 */
export function steamArtTarget(host, segments, search = "") {
  if (typeof host !== "string" || !Array.isArray(segments) || segments.length === 0 || segments.length > 12) {
    return null;
  }
  if (!segments.every((segment) => typeof segment === "string" && SEGMENT.test(segment) && !/^\.+$/.test(segment))) {
    return null;
  }
  const path = `/${segments.join("/")}`;
  if (STEAM_ART_HOSTS.has(host)) {
    if (!path.startsWith(STEAM_ART_PATH_PREFIX) || !STEAM_ART_QUERIES.has(search)) return null;
  } else if (AVATAR_HOSTS.has(host)) {
    if (search !== "") return null;
  } else {
    return null;
  }
  return `https://${host}${path}${search}`;
}

/**
 * This site's address for Valve art or a Steam avatar. Any other source (local files,
 * round media routes) comes back unchanged.
 *
 * @template T
 * @param {T} src
 * @returns {T | string}
 */
export function firstPartyArtSrc(src) {
  if (typeof src !== "string" || !src.startsWith("https://")) return src;
  let url;
  try {
    url = new URL(src);
  } catch {
    return src;
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (!steamArtTarget(url.hostname, segments, url.search)) return src;
  return `${ART_ROUTE}/${url.hostname}/${segments.join("/")}${url.search}`;
}

/**
 * A copy of a JSON value with every Valve art address replaced by this site's address.
 * The round payload goes through this before it leaves the server.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function firstPartyArtTree(value) {
  if (typeof value === "string") return firstPartyArtSrc(value);
  if (Array.isArray(value)) return value.map(firstPartyArtTree);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, firstPartyArtTree(entry)]));
  }
  return value;
}
