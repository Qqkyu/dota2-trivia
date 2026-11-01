import { createHash, randomUUID } from "node:crypto";

/**
 * Zero-disruption handoff for a deploy.
 *
 * Render starts the new server next to the live one and moves traffic to it as
 * soon as its health check passes. Until it has passed once, the new server asks
 * the live server (through the public address, which still reaches the live one)
 * and holds its health check at 503:
 *
 * 1. while a party is open, because parties live in the server's memory, at most
 *    HANDOFF_PARTY_WAIT_MS;
 * 2. until the shared public clock is early in a reveal, so the switch never
 *    lands mid-question. A data update changes the round's identity, and the
 *    client keeps the reveal it already shows.
 *
 * With no live server to protect (first boot, crash), it is ready at once.
 * After the first pass it stays ready; Render restarts an instance that later
 * fails health checks for 60 seconds, and the wait never applies again.
 */

export const HANDOFF_PARTY_WAIT_MS = 10 * 60_000;
/** Render cancels a deploy whose instance is not healthy within 15 minutes. */
export const HANDOFF_MAX_WAIT_MS = 12 * 60_000;
/** Pass only this far into the 7-second reveal; Render switches a few seconds later. */
export const HANDOFF_REVEAL_WINDOW_MS = Object.freeze([1_000, 4_000]);
const LIVE_INFO_TTL_MS = 3_000;
const LIVE_INFO_TIMEOUT_MS = 2_500;

const selfInstance = createHash("sha256")
  .update(process.env.RENDER_INSTANCE_ID || randomUUID())
  .digest("hex")
  .slice(0, 12);

/** A short, stable id for this server process; the live one reports its own. */
export function instanceId() {
  return selfInstance;
}

/** The deployed commit, or "local". */
export function releaseId(env = process.env) {
  return env.RENDER_GIT_COMMIT?.slice(0, 12) || "local";
}

export function handoffEnabled(env = process.env) {
  return env.ARCADE_DEPLOY_HANDOFF === "on";
}

/**
 * @param {{
 *   now: number;
 *   waitingSince: number;
 *   live: null | { instance?: string; openParties?: number };
 *   selfInstance: string;
 *   clock: { phase: "answering" | "reveal"; msIntoPhase: number };
 * }} input
 * @returns {{ ready: boolean; reason: "no-live-server" | "already-live" | "max-wait" | "parties" | "round" | "reveal-window" }}
 */
export function handoffDecision({ now, waitingSince, live, selfInstance: self, clock }) {
  if (!live) return { ready: true, reason: "no-live-server" };
  if (live.instance && live.instance === self) return { ready: true, reason: "already-live" };
  const waited = now - waitingSince;
  if (waited >= HANDOFF_MAX_WAIT_MS) return { ready: true, reason: "max-wait" };
  if (typeof live.openParties === "number" && live.openParties > 0 && waited < HANDOFF_PARTY_WAIT_MS) {
    return { ready: false, reason: "parties" };
  }
  const [from, to] = HANDOFF_REVEAL_WINDOW_MS;
  const inWindow = clock.phase === "reveal" && clock.msIntoPhase >= from && clock.msIntoPhase <= to;
  return inWindow ? { ready: true, reason: "reveal-window" } : { ready: false, reason: "round" };
}

const state = (globalThis.__queueArcadeHandoff ??= {
  readyAt: null,
  waitingSince: null,
  live: undefined,
  liveCheckedAt: 0,
  lastReason: null,
});

/**
 * Ask the live server for its instance id and open parties. Null means nothing
 * answered as a healthy Queue Arcade server.
 *
 * @param {string} origin
 */
export async function fetchLiveServer(origin) {
  try {
    const response = await fetch(new URL("/api/health", origin), {
      cache: "no-store",
      headers: { "x-queue-arcade-handoff": selfInstance },
      signal: AbortSignal.timeout(LIVE_INFO_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = await response.json();
    if (body?.status !== "ready") return null;
    return {
      instance: typeof body.instance === "string" ? body.instance : undefined,
      openParties: typeof body.parties?.open === "number" ? body.parties.open : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Health-check gate for a fresh server. Returns ready=true forever once passed.
 *
 * @param {{
 *   origin: string;
 *   clock: { number: number; phase: "answering" | "reveal"; msIntoPhase: number };
 *   now?: number;
 *   env?: NodeJS.ProcessEnv;
 *   fetchLive?: typeof fetchLiveServer;
 *   log?: (line: string) => void;
 * }} input
 */
export async function handoffReadiness({
  origin,
  clock,
  now = Date.now(),
  env = process.env,
  fetchLive = fetchLiveServer,
  log = (line) => console.log(line),
}) {
  if (!handoffEnabled(env) || state.readyAt !== null) return { ready: true, reason: "live" };
  state.waitingSince ??= now;
  if (state.live === undefined || now - state.liveCheckedAt >= LIVE_INFO_TTL_MS) {
    state.live = await fetchLive(origin);
    state.liveCheckedAt = now;
  }
  const decision = handoffDecision({
    now,
    waitingSince: state.waitingSince,
    live: state.live,
    selfInstance,
    clock,
  });
  if (decision.ready || decision.reason !== state.lastReason) {
    log(
      `[queue-arcade:handoff] ${JSON.stringify({
        at: new Date(now).toISOString(),
        instance: selfInstance,
        ready: decision.ready,
        reason: decision.reason,
        waitedMs: now - state.waitingSince,
        liveInstance: state.live?.instance ?? null,
        openParties: state.live?.openParties ?? null,
        round: clock.number,
        phase: clock.phase,
        msIntoPhase: clock.msIntoPhase,
      })}`,
    );
    state.lastReason = decision.reason;
  }
  if (decision.ready) state.readyAt = now;
  return decision;
}

export function resetHandoffForTests() {
  state.readyAt = null;
  state.waitingSince = null;
  state.live = undefined;
  state.liveCheckedAt = 0;
  state.lastReason = null;
}
