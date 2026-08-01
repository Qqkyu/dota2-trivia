#!/usr/bin/env node

import {
  ARCADE_LOBBY_PATH,
  DEFAULT_ARCADE_MODE,
  PUBLIC_ARCADE_PATH,
  arcadeModeHref,
  arcadeViewForPathname,
  resolveArcadeMode,
} from "../src/lib/arcade-navigation.mjs";
import { LIVE_ARCADE_MODES } from "../src/lib/arcade-games.mjs";

const modes = [...LIVE_ARCADE_MODES];
const failures = [];

if (modes.length !== 1 || modes[0] !== DEFAULT_ARCADE_MODE) {
  failures.push("The game catalog exposes more than one public arcade room.");
}
if (resolveArcadeMode("not-a-game", modes, DEFAULT_ARCADE_MODE) !== DEFAULT_ARCADE_MODE) {
  failures.push("An invalid mode URL does not fall back to Queue Arcade.");
}
for (const legacyMode of [
  "trivia",
  "shopkeeper",
  "spell-link",
  "fogged-vision",
  "echo-hunt",
  "soundcheck",
  "quote-hunt",
  "map-sense",
  "counterplay",
]) {
  if (resolveArcadeMode(legacyMode, modes, DEFAULT_ARCADE_MODE) !== DEFAULT_ARCADE_MODE) {
    failures.push(`The legacy ${legacyMode} deep link is still treated as a separate public mode.`);
  }
}
if (resolveArcadeMode(["trivia"], modes, DEFAULT_ARCADE_MODE) !== DEFAULT_ARCADE_MODE) {
  failures.push("A repeated mode query should not silently choose one value.");
}
if (arcadeModeHref("mixed") !== "/") {
  failures.push("Queue Arcade no longer points at the canonical home URL.");
}
if (arcadeModeHref("echo-hunt") !== "/") {
  failures.push("A retired mode link still creates a separate browser destination.");
}
if (
  ARCADE_LOBBY_PATH !== "/" ||
  PUBLIC_ARCADE_PATH !== "/play" ||
  arcadeViewForPathname(ARCADE_LOBBY_PATH) !== "lobby" ||
  arcadeViewForPathname(PUBLIC_ARCADE_PATH) !== "play" ||
  arcadeViewForPathname("/calibration") !== "lobby"
) {
  failures.push("The lobby and live arcade no longer resolve to distinct canonical paths.");
}

if (failures.length) {
  throw new Error(failures.join("\n"));
}

console.log("Navigation validation passed: canonical / and /play views plus legacy mode fallbacks are intact.");
