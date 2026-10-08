import { describe, expect, it } from "vitest";
import {
  applyGuestLifetimeStats,
  guestPendingRoundIds,
  markGuestRoundSettled,
  rememberGuestPendingVote,
} from "../src/lib/guest-accuracy.mjs";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => {
      values.set(key, String(value));
    },
  };
}

describe("guest accuracy persistence", () => {
  it("settles an accepted vote only once across refresh", () => {
    const storage = memoryStorage();
    rememberGuestPendingVote(storage, "round-1");
    rememberGuestPendingVote(storage, "round-1");
    expect(guestPendingRoundIds(storage)).toEqual(["round-1"]);
    expect(markGuestRoundSettled(storage, "round-1")).toBe(true);
    expect(markGuestRoundSettled(storage, "round-1")).toBe(false);
    expect(guestPendingRoundIds(storage)).toEqual([]);
  });

  it("counts a wrong answer in the stored record", () => {
    expect(
      applyGuestLifetimeStats(
        { runs: 1, answered: 1, correct: 1, bestScore: 200 },
        { correct: false, startedRun: false, nextScore: 200 },
      ),
    ).toEqual({ runs: 1, answered: 2, correct: 1, bestScore: 200 });
  });
});
