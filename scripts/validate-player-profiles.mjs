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
import { formatPreviewLeaksAnswer, formatPreviewsFromQuestions } from "../src/lib/format-preview.mjs";
import { profileRecordsPreview } from "../src/lib/profile-records-state.mjs";
import {
  answerStageLabel,
  compactElapsedLabel,
  compareFormatMastery,
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
  summary.formats.find((format) => format.format === "spell-link")?.firstStageCorrect !== 1 ||
  summary.formats.find((format) => format.format === "spell-link")?.secondStageCorrect !== 1 ||
  summary.formats.find((format) => format.format === "spell-link")?.thirdStageCorrect !== 0 ||
  summary.formats.find((format) => format.format === "spell-link")?.firstStageAnswered !== 1 ||
  summary.formats.find((format) => format.format === "spell-link")?.secondStageAnswered !== 1 ||
  summary.formats.find((format) => format.format === "spell-link")?.thirdStageAnswered !== 1 ||
  summary.formats.find((format) => format.format === "spell-link")?.progressiveAnswered !== 3 ||
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
  answerStageForRound("echo-hunt", 7_001, 15_000) !== 2 ||
  answerStageForRound("echo-hunt", 7_000, 15_000) !== 3 ||
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
  PUBLIC_ROUND_FORMATS.length !== 13 ||
  classic?.label !== "Classic Trivia" ||
  classic.look !== "Four choices" ||
  classic.answered !== 6 ||
  classic.accuracy !== 67 ||
  classic.slices.map((slice) => slice.label).join(",") !== "Mana, cooldown, damage,Item gold" ||
  fogged?.accuracy !== null ||
  answerStageLabel(1) !== "early" ||
  answerStageLabel(2) !== "mid" ||
  answerStageLabel(3) !== "late" ||
  compactElapsedLabel(1_000, 1_000 + 45_000) !== "45s" ||
  compactElapsedLabel(1_000, 1_000 + 3 * 60_000) !== "3m"
) {
  failures.push("Profile format identities no longer match the lobby round mix.");
}

const compared = compareFormatMastery(
  [
    {
      format: "classic-ability-values",
      answered: 4,
      correct: 2,
      accuracy: 50,
      firstStageCorrect: 0,
      progressiveAnswered: 0,
    },
    {
      format: "classic-item-prices",
      answered: 2,
      correct: 2,
      accuracy: 100,
      firstStageCorrect: 0,
      progressiveAnswered: 0,
    },
    {
      format: "spell-link",
      answered: 5,
      correct: 4,
      accuracy: 80,
      firstStageCorrect: 2,
      secondStageCorrect: 1,
      thirdStageCorrect: 1,
      firstStageAnswered: 3,
      secondStageAnswered: 1,
      thirdStageAnswered: 1,
      progressiveAnswered: 5,
    },
  ],
  [
    { game: "trivia", total: 20, correct: 8 },
    { game: "spell-link", total: 10, correct: 9 },
  ],
);
const comparedClassic = compared.find((row) => row.game === "trivia");
const comparedSpell = compared.find((row) => row.game === "spell-link");
const comparedFogged = compared.find((row) => row.game === "fogged-vision");
const shortPreview = profileRecordsPreview("short");
const longPreview = profileRecordsPreview("long");

if (
  compared.length !== LIVE_ROUND_GAMES.length ||
  comparedClassic?.you !== 67 ||
  comparedClassic.room !== 40 ||
  comparedSpell?.you !== 80 ||
  comparedSpell.room !== 90 ||
  comparedSpell.early?.correct !== 2 ||
  comparedSpell.early?.answered !== 3 ||
  comparedSpell.clues.map((clue) => `${clue.stage}:${clue.correct}/${clue.answered}`).join(",") !==
    "1:2/3,2:1/1,3:1/1" ||
  comparedFogged?.you !== null ||
  comparedFogged?.room !== null ||
  comparedFogged?.early !== null ||
  comparedFogged?.clues.length !== 0 ||
  shortPreview.formats.some((row) => row.room !== null) ||
  longPreview.formats.find((row) => row.game === "trivia")?.room !== 45 ||
  longPreview.formats.length !== 10
) {
  failures.push("Profile format compare no longer shows you versus the crowd.");
}

const previews = formatPreviewsFromQuestions([
  {
    id: "ability-owner:secret",
    kind: "mana-cost",
    prompt: "How much mana does Shadow Poison cost?",
    answers: ["50", "70", "80", "100"],
    correctIndex: 2,
    explanation: "It costs 80.",
    image: { src: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/poison.png", alt: "Shadow Poison" },
  },
  {
    kind: "fogged-hero",
    prompt: "Who is this hero?",
    image: {
      src: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/pudge.png",
      alt: "Pudge",
    },
  },
  {
    kind: "aghanim-upgrade",
    prompt: "Whose upgrade is this?",
    aghanim: {
      effect: "After using a mobility spell, the next attack burns extra maximum mana.",
      upgradeType: "scepter",
      abilityName: "Blink",
    },
  },
]);
if (
  !previews.trivia?.prompt ||
  !previews.trivia.answers?.includes("80") ||
  formatPreviewLeaksAnswer(previews.trivia) ||
  formatPreviewLeaksAnswer(previews["fogged-vision"]) ||
  formatPreviewLeaksAnswer(previews["aghanim-lab"]) ||
  previews["fogged-vision"]?.image?.alt !== "" ||
  !previews["fogged-vision"]?.fogged ||
  !previews["aghanim-lab"]?.image?.src.includes("ultimate_scepter") ||
  JSON.stringify(previews["aghanim-lab"]).includes("Blink") ||
  longPreview.formats.find((row) => row.game === "trivia")?.preview?.prompt !== "How much does Pipe of Insight cost?" ||
  longPreview.formats.find((row) => row.game === "quote-hunt")?.preview?.detail !==
    "The only thing that could ever make me turn on my allies..."
) {
  failures.push("Format mastery previews leak answers or no longer show a real mini-question.");
}

if (failures.length) throw new Error(failures.join("\n"));

console.log("Validated Steam OpenID boundaries and server-owned player record summaries.");
