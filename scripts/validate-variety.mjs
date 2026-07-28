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

const arcadeGames = [
  "trivia",
  "shopkeeper",
  "spell-link",
  "fogged-vision",
  "echo-hunt",
  "soundcheck",
  "quote-hunt",
  "map-sense",
  "counterplay",
];
const mixedRounds = fixedCycleRotation(arcadeGames, "public-room-regression", 31, 4);
const mixedWindowsAreComplete = mixedRounds
  .slice(0, mixedRounds.length - arcadeGames.length + 1)
  .every((_, index) => new Set(mixedRounds.slice(index, index + arcadeGames.length)).size === arcadeGames.length);

if (
  !mixedWindowsAreComplete ||
  mixedRounds.some((game, index) => index > 0 && game === mixedRounds[index - 1]) ||
  JSON.stringify(mixedRounds) !== JSON.stringify(fixedCycleRotation(arcadeGames, "public-room-regression", 31, 4))
) {
  throw new Error("Mixed Arcade can skip or repeat a game inside its guaranteed nine-round rotation.");
}

const soundcheckFixture = ["soundcheck-ability", "soundcheck-item"].flatMap((kind) =>
  Array.from({ length: 12 }, (_, index) => ({ id: `${kind}-${index}`, kind })),
);
const soundcheckOpening = varietyShuffle(soundcheckFixture, "soundcheck-family-regression").slice(0, 16);
const soundcheckCounts = Object.fromEntries(
  ["soundcheck-ability", "soundcheck-item"].map((kind) => [
    kind,
    soundcheckOpening.filter((question) => question.kind === kind).length,
  ]),
);
if (
  soundcheckOpening.some((question, index) => index > 0 && question.kind === soundcheckOpening[index - 1].kind) ||
  Object.values(soundcheckCounts).some((count) => count !== 8)
) {
  throw new Error(`Soundcheck lost its ability/item rotation: ${JSON.stringify(soundcheckCounts)}.`);
}

const counterplayKinds = [
  "counterplay-immunity",
  "counterplay-basic-dispel",
  "counterplay-strong-dispel",
  "counterplay-nullifier",
  "counterplay-spell-block",
  "counterplay-spell-reflect",
];
const counterplayFixture = counterplayKinds.flatMap((kind) =>
  Array.from({ length: kind === "counterplay-immunity" ? 12 : 10 }, (_, index) => ({
    id: `${kind}-${index}`,
    kind,
  })),
);
const counterplayOpening = varietyShuffle(counterplayFixture, "counterplay-family-regression").slice(0, 24);
const counterplayOpeningCounts = Object.fromEntries(
  counterplayKinds.map((kind) => [kind, counterplayOpening.filter((question) => question.kind === kind).length]),
);
if (
  counterplayOpening.some((question, index) => index > 0 && question.kind === counterplayOpening[index - 1].kind) ||
  counterplayKinds.some((kind) => counterplayOpeningCounts[kind] < 3 || counterplayOpeningCounts[kind] > 5)
) {
  throw new Error(`Counterplay lost its balanced six-family opening: ${JSON.stringify(counterplayOpeningCounts)}.`);
}

const mapKinds = [
  "map-location",
  "map-riddle",
  "map-mirror",
  "map-relative",
  "map-scenario",
  "map-crop",
  "map-camp-block",
  "map-stack-route",
  "map-tp-in",
];
const mapFixture = mapKinds.flatMap((kind) =>
  Array.from(
    {
      length: ["map-location", "map-crop", "map-camp-block", "map-stack-route", "map-tp-in"].includes(kind) ? 24 : 6,
    },
    (_, index) => ({
      id: `${kind}-${index}`,
      kind,
    }),
  ),
);
const mapOpening = varietyShuffle(mapFixture, "map-family-regression").slice(0, 24);
const mapOpeningCounts = Object.fromEntries(
  mapKinds.map((kind) => [kind, mapOpening.filter((question) => question.kind === kind).length]),
);

if (
  mapOpening.some((question, index) => index > 0 && question.kind === mapOpening[index - 1].kind) ||
  mapKinds.some((kind) => mapOpeningCounts[kind] < 2 || mapOpeningCounts[kind] > 3) ||
  mapOpeningCounts["map-location"] > 5
) {
  throw new Error(`Map Sense lost its balanced nine-family opening: ${JSON.stringify(mapOpeningCounts)}.`);
}

const veteranMapKinds = ["map-crop", "map-camp-block", "map-stack-route", "map-tp-in"];
const veteranMapFixture = veteranMapKinds.flatMap((kind) =>
  Array.from({ length: 24 }, (_, index) => ({ id: `veteran-${kind}-${index}`, kind })),
);
const veteranMapOpening = varietyShuffle(veteranMapFixture, "veteran-map-family-regression").slice(0, 24);
const veteranMapCounts = Object.fromEntries(
  veteranMapKinds.map((kind) => [kind, veteranMapOpening.filter((question) => question.kind === kind).length]),
);
if (
  veteranMapOpening.some((question, index) => index > 0 && question.kind === veteranMapOpening[index - 1].kind) ||
  veteranMapKinds.some((kind) => veteranMapCounts[kind] !== 6)
) {
  throw new Error(`Veteran Map Sense lost its four-family rotation: ${JSON.stringify(veteranMapCounts)}.`);
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
  `Validated deterministic template, nine-game Mixed Arcade, Soundcheck, Counterplay and Map Sense family rotation, and ${MAP_READ_GRACE_MS / 1000}s reading grace (Soundcheck ${JSON.stringify(soundcheckCounts)}, Counterplay ${JSON.stringify(counterplayOpeningCounts)}, Map Open ${JSON.stringify(mapOpeningCounts)}, Veteran ${JSON.stringify(veteranMapCounts)}).`,
);
