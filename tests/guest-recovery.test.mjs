import { describe, expect, it } from "vitest";
import {
  guestPendingRoundIds,
  markGuestRoundSettled,
  rememberGuestPendingVote,
  reconcileGuestRunBest,
} from "../src/lib/guest-accuracy.mjs";
const memory = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const first = { playerId: "guest-first", roomId: "dota2:content:public", now: 1000000 };
const second = { ...first, playerId: "guest-second" };
const round = (number) => `${first.roomId}:round:${number}`;

describe("guest recovery scope", () => {
  it("corrects a current run best while preserving older and other-tab scores", () => {
    const storage = memory();
    expect(reconcileGuestRunBest(storage, "first-run", 400, 150)).toBe(400);
    expect(reconcileGuestRunBest(storage, "second-run", 300, 400)).toBe(400);
    expect(reconcileGuestRunBest(storage, "first-run", 200, 400)).toBe(300);
    expect(reconcileGuestRunBest(storage, "second-run", 100, 300)).toBe(200);
    expect(reconcileGuestRunBest(storage, "first-run", 0, 200)).toBe(150);
  });
  it("does not settle another tab's accepted vote", () => {
    const storage = memory();
    rememberGuestPendingVote(storage, round(1), first);
    rememberGuestPendingVote(storage, round(1), second);
    expect(markGuestRoundSettled(storage, round(1), first)).toBe(true);
    expect(guestPendingRoundIds(storage, second)).toEqual([round(1)]);
    expect(markGuestRoundSettled(storage, round(1), second)).toBe(true);
    expect(markGuestRoundSettled(storage, round(1), first)).toBe(false);
  });

  it("bounds recovery and filters expired, other-player and other-room entries", () => {
    const storage = memory();
    for (let n = 0; n < 30; n += 1) rememberGuestPendingVote(storage, round(n), first);
    expect(guestPendingRoundIds(storage, first)).toHaveLength(24);
    expect(guestPendingRoundIds(storage, second)).toEqual([]);
    expect(guestPendingRoundIds(storage, { ...first, roomId: "dota2:content:private:OTHER" })).toEqual([]);
    expect(guestPendingRoundIds(storage, { ...first, now: first.now + 49 * 60 * 60 * 1000 })).toEqual([]);
  });

  it("accepts real content-version IDs but rejects an oversized ID", () => {
    const storage = memory();
    const scope = { ...first, roomId: `dota2:${"version".repeat(25)}:public` };
    const id = `${scope.roomId}:round:1000000`;
    rememberGuestPendingVote(storage, id, scope);
    rememberGuestPendingVote(storage, `${scope.roomId}:round:${"1".repeat(513)}`, scope);
    expect(guestPendingRoundIds(storage, scope)).toEqual([id]);
  });
});
