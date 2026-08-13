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
import { LIVE_ROUND_GAMES, PUBLIC_ROUND_FORMATS } from "../src/lib/arcade-games.mjs";
import { presentProfileRecent, profileRecordsPreview } from "../src/lib/profile-records-state.mjs";
import {
  answerStageLabel,
  compactElapsedLabel,
  groupFormatMastery,
  publicFormatsHaveIdentities,
} from "../src/lib/round-identity.mjs";
import {
  FALLBACK_STEAM_DISPLAY_NAME,
  parseSteamCommunityProfile,
  safeAvatarUrl,
  steamIdentityNeedsEnrichment,
} from "../src/lib/steam-profile.mjs";

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

const publicSteamId = "76561198000000000";
const publicAvatar = "https://avatars.fastly.steamstatic.com/queuearcade_full.jpg";
const communityProfile = parseSteamCommunityProfile(
  `<?xml version="1.0" encoding="UTF-8"?><profile><steamID64>${publicSteamId}</steamID64><steamID><![CDATA[ Queue  Player ]]></steamID><avatarFull><![CDATA[${publicAvatar}]]></avatarFull></profile>`,
  publicSteamId,
);
const mismatchedProfile = parseSteamCommunityProfile(
  `<?xml version="1.0" encoding="UTF-8"?><profile><steamID64>76561198000000001</steamID64><steamID>Other</steamID><avatarFull>${publicAvatar}</avatarFull></profile>`,
  publicSteamId,
);

if (
  communityProfile?.displayName !== "Queue Player" ||
  communityProfile.avatarUrl !== publicAvatar ||
  mismatchedProfile ||
  safeAvatarUrl("http://avatars.steamstatic.com/queuearcade_full.jpg") ||
  safeAvatarUrl("https://evil.example/queuearcade_full.jpg") ||
  safeAvatarUrl(publicAvatar) !== publicAvatar ||
  !steamIdentityNeedsEnrichment({ displayName: FALLBACK_STEAM_DISPLAY_NAME, avatarUrl: null }) ||
  steamIdentityNeedsEnrichment({ displayName: "Queue Player", avatarUrl: publicAvatar })
) {
  failures.push("Public Steam profile parsing or avatar host allowlisting failed.");
}

const mastery = groupFormatMastery([
  { format: "classic-ability-values", answered: 4, correct: 2, accuracy: 50 },
  { format: "classic-item-prices", answered: 2, correct: 2, accuracy: 100 },
  { format: "spell-link", answered: 3, correct: 3, accuracy: 100 },
]);
const classic = mastery.find((row) => row.game === "trivia");
const fogged = mastery.find((row) => row.game === "fogged-vision");

if (
  !publicFormatsHaveIdentities() ||
  mastery.length !== LIVE_ROUND_GAMES.length ||
  PUBLIC_ROUND_FORMATS.length !== 12 ||
  classic?.label !== "Classic Trivia" ||
  classic.look !== "A–D values" ||
  classic.answered !== 6 ||
  classic.accuracy !== 67 ||
  classic.slices.map((slice) => slice.label).join(",") !== "values,prices" ||
  fogged?.accuracy !== null ||
  answerStageLabel(1) !== "early" ||
  answerStageLabel(2) !== "mid" ||
  answerStageLabel(3) !== "late" ||
  compactElapsedLabel(1_000, 1_000 + 45_000) !== "45s" ||
  compactElapsedLabel(1_000, 1_000 + 3 * 60_000) !== "3m"
) {
  failures.push("Profile format identities no longer match the lobby round mix.");
}

for (const size of ["short", "long"]) {
  const fixture = profileRecordsPreview(size);
  const unmatched = presentProfileRecent(fixture.recent, "fogged-vision");
  const matched = presentProfileRecent(fixture.recent, "trivia");
  const unmatchedVisible = unmatched.filter((row) => !row.dimmed).length;
  if (
    fixture.recent.length !== (size === "short" ? 2 : 10) ||
    unmatched.length !== fixture.recent.length ||
    matched.length !== fixture.recent.length ||
    unmatchedVisible !== 0 ||
    matched.filter((row) => row.highlighted).length === 0 ||
    fixture.recent.some((row) => row.game === "fogged-vision")
  ) {
    failures.push(`Selecting a format changes the ${size} recent-answer list instead of dimming it.`);
  }
}

if (failures.length) throw new Error(failures.join("\n"));

console.log("Validated Steam OpenID boundaries and server-owned player record summaries.");
