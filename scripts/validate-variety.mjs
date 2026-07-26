#!/usr/bin/env node

import { varietyShuffle } from "../src/lib/variety.mjs";

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

console.log(`Validated a deterministic ${first.length}-round template rotation.`);
