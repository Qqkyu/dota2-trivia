export const ARCADE_LOBBY_PATH = "/";
export const PUBLIC_ARCADE_PATH = "/play";
export const PARTY_ARCADE_PATH = "/party";
export const DAILY_ARCADE_PATH = "/daily";

/** @param {unknown} pathname */
export function arcadeViewForPathname(pathname) {
  if (pathname === PUBLIC_ARCADE_PATH) return "play";
  if (pathname === PARTY_ARCADE_PATH) return "party";
  return "lobby";
}
