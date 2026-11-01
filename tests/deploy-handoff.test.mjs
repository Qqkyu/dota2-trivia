import { afterEach, describe, expect, it } from "vitest";
import {
  HANDOFF_MAX_WAIT_MS,
  HANDOFF_PARTY_WAIT_MS,
  handoffDecision,
  handoffReadiness,
  instanceId,
  resetHandoffForTests,
} from "../src/lib/deploy-handoff.mjs";

const reveal = (msIntoPhase) => ({ number: 7, phase: "reveal", msIntoPhase });
const answering = (msIntoPhase) => ({ number: 7, phase: "answering", msIntoPhase });
const base = { now: 1_000_000, waitingSince: 1_000_000, selfInstance: "self" };

describe("handoffDecision", () => {
  it("is ready at once when no live server answers", () => {
    expect(handoffDecision({ ...base, live: null, clock: answering(3_000) })).toEqual({
      ready: true,
      reason: "no-live-server",
    });
  });

  it("waits for open parties, then for the reveal window", () => {
    const live = { instance: "old", openParties: 2 };
    expect(handoffDecision({ ...base, live, clock: reveal(2_000) }).reason).toBe("parties");
    const closed = { instance: "old", openParties: 0 };
    expect(handoffDecision({ ...base, live: closed, clock: answering(5_000) })).toEqual({
      ready: false,
      reason: "round",
    });
    expect(handoffDecision({ ...base, live: closed, clock: reveal(500) }).ready).toBe(false);
    expect(handoffDecision({ ...base, live: closed, clock: reveal(2_000) })).toEqual({
      ready: true,
      reason: "reveal-window",
    });
    expect(handoffDecision({ ...base, live: closed, clock: reveal(6_000) }).ready).toBe(false);
  });

  it("stops waiting for parties after the party limit, but still picks a reveal", () => {
    const live = { instance: "old", openParties: 1 };
    const late = { ...base, now: base.now + HANDOFF_PARTY_WAIT_MS };
    expect(handoffDecision({ ...late, live, clock: answering(1_000) }).reason).toBe("round");
    expect(handoffDecision({ ...late, live, clock: reveal(2_000) }).ready).toBe(true);
  });

  it("gives up waiting before Render's 15-minute deploy limit", () => {
    const live = { instance: "old", openParties: 3 };
    const decision = handoffDecision({ ...base, now: base.now + HANDOFF_MAX_WAIT_MS, live, clock: answering(1) });
    expect(decision).toEqual({ ready: true, reason: "max-wait" });
  });

  it("does not wait for parties an older server cannot count", () => {
    const live = { instance: undefined, openParties: undefined };
    expect(handoffDecision({ ...base, live, clock: reveal(2_000) }).ready).toBe(true);
    expect(handoffDecision({ ...base, live, clock: answering(2_000) }).reason).toBe("round");
  });
});

describe("handoffReadiness", () => {
  afterEach(() => resetHandoffForTests());
  const env = { ARCADE_DEPLOY_HANDOFF: "on" };
  const log = () => undefined;

  it("does nothing unless switched on", async () => {
    const result = await handoffReadiness({ origin: "https://x.test", clock: answering(1), env: {}, log });
    expect(result).toEqual({ ready: true, reason: "live" });
  });

  it("stays ready after the first pass", async () => {
    let calls = 0;
    const fetchLive = async () => {
      calls += 1;
      return { instance: "old", openParties: 0 };
    };
    const first = await handoffReadiness({
      origin: "https://x.test",
      clock: answering(1),
      now: 1,
      env,
      fetchLive,
      log,
    });
    expect(first.ready).toBe(false);
    const second = await handoffReadiness({
      origin: "https://x.test",
      clock: reveal(2_000),
      now: 5_000,
      env,
      fetchLive,
      log,
    });
    expect(second.ready).toBe(true);
    const later = await handoffReadiness({
      origin: "https://x.test",
      clock: answering(1),
      now: 9_000,
      env,
      fetchLive,
      log,
    });
    expect(later).toEqual({ ready: true, reason: "live" });
    expect(calls).toBe(2);
  });

  it("never waits on itself", async () => {
    const fetchLive = async () => ({ instance: instanceId(), openParties: 4 });
    const result = await handoffReadiness({ origin: "https://x.test", clock: answering(1), env, fetchLive, log });
    expect(result).toEqual({ ready: true, reason: "already-live" });
  });
});
