#!/usr/bin/env node

import { varietyShuffle } from "../src/lib/variety.mjs";
import {
  LIVE_ROUND_GAMES,
  PUBLIC_ROUND_FORMATS,
  publicRoundFormatRotation,
  roundFormatForQuestion,
  roundGameForFormat,
} from "../src/lib/arcade-games.mjs";
import { speedScoreRatio } from "../src/lib/scoring.mjs";

const fixture = [
  ...Array.from({ length: 12 }, (_, index) => ({ id: `numeric-${index}`, kind: "numeric" })),
  ...Array.from({ length: 4 }, (_, index) => ({ id: `visual-${index}`, kind: "visual" })),
  ...Array.from({ length: 4 }, (_, index) => ({ id: `comparison-${index}`, kind: "comparison" })),
];
const first = varietyShuffle(fixture, "regression-seed");
const second = varietyShuffle(fixture, "regression-seed");
const openingKinds = first.slice(0, 12).map((question) => question.kind);
const adjacentOpeningRepeat = openingKinds.some((kind, index) => index > 0 && kind === openingKinds[index - 1]);

if (
  first.length !== fixture.length ||
  new Set(first.map((question) => question.id)).size !== fixture.length ||
  JSON.stringify(first) !== JSON.stringify(second) ||
  adjacentOpeningRepeat
) {
  throw new Error("The deterministic variety scheduler repeated or lost a question in its balanced opening.");
}

const hiddenDifficultyFixture = ["abilities", "items"].flatMap((kind) =>
  [1, 2, 3].flatMap((difficulty) =>
    Array.from({ length: 6 }, (_, index) => ({
      id: `${kind}-${difficulty}-${index}`,
      kind,
      difficulty,
    })),
  ),
);
const hiddenDifficultyOpening = varietyShuffle(hiddenDifficultyFixture, "hidden-difficulty-regression").slice(0, 18);
const hiddenDifficultyCounts = Object.fromEntries(
  [1, 2, 3].map((difficulty) => [
    difficulty,
    hiddenDifficultyOpening.filter((question) => question.difficulty === difficulty).length,
  ]),
);
const hasDifficultyStreak = hiddenDifficultyOpening.some(
  (question, index) =>
    index > 1 &&
    question.difficulty === hiddenDifficultyOpening[index - 1].difficulty &&
    question.difficulty === hiddenDifficultyOpening[index - 2].difficulty,
);
if (hasDifficultyStreak || Object.values(hiddenDifficultyCounts).some((count) => count !== 6)) {
  throw new Error(`The hidden difficulty cadence drifted: ${JSON.stringify(hiddenDifficultyCounts)}.`);
}

const arcadeGames = [...LIVE_ROUND_GAMES];
const arcadeFormats = [...PUBLIC_ROUND_FORMATS];
const mixedFormats = publicRoundFormatRotation(37, 4);
const mixedWindowsAreComplete = mixedFormats
  .slice(0, mixedFormats.length - arcadeFormats.length + 1)
  .every((_, index) => new Set(mixedFormats.slice(index, index + arcadeFormats.length)).size === arcadeFormats.length);
const gameCounts = Object.fromEntries(
  arcadeGames.map((game) => [game, arcadeFormats.filter((format) => roundGameForFormat(format) === game).length]),
);
const adjacentFamilyRepeat = arcadeFormats.some(
  (format, index) =>
    roundGameForFormat(format) === roundGameForFormat(arcadeFormats[(index + 1) % arcadeFormats.length]),
);

if (
  arcadeGames.length !== 8 ||
  arcadeGames.includes("map-sense") ||
  arcadeGames.includes("counterplay") ||
  arcadeFormats.length !== 11 ||
  new Set(arcadeFormats).size !== arcadeFormats.length ||
  !mixedWindowsAreComplete ||
  adjacentFamilyRepeat ||
  gameCounts.trivia !== 3 ||
  gameCounts.shopkeeper !== 2 ||
  arcadeGames.some((game) => !["trivia", "shopkeeper"].includes(game) && gameCounts[game] !== 1) ||
  JSON.stringify(mixedFormats) !== JSON.stringify(publicRoundFormatRotation(37, 4))
) {
  throw new Error(`The public arcade format cadence drifted: ${JSON.stringify(gameCounts)}.`);
}

