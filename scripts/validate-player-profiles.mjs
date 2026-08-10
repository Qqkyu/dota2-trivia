#!/usr/bin/env node

import { answerStageForRound, summarizePlayerRounds } from "../src/lib/player-profile.mjs";
import {
  createSteamState,
  safeReturnTo,
  sessionTokenHash,
  steamIdFromClaimedId,
  steamLoginUrl,
  steamVerificationBody,
  verifySteamState,
} from "../src/lib/steam-auth.mjs";

const failures = [];
const rounds = [true, true, false, true, true, true, true, true, true, true, true].map((correct, index) => ({
  roundId: `round-${index}`,
  roundNumber: index,
  gameId: "dota2",
  questionId: `question-${index}`,
  questionRevision: `q1_${String(index).padStart(22, "0")}`,
  roundGame: index < 3 ? "spell-link" : "trivia",
  roundFormat: index < 3 ? "spell-link" : "classic-ability-values",
  correct,
  answerStage: index < 3 ? answerStageForRound("spell-link", 14_000 - index * 5_000, 15_000) : null,
  submittedAt: 1_000 + index,
}));
const summary = summarizePlayerRounds(rounds);
const crossReleaseSummary = summarizePlayerRounds([
  { ...rounds[0], roundId: "old-release", roundNumber: 99_999, correct: true, submittedAt: 1_000 },
  { ...rounds[1], roundId: "new-release", roundNumber: 1, correct: false, submittedAt: 2_000 },
]);
const serializedRecentRounds = JSON.stringify(summary.recentRounds);

if (
  summary.answered !== 11 ||
  summary.correct !== 10 ||
  summary.accuracy !== 91 ||
  summary.currentStreak !== 8 ||
  summary.bestStreak !== 8 ||
  summary.bestTenCorrect !== 9 ||
  summary.firstStageCorrect !== 1 ||
  summary.progressiveAnswered !== 3 ||
  summary.formats.length !== 2 ||
  summary.recentRounds.length !== 10 ||
  serializedRecentRounds.includes("questionId") ||
  serializedRecentRounds.includes("questionRevision") ||
  serializedRecentRounds.includes("question-10")
) {
  failures.push("Player summaries are incorrect or expose private catalog identifiers.");
}
if (crossReleaseSummary.currentStreak !== 0 || crossReleaseSummary.recentRounds[0]?.roundId !== "new-release") {
  failures.push("Player chronology incorrectly depends on a content release's round-number sequence.");
}
if (
  answerStageForRound("soundcheck", 7_001, 15_000) !== 2 ||
  answerStageForRound("soundcheck", 7_000, 15_000) !== 3 ||
  answerStageForRound("echo-hunt", 7_000, 15_000) !== 2 ||
  answerStageForRound("aghanim-lab", 11_000, 15_000) !== 1 ||
  answerStageForRound("aghanim-lab", 9_000, 15_000) !== 2 ||
  answerStageForRound("aghanim-lab", 4_000, 15_000) !== 3 ||
  answerStageForRound("quote-hunt", 11_000, 15_000) !== 1 ||
  answerStageForRound("quote-hunt", 9_000, 15_000) !== 2 ||
  answerStageForRound("quote-hunt", 4_000, 15_000) !== 3
) {
  failures.push("Saved progressive-answer stages do not match their live reveal schedules.");
}

const secret = "validation-secret";
const state = createSteamState({ secret, returnTo: "/profile?connected=1", now: 10_000, nonce: "a".repeat(24) });
const verified = verifySteamState(state, { secret, now: 20_000 });
const tampered = verifySteamState(`${state.slice(0, -1)}x`, { secret, now: 20_000 });
const expired = verifySteamState(state, { secret, now: 10_000 + 10 * 60 * 1_000 + 1 });
const login = steamLoginUrl("https://arcade.example", state);
const verification = steamVerificationBody(
  new URLSearchParams({ "openid.mode": "id_res", "openid.claimed_id": "claimed", state: "ignored" }),
);

if (
  verified?.returnTo !== "/profile?connected=1" ||
  tampered ||
  expired ||
  safeReturnTo("https://evil.example") !== "/" ||
  safeReturnTo("//evil.example") !== "/" ||
  steamIdFromClaimedId("https://steamcommunity.com/openid/id/76561198000000000") !== "76561198000000000" ||
  steamIdFromClaimedId("https://evil.example/openid/id/76561198000000000") ||
  login.origin !== "https://steamcommunity.com" ||
  login.searchParams.get("openid.return_to") !==
    `https://arcade.example/api/auth/steam/callback?state=${encodeURIComponent(state)}` ||
  verification.get("openid.mode") !== "check_authentication" ||
  verification.has("state") ||
  !/^[A-Za-z0-9_-]{43}$/.test(sessionTokenHash("session-token"))
) {
  failures.push("Steam OpenID state, redirect, claimed-ID, or session hashing validation failed.");
}

if (failures.length) throw new Error(failures.join("\n"));

console.log("Validated Steam OpenID boundaries and server-owned player record summaries.");
