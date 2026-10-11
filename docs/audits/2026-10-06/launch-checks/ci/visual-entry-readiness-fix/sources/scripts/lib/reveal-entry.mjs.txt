import { PUBLIC_VOTE_ACCEPT_GRACE_MS } from "../../src/lib/round-timing.mjs";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readSnapshot(url, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new DOMException("Round request timed out", "TimeoutError");
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`Round request failed with HTTP ${response.status}.`);
        return await response.json();
      })(),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function waitForRevealEntryWindow(
  roomUrl,
  {
    fetchImpl = fetch,
    sleep = delay,
    now = () => performance.now(),
    timeoutMs = 60_000,
    requestTimeoutMs = 5_000,
  } = {},
) {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const requestStartedAt = now();
    const snapshot = await readSnapshot(roomUrl, Math.min(requestTimeoutMs, deadline - requestStartedAt), fetchImpl);
    const receivedAt = now();
    if (receivedAt >= deadline) break;
    const { round, serverNow } = snapshot ?? {};
    if (
      !Number.isFinite(serverNow) ||
      !Number.isFinite(round?.answerDeadline) ||
      !Number.isFinite(round?.revealDeadline) ||
      round.revealDeadline <= round.answerDeadline ||
      !["answering", "reveal"].includes(round.phase)
    ) {
      throw new Error("Round response has invalid phase or timing data.");
    }
    // Include the full request time so a delayed snapshot cannot overstate the entry window.
    const latestServerNow = serverNow + Math.max(0, receivedAt - requestStartedAt);
    if (round.phase === "reveal" && round.revealDeadline - latestServerNow >= 5_000) return;
    const nextPhaseAt =
      round.phase === "answering" ? round.answerDeadline + PUBLIC_VOTE_ACCEPT_GRACE_MS : round.revealDeadline;
    await sleep(Math.min(Math.max(150, nextPhaseAt - latestServerNow + 150), Math.max(0, deadline - now())));
  }
  throw new Error("Could not reach a reveal window for the first-entry smoke test.");
}