const expectedFormatsByKind = {
  "mana-cost": "classic-ability-values",
  "hero-stat-duel": "classic-hero-stats",
  "item-price-duel": "classic-item-prices",
  "shopkeeper-real-recipe": "shopkeeper-builds",
  "shopkeeper-upgrade-path": "shopkeeper-paths",
  "spell-owner": "spell-link",
  "fogged-hero": "fogged-vision",
  "hero-voice": "echo-hunt",
  "soundcheck-item": "soundcheck",
  "hero-quote": "quote-hunt",
  "value-order-item": "value-order",
  "value-order-cooldown": "value-order",
};
if (
  Object.entries(expectedFormatsByKind).some(
    ([kind, expectedFormat]) => roundFormatForQuestion({ kind }) !== expectedFormat,
  ) ||
  roundFormatForQuestion({ kind: "map-crop" }) !== null ||
  roundFormatForQuestion({ kind: "counterplay-immunity" }) !== null
) {
  throw new Error("A live question kind maps to the wrong public round format, or a retired kind returned.");
}

const soundcheckFixture = ["soundcheck-ability", "soundcheck-item"].flatMap((kind) =>
  ["single", "sequence"].flatMap((format) =>
    Array.from({ length: format === "single" ? 18 : 6 }, (_, index) => ({
      id: `${kind}-${format}-${index}`,
      kind,
      format,
      varietyKey: `${kind}:${format}`,
    })),
  ),
);
const soundcheckOpening = varietyShuffle(soundcheckFixture, "soundcheck-family-regression").slice(0, 24);
const soundcheckFullRotation = varietyShuffle(soundcheckFixture, "soundcheck-family-regression");
const soundcheckCounts = Object.fromEntries(
  ["soundcheck-ability", "soundcheck-item"].map((kind) => [
    kind,
    soundcheckOpening.filter((question) => question.kind === kind).length,
  ]),
);
const soundcheckFormatCounts = Object.fromEntries(
  ["single", "sequence"].map((format) => [
    format,
    soundcheckOpening.filter((question) => question.format === format).length,
  ]),
);
if (
  soundcheckOpening.some((question, index) => index > 0 && question.kind === soundcheckOpening[index - 1].kind) ||
  Object.values(soundcheckCounts).some((count) => count !== 12) ||
  soundcheckFormatCounts.single !== 18 ||
  soundcheckFormatCounts.sequence !== 6 ||
  soundcheckFullRotation.some(
    (question, index) =>
      index > 5 &&
      soundcheckFullRotation.slice(index - 6, index + 1).every((candidate) => candidate.format === question.format),
  ) ||
  soundcheckFullRotation
    .slice(0, soundcheckFullRotation.length - 7)
    .some(
      (_, index) => new Set(soundcheckFullRotation.slice(index, index + 8).map((question) => question.format)).size < 2,
    )
) {
  throw new Error(
    `Soundcheck lost its family/format rotation: ${JSON.stringify(soundcheckCounts)}, ${JSON.stringify(soundcheckFormatCounts)}.`,
  );
}

const roundDuration = 12_000;
if (
  speedScoreRatio(roundDuration, roundDuration) !== 1 ||
  speedScoreRatio(0, roundDuration) !== 0 ||
  speedScoreRatio(roundDuration / 2, roundDuration) !== 0.5
) {
  throw new Error("The standard speed curve regressed.");
}

console.log(
  `Validated deterministic templates, hidden difficulty cadence ${JSON.stringify(hiddenDifficultyCounts)}, eleven-format public arcade cadence ${JSON.stringify(gameCounts)}, and Soundcheck family rotation (${JSON.stringify(soundcheckCounts)} / ${JSON.stringify(soundcheckFormatCounts)}).`,
);
