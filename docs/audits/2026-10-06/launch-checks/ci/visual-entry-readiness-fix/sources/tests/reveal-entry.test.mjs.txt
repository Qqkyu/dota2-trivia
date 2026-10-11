import { describe, expect, it } from "vitest";
import { waitForRevealEntryWindow } from "../scripts/lib/reveal-entry.mjs";
import { roundPhaseAt, PUBLIC_VOTE_ACCEPT_GRACE_MS } from "../src/lib/round-timing.mjs";

function clockFixture(start, options = {}) {
  let time = start;
  const observations = [];
  const sleeps = [];
  return {
    observations,
    sleeps,
    options: {
      now: () => time,
      sleep: async (ms) => {
        sleeps.push(ms);
        time += ms;
      },
      fetchImpl: async () => {
        const roundStart = Math.floor(time / 22_000) * 22_000;
        const answerDeadline = roundStart + 15_000;
        const snapshot = {
          serverNow: time,
          round: {
            phase: options.neverReveals ? "answering" : roundPhaseAt(time, answerDeadline),
            answerDeadline,
            revealDeadline: answerDeadline + 7_000,
          },
        };
        observations.push(snapshot);
        if (observations.length === 1) time += options.firstResponseDelayMs ?? 0;
        return new Response(JSON.stringify(snapshot));
      },
    },
  };
}

describe("reveal entry polling", () => {
  for (const [label, start] of [
    ["just before the answer deadline", 14_999],
    ["inside vote grace", 15_200],
  ]) {
    it(`waits through grace when starting ${label}`, async () => {
      const fixture = clockFixture(start);
      await waitForRevealEntryWindow("http://fixture/api/rounds", fixture.options);
      const last = fixture.observations.at(-1);
      expect(last.round.phase).toBe("reveal");
      expect(last.serverNow).toBeGreaterThanOrEqual(15_000 + PUBLIC_VOTE_ACCEPT_GRACE_MS);
      expect(last.round.revealDeadline - last.serverNow).toBeGreaterThanOrEqual(5_000);
      expect(fixture.observations).toHaveLength(2);
    });
  }
  it("skips a reveal with insufficient entry time and waits for the next round", async () => {
    const fixture = clockFixture(21_000);
    await waitForRevealEntryWindow("http://fixture/api/rounds", fixture.options);
    const last = fixture.observations.at(-1);
    expect(last.round.phase).toBe("reveal");
    expect(last.round.answerDeadline).toBe(37_000);
    expect(last.round.revealDeadline - last.serverNow).toBeGreaterThanOrEqual(5_000);
  });
  it("accepts an already usable reveal without sleeping", async () => {
    const fixture = clockFixture(16_000);
    await waitForRevealEntryWindow("http://fixture/api/rounds", fixture.options);
    expect(fixture.sleeps).toEqual([]);
  });
  it("rejects a delayed reveal snapshot and accepts the next fresh window", async () => {
    const fixture = clockFixture(16_000, { firstResponseDelayMs: 1_500 });
    await waitForRevealEntryWindow("http://fixture/api/rounds", fixture.options);
    expect(fixture.observations).toHaveLength(3);
    expect(fixture.observations[0].round.phase).toBe("reveal");
    expect(fixture.sleeps[0]).toBe(4_650);
    expect(fixture.observations.at(-1).round.answerDeadline).toBe(37_000);
    expect(fixture.observations.at(-1).round.phase).toBe("reveal");
  });
  it("bounds polling when a server never reveals", async () => {
    const fixture = clockFixture(15_000, { neverReveals: true });
    await expect(
      waitForRevealEntryWindow("http://fixture/api/rounds", {
        ...fixture.options,
        timeoutMs: 1_100,
      }),
    ).rejects.toThrow("Could not reach a reveal window");
    expect(fixture.sleeps.reduce((total, ms) => total + ms, 0)).toBe(1_100);
  });
  it("rejects an HTTP error without polling or parsing its body", async () => {
    let parsed = false;
    await expect(
      waitForRevealEntryWindow("http://fixture/api/rounds", {
        fetchImpl: async () => ({
          ok: false,
          status: 503,
          json: async () => {
            parsed = true;
          },
        }),
      }),
    ).rejects.toThrow("HTTP 503");
    expect(parsed).toBe(false);
  });
  it("rejects a snapshot delivered after the total deadline", async () => {
    let time = 0;
    await expect(
      waitForRevealEntryWindow("http://fixture/api/rounds", {
        now: () => time,
        timeoutMs: 100,
        fetchImpl: async () => {
          time = 101;
          return new Response(
            JSON.stringify({
              serverNow: 16_000,
              round: { phase: "reveal", answerDeadline: 15_000, revealDeadline: 22_000 },
            }),
          );
        },
      }),
    ).rejects.toThrow("Could not reach a reveal window");
  });
  it.each([{}, { serverNow: 0, round: { phase: "reveal", answerDeadline: 10, revealDeadline: 1 } }])(
    "rejects malformed round timing",
    async (snapshot) => {
      await expect(
        waitForRevealEntryWindow("http://fixture/api/rounds", {
          fetchImpl: async () => new Response(JSON.stringify(snapshot)),
        }),
      ).rejects.toThrow("invalid phase or timing");
    },
  );
  for (const phase of ["headers", "body"]) {
    it(`times out stalled ${phase} even if fetch ignores abort`, async () => {
      let signal;
      const pending = new Promise(() => {});
      await expect(
        waitForRevealEntryWindow("http://fixture/api/rounds", {
          timeoutMs: 30,
          fetchImpl: async (_url, options) => {
            signal = options.signal;
            return phase === "headers" ? pending : { ok: true, json: () => pending };
          },
        }),
      ).rejects.toMatchObject({ name: "TimeoutError" });
      expect(signal.aborted).toBe(true);
    });
  }
});
