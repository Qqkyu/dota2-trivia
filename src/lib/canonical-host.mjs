/**
 * The app answers on one public origin, ARCADE_APP_URL. Votes, sessions,
 * reports and private-room actions are accepted only from that origin, so a
 * page served on the Render subdomain could not save an answer once the app
 * moves to a custom domain. Page requests that arrive through an
 * `*.onrender.com` host are sent to the configured origin instead.
 *
 * While the configured origin is the onrender.com address itself, nothing is
 * redirected, and local hosts are never touched.
 *
 * @param {string} pathAndSearch request path with its query string
 * @param {string | null | undefined} hostHeader `x-forwarded-host` or `host`
 * @param {string | undefined} configuredOrigin ARCADE_APP_URL
 * @returns {string | null} absolute URL to redirect to, or null
 */
export function canonicalRedirectUrl(pathAndSearch, hostHeader, configuredOrigin) {
  if (!configuredOrigin || !hostHeader) return null;
  let canonical;
  try {
    canonical = new URL(configuredOrigin);
  } catch {
    return null;
  }
  const host = hostHeader.split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  if (!host.endsWith(".onrender.com") || host === canonical.hostname.toLowerCase()) return null;
  const path = typeof pathAndSearch === "string" && pathAndSearch.startsWith("/") ? pathAndSearch : "/";
  return `${canonical.origin}${path}`;
}
