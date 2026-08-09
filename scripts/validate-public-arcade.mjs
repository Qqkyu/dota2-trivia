#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LIVE_ARCADE_MODES,
  LIVE_ROUND_GAMES,
  PUBLIC_ARCADE_MODE,
  PUBLIC_ROUND_FORMATS,
  roundFormatForQuestion,
  roundGameForFormat,
} from "../src/lib/arcade-games.mjs";
import { MIN_INITIAL_ANSWER_TIME_MS, shouldWaitForNextRoundOnEntry } from "../src/lib/arcade-entry.mjs";
import { isPlayableClassicTriviaQuestion } from "../src/lib/classic-trivia-quality.mjs";
import { isPlayableShopkeeperQuestion } from "../src/lib/shopkeeper-quality.mjs";
import { createSemanticPublicDeck } from "../src/lib/semantic-schedule.mjs";
import { varietyShuffle } from "../src/lib/variety.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readQuestions = async (file) => JSON.parse(await readFile(join(root, "src", "data", file), "utf8"));
const [generated, shopkeeper, soundcheck, valueOrder, component, componentStyles] = await Promise.all([
  readQuestions("questions.generated.json"),
  readQuestions("shopkeeper-questions.json"),
  readQuestions("soundcheck-questions.json"),
  readQuestions("value-order-questions.json"),
  readFile(join(root, "src", "components", "queue-arcade.tsx"), "utf8"),
  readFile(join(root, "src", "components", "queue-arcade.module.css"), "utf8"),
]);

const generatedLive = generated.filter(
  (question) =>
    isPlayableClassicTriviaQuestion(question) &&
    (question.kind !== "spell-owner" ||
      ((question.hint?.trim().length ?? 0) >= 18 && !question.hint?.startsWith("No additional mechanical clue"))) &&
    isPlayableShopkeeperQuestion(question),
);
const liveQuestions = [
  ...generatedLive,
  ...shopkeeper.filter(isPlayableShopkeeperQuestion),
  ...soundcheck,
  ...valueOrder,
];
const failures = [];

const entryBoundary = 1_000_000;
const entryRound = {
  phase: "answering",
  answerDeadline: entryBoundary + MIN_INITIAL_ANSWER_TIME_MS,
};
if (
  shouldWaitForNextRoundOnEntry({ ...entryRound, phase: "reveal" }, entryBoundary) !== true ||
  shouldWaitForNextRoundOnEntry(entryRound, entryBoundary + 1) !== true ||
  shouldWaitForNextRoundOnEntry(entryRound, entryBoundary) !== false ||
  shouldWaitForNextRoundOnEntry({ ...entryRound, answerDeadline: entryBoundary + 15_000 }, entryBoundary) !== false
) {
  failures.push("The first-entry gate no longer waits through reveals and short answer windows.");
}

if (LIVE_ARCADE_MODES.length !== 1 || LIVE_ARCADE_MODES[0] !== PUBLIC_ARCADE_MODE) {
  failures.push("More than one public mode is exposed.");
}
if (LIVE_ROUND_GAMES.length !== 8 || PUBLIC_ROUND_FORMATS.length !== 11) {
  failures.push("The public arcade no longer has eight round identities and eleven scheduling formats.");
}
for (const [mode, repeatedLabel] of [
  ["Shopkeeper Rush", /<span>Shopkeeper Rush\b/],
  ["Spell Link", /<span>Spell Link<\/span>/],
  ["Fogged Vision", /<span>Fogged Vision\b/],
  ["Soundcheck", /["`]Soundcheck ·/],
  ["Echo Hunt", /["`]Echo Hunt ·/],
  ["Quote Hunt", /<span>Quote Hunt<\/span>/],
]) {
  if (repeatedLabel.test(component)) {
    failures.push(`The in-round context repeats the top-bar ${mode} label.`);
  }
}
if (!component.includes("<span>Ability identity</span>") || !component.includes("<span>Hero quote</span>")) {
  failures.push("Spell Link or Quote Hunt lost its non-repeating round subtype label.");
}
if (
  !/\.cardTitle svg\s*{[^}]*width:\s*12px;[^}]*height:\s*12px;[^}]*display:\s*block;/s.test(componentStyles) ||
  !/\.progressActions > button svg\s*{[^}]*width:\s*11px;[^}]*height:\s*11px;/s.test(componentStyles)
) {
  failures.push("The recent-round trophy no longer has a square, block-level alignment contract.");
}

const pools = new Map(
  PUBLIC_ROUND_FORMATS.map((format) => [
    format,
    varietyShuffle(
      liveQuestions.filter((question) => roundFormatForQuestion(question) === format),
      `public-arcade-validation:${format}`,
    ),
  ]),
);
const unmapped = liveQuestions.filter((question) => !roundFormatForQuestion(question));
if (unmapped.length) {
  failures.push(`Live questions escaped the format scheduler: ${unmapped.map((question) => question.id).join(", ")}.`);
}
for (const [format, pool] of pools) {
  if (pool.length < 20) failures.push(`${format} has too little depth for the public rotation (${pool.length}).`);
  if (new Set(pool.map((question) => question.id)).size !== pool.length) {
    failures.push(`${format} contains duplicate question IDs.`);
  }
}

const semanticSeed = "public-arcade-validation:semantic";
const scheduled = createSemanticPublicDeck(liveQuestions, {
  formats: PUBLIC_ROUND_FORMATS,
  getFormat: roundFormatForQuestion,
  seed: semanticSeed,
  poolSeedForFormat: (format) => `public-arcade-validation:${format}`,
  length: 240,
}).map((question) => {
  const format = roundFormatForQuestion(question);
  return { format, game: roundGameForFormat(format), question };
});

if (scheduled.length !== 240)
  failures.push(`The public scheduler returned ${scheduled.length} of 240 requested rounds.`);
if (
  scheduled.some(
    (round, index) =>
      roundFormatForQuestion(round.question) !== round.format ||
      (index > 0 && round.game === scheduled[index - 1].game),
  )
) {
  failures.push("The public schedule mismatched a question format or repeated a round family back-to-back.");
}
if (
  scheduled
    .slice(0, scheduled.length - PUBLIC_ROUND_FORMATS.length + 1)
    .some(
      (_, index) =>
        new Set(scheduled.slice(index, index + PUBLIC_ROUND_FORMATS.length).map((round) => round.format)).size !==
        PUBLIC_ROUND_FORMATS.length,
    )
) {
  failures.push("A rolling full-cadence window skipped or repeated a public format.");
}
for (let index = 0; index < scheduled.length; index += 1) {
  const recent = scheduled.slice(Math.max(0, index - 50), index);
  if (recent.some((round) => round.question.id === scheduled[index].question.id)) {
    failures.push(`${scheduled[index].question.id} repeated inside a 50-round public session.`);
    break;
  }
}

if (failures.length) {
  throw new Error(failures.join("\n"));
}

const poolCounts = Object.fromEntries([...pools].map(([format, pool]) => [format, pool.length]));
console.log(
  `Validated one ${liveQuestions.length}-question public room across eleven continuous formats: ${JSON.stringify(poolCounts)}.`,
);
