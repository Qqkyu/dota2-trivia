#!/usr/bin/env node

import { fixedCycleRotation, varietyShuffle } from "../src/lib/variety.mjs";

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

console.log(
  `Validated a deterministic ${first.length}-round template rotation and ${mixedRounds.length}-round Mixed Arcade cycle.`,
);
