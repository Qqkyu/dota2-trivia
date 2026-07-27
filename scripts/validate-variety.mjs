#!/usr/bin/env node

import { fixedCycleRotation, varietyShuffle } from "../src/lib/variety.mjs";
import { MAP_READ_GRACE_MS, speedScoreRatio } from "../src/lib/scoring.mjs";

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

const arcadeGames = ["trivia", "shopkeeper", "spell-link", "fogged-vision", "echo-hunt", "quote-hunt", "map-sense"];
const mixedRounds = fixedCycleRotation(arcadeGames, "public-room-regression", 31, 4);
const mixedWindowsAreComplete = mixedRounds
  .slice(0, mixedRounds.length - arcadeGames.length + 1)
  .every((_, index) => new Set(mixedRounds.slice(index, index + arcadeGames.length)).size === arcadeGames.length);

if (
  !mixedWindowsAreComplete ||
  mixedRounds.some((game, index) => index > 0 && game === mixedRounds[index - 1]) ||
  JSON.stringify(mixedRounds) !== JSON.stringify(fixedCycleRotation(arcadeGames, "public-room-regression", 31, 4))
) {
  throw new Error("Mixed Arcade can skip or repeat a game inside its guaranteed seven-round rotation.");
}

const mapKinds = ["map-location", "map-riddle", "map-mirror", "map-relative", "map-scenario", "map-crop"];
const mapFixture = mapKinds.flatMap((kind) =>
  Array.from({ length: kind === "map-location" || kind === "map-crop" ? 24 : 6 }, (_, index) => ({
    id: `${kind}-${index}`,
    kind,
  })),
);
const mapOpening = varietyShuffle(mapFixture, "map-family-regression").slice(0, 24);
const mapOpeningCounts = Object.fromEntries(
  mapKinds.map((kind) => [kind, mapOpening.filter((question) => question.kind === kind).length]),
);

if (
  mapOpening.some((question, index) => index > 0 && question.kind === mapOpening[index - 1].kind) ||
  mapKinds.some((kind) => mapOpeningCounts[kind] < 3) ||
  mapOpeningCounts["map-location"] > 5
) {
  throw new Error(`Map Sense lost its balanced six-family opening: ${JSON.stringify(mapOpeningCounts)}.`);
}

const roundDuration = 12_000;
if (
  speedScoreRatio(roundDuration, roundDuration) !== 1 ||
  speedScoreRatio(roundDuration - MAP_READ_GRACE_MS, roundDuration, MAP_READ_GRACE_MS) !== 1 ||
  speedScoreRatio(roundDuration - MAP_READ_GRACE_MS - 1, roundDuration, MAP_READ_GRACE_MS) >= 1 ||
  speedScoreRatio(0, roundDuration, MAP_READ_GRACE_MS) !== 0 ||
  speedScoreRatio(roundDuration / 2, roundDuration) !== 0.5
) {
  throw new Error("The Map Sense reading grace or the standard speed curve regressed.");
}

console.log(
  `Validated deterministic template, Mixed Arcade, Map Sense family rotation, and ${MAP_READ_GRACE_MS / 1000}s reading grace (${JSON.stringify(mapOpeningCounts)}).`,
);
