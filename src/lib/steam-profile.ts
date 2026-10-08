import { updateSteamUser, type SteamIdentityInput } from "@/lib/account-store";
import type { AccountUser } from "@/lib/account-contract";
import {
  FALLBACK_STEAM_DISPLAY_NAME,
  parseSteamCommunityProfile,
  safeAvatarUrl,
  safeDisplayName,
  steamIdentityNeedsEnrichment,
} from "@/lib/steam-profile.mjs";

export {
  FALLBACK_STEAM_DISPLAY_NAME,
  parseSteamCommunityProfile,
  safeAvatarUrl,
  steamIdentityNeedsEnrichment,
} from "@/lib/steam-profile.mjs";

const PROFILE_FETCH_TIMEOUT_MS = 5_000;
const ENRICHMENT_RETRY_MS = 15 * 60 * 1_000;

const enrichmentAttempts = new Map<string, number>();

function fallbackIdentity(steamId: string, authenticatedAt: number): SteamIdentityInput {
  return {
    steamId,
    displayName: FALLBACK_STEAM_DISPLAY_NAME,
    avatarUrl: null,
    profileUrl: `https://steamcommunity.com/profiles/${steamId}`,
    authenticatedAt,
  };
}

function mergeIdentity(
  fallback: SteamIdentityInput,
  ...sources: Array<{ displayName?: string | null; avatarUrl?: string | null } | null>
): SteamIdentityInput {
  let displayName = fallback.displayName;
  let avatarUrl = fallback.avatarUrl;
  for (const source of sources) {
    if (!source) continue;
    if (source.displayName && source.displayName !== FALLBACK_STEAM_DISPLAY_NAME) displayName = source.displayName;
    if (source.avatarUrl) avatarUrl = source.avatarUrl;
  }
  return { ...fallback, displayName, avatarUrl };
}

async function officialSteamIdentity(steamId: string) {
  const apiKey = process.env.STEAM_WEB_API_KEY?.trim();
  if (!apiKey) return null;

  const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/");
  url.searchParams.set("steamids", steamId);
  const response = await fetch(url, {
    headers: { "x-webapi-key": apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(PROFILE_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;
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
  if (!player) return null;
  return {
    displayName: safeDisplayName(player.personaname),
    avatarUrl: safeAvatarUrl(player.avatarfull),
  };
}

async function communitySteamIdentity(steamId: string) {
  const url = new URL(`https://steamcommunity.com/profiles/${steamId}/`);
  url.searchParams.set("xml", "1");
  const response = await fetch(url, {
    headers: { "user-agent": "QueueArcade/0.2" },
    cache: "no-store",
    signal: AbortSignal.timeout(PROFILE_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  return parseSteamCommunityProfile(await response.text(), steamId);
}

export async function steamIdentityProfile(steamId: string, authenticatedAt = Date.now()) {
  const fallback = fallbackIdentity(steamId, authenticatedAt);
  let official: { displayName: string | null; avatarUrl: string | null } | null = null;
  try {
    official = await officialSteamIdentity(steamId);
    if (official && !steamIdentityNeedsEnrichment(official)) {
      return mergeIdentity(fallback, official);
    }
  } catch {
    official = null;
  }

  try {
    return mergeIdentity(fallback, official, await communitySteamIdentity(steamId));
  } catch {
    return mergeIdentity(fallback, official);
  }
}

export async function refreshSteamIdentityIfNeeded(user: AccountUser, now = Date.now()) {
  if (!steamIdentityNeedsEnrichment(user)) return user;

  const lastAttempt = enrichmentAttempts.get(user.steamId) ?? 0;
  if (now - lastAttempt < ENRICHMENT_RETRY_MS) return user;
  enrichmentAttempts.set(user.steamId, now);

  const identity = await steamIdentityProfile(user.steamId, now);
  if (steamIdentityNeedsEnrichment(identity)) return user;
  return (await updateSteamUser(user.id, identity)) ?? user;
}
