import { describe, expect, it } from "vitest";
import { isAlphaSessionId, summarizeAlphaSessions } from "../src/lib/alpha-analytics.mjs";
import { getRoomPresence, ROOM_PRESENCE_TTL_MS, touchRoomPresence } from "../src/lib/room-presence.mjs";
import { safeReturnTo } from "../src/lib/steam-auth.mjs";

const now = Date.UTC(2026, 7, 1, 12, 0, 0);
const day = 24 * 60 * 60 * 1_000;
const sessionId = "4c79f197-9bd8-4b73-890e-45b311316a85";

describe("alpha sessions", () => {
  it("accepts only random v4 session IDs", () => {
    expect(isAlphaSessionId(sessionId)).toBe(true);
    expect(isAlphaSessionId("predictable-session")).toBe(false);
  });

  it("summarizes visits, returns, rounds, and time inside the retention window", () => {
    const sessions = [
      {
        visitorHash: "player-a",
        startedAt: now - 3 * day,
        lastSeenAt: now - 3 * day + 5 * 60_000,
        finishedAt: now - 3 * day + 60_000,
        roundsAnswered: 2,
        correctAnswers: 1,
      },
      {
        visitorHash: "player-a",
        startedAt: now - day,
        lastSeenAt: now - day + 8 * 60_000,
        finishedAt: null,
        roundsAnswered: 3,
        correctAnswers: 3,
      },
      {
        visitorHash: "player-b",
        startedAt: now - 60_000,
        lastSeenAt: now - 30_000,
        finishedAt: null,
        roundsAnswered: 0,
        correctAnswers: 0,
      },
      {
        visitorHash: "expired-player",
        startedAt: now - 31 * day,
        lastSeenAt: now - 31 * day,
        finishedAt: null,
        roundsAnswered: 100,
        correctAnswers: 100,
      },
    ];
    const summary = summarizeAlphaSessions(sessions, { now, windowDays: 30, dailyDays: 14 });
    expect(summary).toMatchObject({
      sessions: 3,
      players: 2,
      returningPlayers: 1,
      returnRate: 50,
      rounds: 5,
      correct: 4,
      accuracy: 80,
      roundsPerSession: 1.7,
      averageMinutes: 4.5,
    });
    expect(summary.daily).toHaveLength(14);
    expect(summary.daily.reduce((total, entry) => total + entry.sessions, 0)).toBe(3);
  });
});

describe("room presence", () => {
  it("deduplicates players and expires stale pulses", () => {
    const roomId = `presence-test-${sessionId}`;
    expect(touchRoomPresence(roomId, "player-one", now)).toBe(1);
    expect(touchRoomPresence(roomId, "player-one", now + 1_000)).toBe(1);
    expect(touchRoomPresence(roomId, "player-two", now + 2_000)).toBe(2);
    expect(getRoomPresence(roomId, now + ROOM_PRESENCE_TTL_MS + 2_001)).toBe(0);
  });
});

describe("safeReturnTo", () => {
  it("only returns to known in-app paths", () => {
    expect(safeReturnTo("/ops")).toBe("/ops");
    expect(safeReturnTo("/ops/anything")).toBe("/");
    expect(safeReturnTo("https://evil.example/")).toBe("/");
    expect(safeReturnTo("//evil.example")).toBe("/");
    expect(safeReturnTo("/play?room=LODA")).toBe("/play?room=LODA");
  });
});
