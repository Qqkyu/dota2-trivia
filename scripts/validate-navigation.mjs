#!/usr/bin/env node

import { DEFAULT_ARCADE_MODE, arcadeModeHref, resolveArcadeMode } from "../src/lib/arcade-navigation.mjs";

const modes = ["mixed", "trivia", "shopkeeper", "echo-hunt"];
const failures = [];

if (resolveArcadeMode("echo-hunt", modes, DEFAULT_ARCADE_MODE) !== "echo-hunt") {
  failures.push("A valid mode URL does not resolve to its requested game.");
}
if (resolveArcadeMode("not-a-game", modes, DEFAULT_ARCADE_MODE) !== DEFAULT_ARCADE_MODE) {
  failures.push("An invalid mode URL does not fall back to Mixed Arcade.");
}
if (resolveArcadeMode(["trivia"], modes, DEFAULT_ARCADE_MODE) !== DEFAULT_ARCADE_MODE) {
  failures.push("A repeated mode query should not silently choose one value.");
}
if (arcadeModeHref("mixed") !== "/") {
  failures.push("Mixed Arcade no longer points at the canonical home URL.");
}
if (arcadeModeHref("echo-hunt") !== "/?mode=echo-hunt") {
  failures.push("Game links no longer produce stable, shareable mode URLs.");
}

if (failures.length) {
  throw new Error(failures.join("\n"));
}

console.log("Navigation validation passed: canonical home, deep links, and invalid URL fallbacks are intact.");
