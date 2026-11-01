/**
 * Records every request a page makes and fails when one leaves the app's own origin.
 * Game art is served through /api/art so a visitor's browser never contacts Valve
 * (their IP address would reach a third party); this keeps it that way.
 *
 * @param {string} appUrl
 */
export function firstPartyRequests(appUrl) {
  const own = new URL(appUrl).host;
  const foreign = new Map();
  let seen = 0;
  return {
    /** Pass every CDP event here after `Network.enable`. */
    onEvent(event) {
      if (event.method !== "Network.requestWillBeSent") return;
      const url = event.params?.request?.url ?? "";
      if (!/^https?:/.test(url)) return;
      seen += 1;
      const host = new URL(url).host;
      if (host !== own && !foreign.has(host)) foreign.set(host, url);
    },
    assert(label) {
      if (foreign.size) {
        const [host, url] = [...foreign.entries()][0];
        throw new Error(
          `${label}: the browser contacted ${[...foreign.keys()].join(", ")} (first: ${url} on ${host}).`,
        );
      }
      return seen;
    },
  };
}
