export const FALLBACK_STEAM_DISPLAY_NAME = "Steam player";

export const STEAM_AVATAR_HOSTS = Object.freeze([
  "avatars.steamstatic.com",
  "avatars.akamai.steamstatic.com",
  "avatars.cloudflare.steamstatic.com",
  "avatars.fastly.steamstatic.com",
  "media.steampowered.com",
  "steamcdn-a.akamaihd.net",
]);

const AVATAR_HOSTS = new Set(STEAM_AVATAR_HOSTS);

/** @param {unknown} value */
export function safeAvatarUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && AVATAR_HOSTS.has(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

/** @param {unknown} value */
export function safeDisplayName(value) {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, 80) : null;
}

/**
 * @param {string} xml
 * @param {string} tag
 */
function xmlField(xml, tag) {
  const match = new RegExp(`<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${tag}>`).exec(xml);
  if (!match) return null;
  return (match[1] ?? match[2] ?? "").trim();
}

/**
 * @param {string} xml
 * @param {string} steamId
 */
export function parseSteamCommunityProfile(xml, steamId) {
  if (typeof xml !== "string" || typeof steamId !== "string" || xmlField(xml, "steamID64") !== steamId) {
    return null;
  }

  const displayName = safeDisplayName(xmlField(xml, "steamID"));
  const avatarUrl = safeAvatarUrl(xmlField(xml, "avatarFull"));
  if (!displayName && !avatarUrl) return null;
  return { displayName, avatarUrl };
}

/** @param {{ displayName?: unknown, avatarUrl?: unknown } | null | undefined} identity */
export function steamIdentityNeedsEnrichment(identity) {
  return !identity?.avatarUrl || identity.displayName === FALLBACK_STEAM_DISPLAY_NAME;
}
