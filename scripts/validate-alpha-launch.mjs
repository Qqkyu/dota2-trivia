#!/usr/bin/env node

import {
  ALPHA_FEEDBACK_OPTIONS,
  isAlphaFeedback,
  isAlphaSessionId,
  summarizeAlphaSessions,
} from "../src/lib/alpha-analytics.mjs";
import { getRoomPresence, ROOM_PRESENCE_TTL_MS, touchRoomPresence } from "../src/lib/room-presence.mjs";
import { safeReturnTo } from "../src/lib/steam-auth.mjs";

const failures = [];
const now = Date.UTC(2026, 7, 1, 12, 0, 0);
const sessionId = "4c79f197-9bd8-4b73-890e-45b311316a85";
const sessions = [
  {
    visitorHash: "player-a",
    startedAt: now - 3 * 24 * 60 * 60 * 1_000,
    lastSeenAt: now - 3 * 24 * 60 * 60 * 1_000 + 5 * 60_000,
    finishedAt: now - 3 * 24 * 60 * 60 * 1_000 + 5 * 60_000,
    roundsAnswered: 2,
    correctAnswers: 1,
    feedback: "fun",
  },
  {
    visitorHash: "player-a",
    startedAt: now - 24 * 60 * 60 * 1_000,
    lastSeenAt: now - 24 * 60 * 60 * 1_000 + 8 * 60_000,
    finishedAt: null,
    roundsAnswered: 3,
    correctAnswers: 3,
    feedback: "too-easy",
  },
  {
    visitorHash: "player-b",
    startedAt: now - 60_000,
    lastSeenAt: now - 30_000,
    finishedAt: null,
    roundsAnswered: 0,
    correctAnswers: 0,
    feedback: "confusing",
  },
  {
    visitorHash: "expired-player",
    startedAt: now - 31 * 24 * 60 * 60 * 1_000,
    lastSeenAt: now - 31 * 24 * 60 * 60 * 1_000,
    finishedAt: null,
    roundsAnswered: 100,
    correctAnswers: 100,
    feedback: "repetitive",
  },
];
const summary = summarizeAlphaSessions(sessions, { now, windowDays: 30, dailyDays: 14 });

if (
  ALPHA_FEEDBACK_OPTIONS.length !== 4 ||
  !["fun", "too-easy", "repetitive", "confusing"].every(isAlphaFeedback) ||
  isAlphaFeedback("raw-comment") ||
  !isAlphaSessionId(sessionId) ||
  isAlphaSessionId("predictable-session")
) {
  failures.push("Alpha feedback or browser-session validation is too permissive.");
}

if (
  summary.sessions !== 3 ||
  summary.players !== 2 ||
  summary.returningPlayers !== 1 ||
  summary.returnRate !== 50 ||
  summary.rounds !== 5 ||
  summary.correct !== 4 ||
  summary.accuracy !== 80 ||
  summary.roundsPerSession !== 1.7 ||
  summary.feedbackTotal !== 3 ||
  summary.feedback.fun !== 1 ||
  summary.feedback.repetitive !== 0 ||
  summary.daily.length !== 14 ||
  summary.daily.reduce((total, day) => total + day.sessions, 0) !== 3
) {
  failures.push("The private alpha summary does not calculate visits, returns, rounds, or feedback correctly.");
}

const roomId = `alpha-presence-test-${sessionId}`;
if (
  touchRoomPresence(roomId, "player-one", now) !== 1 ||
  touchRoomPresence(roomId, "player-one", now + 1_000) !== 1 ||
  touchRoomPresence(roomId, "player-two", now + 2_000) !== 2 ||
  getRoomPresence(roomId, now + ROOM_PRESENCE_TTL_MS + 2_001) !== 0
) {
  failures.push("Room presence does not deduplicate players or expire stale pulses.");
}

if (safeReturnTo("/ops") !== "/ops" || safeReturnTo("/ops/anything") !== "/") {
  failures.push("Steam sign-in cannot return safely to the private alpha dashboard.");
}

if (failures.length) throw new Error(failures.join("\n"));

console.log(
  "Validated ephemeral room presence, 30-day alpha summaries, fixed feedback, and protected ops return URLs.",
);
