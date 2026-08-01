import type { SteamIdentityInput } from "@/lib/account-store";

const AVATAR_HOSTS = new Set([
  "avatars.steamstatic.com",
  "avatars.akamai.steamstatic.com",
  "avatars.cloudflare.steamstatic.com",
  "avatars.fastly.steamstatic.com",
  "media.steampowered.com",
]);

function safeAvatarUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && AVATAR_HOSTS.has(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

function safeDisplayName(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, 80) : null;
}

function fallbackIdentity(steamId: string, authenticatedAt: number): SteamIdentityInput {
  return {
    steamId,
    displayName: "Steam player",
    avatarUrl: null,
    profileUrl: `https://steamcommunity.com/profiles/${steamId}`,
    authenticatedAt,
  };
}

export async function steamIdentityProfile(steamId: string, authenticatedAt = Date.now()) {
  const fallback = fallbackIdentity(steamId, authenticatedAt);
  const apiKey = process.env.STEAM_WEB_API_KEY?.trim();
  if (!apiKey) return fallback;

  const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/");
  url.searchParams.set("steamids", steamId);
  try {
    const response = await fetch(url, {
      headers: { "x-webapi-key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return fallback;
    const payload = (await response.json()) as {
      response?: {
        players?: Array<{
          steamid?: unknown;
          personaname?: unknown;
          avatarfull?: unknown;
        }>;
      };
    };
    const player = payload.response?.players?.find((candidate) => candidate.steamid === steamId);
    const displayName = safeDisplayName(player?.personaname) ?? fallback.displayName;
    return {
      ...fallback,
      displayName,
      avatarUrl: safeAvatarUrl(player?.avatarfull),
    };
  } catch {
    return fallback;
  }
}
