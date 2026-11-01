import { describe, expect, it } from "vitest";
import { currentPublicRound, publicRoundClock, PUBLIC_ROUND_ANSWER_MS } from "../src/lib/public-rooms";

describe("publicRoundClock", () => {
  it("agrees with the live public round on number and boundaries", () => {
    const settings = { gameId: "dota2", mode: "mixed", filter: "Mixed" };
    const now = Date.UTC(2026, 10, 1, 12, 0, 0, 123);
    const { round } = currentPublicRound(settings, now);
    const clock = publicRoundClock(now);
    expect(clock.number).toBe(round.number);
    const atStart = publicRoundClock(round.startedAt);
    expect(atStart).toEqual({ number: round.number, phase: "answering", msIntoPhase: 0 });
    const intoReveal = publicRoundClock(round.startedAt + PUBLIC_ROUND_ANSWER_MS + 2_500);
    expect(intoReveal).toEqual({ number: round.number, phase: "reveal", msIntoPhase: 2_500 });
    expect(publicRoundClock(round.revealDeadline)).toEqual({
      number: round.number + 1,
      phase: "answering",
      msIntoPhase: 0,
    });
  });
});
