#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LIVE_ARCADE_MODES,
  LIVE_ROUND_GAMES,
  PUBLIC_ARCADE_MODE,
  PUBLIC_ROUND_FORMATS,
  publicRoundFormatOccurrenceCounts,
  publicRoundFormatRotation,
  roundFormatForQuestion,
  roundGameForFormat,
} from "../src/lib/arcade-games.mjs";
import { isPlayableClassicTriviaQuestion } from "../src/lib/classic-trivia-quality.mjs";
import { isPlayableShopkeeperQuestion } from "../src/lib/shopkeeper-quality.mjs";
import { varietyShuffle } from "../src/lib/variety.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readQuestions = async (file) => JSON.parse(await readFile(join(root, "src", "data", file), "utf8"));
const [generated, shopkeeper, soundcheck] = await Promise.all([
  readQuestions("questions.generated.json"),
  readQuestions("shopkeeper-questions.json"),
  readQuestions("soundcheck-questions.json"),
]);

const generatedLive = generated.filter(
  (question) =>
    isPlayableClassicTriviaQuestion(question) &&
    (question.kind !== "spell-owner" ||
      ((question.hint?.trim().length ?? 0) >= 18 && !question.hint?.startsWith("No additional mechanical clue"))) &&
    isPlayableShopkeeperQuestion(question),
);
const liveQuestions = [...generatedLive, ...shopkeeper.filter(isPlayableShopkeeperQuestion), ...soundcheck];
const failures = [];

if (LIVE_ARCADE_MODES.length !== 1 || LIVE_ARCADE_MODES[0] !== PUBLIC_ARCADE_MODE) {
  failures.push("More than one public mode is exposed.");
}
if (LIVE_ROUND_GAMES.length !== 7 || PUBLIC_ROUND_FORMATS.length !== 10) {
  failures.push("The public arcade no longer has seven round identities and ten scheduling formats.");
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

const scheduled = [];
for (let roundOffset = 0; roundOffset < 240; roundOffset += 24) {
  const formats = publicRoundFormatRotation(24, roundOffset);
  const cursors = publicRoundFormatOccurrenceCounts(roundOffset);
  for (const format of formats) {
    const pool = pools.get(format) ?? [];
    const cursor = cursors.get(format) ?? 0;
    const question = pool[cursor % pool.length];
    cursors.set(format, cursor + 1);
    if (question) scheduled.push({ format, game: roundGameForFormat(format), question });
  }
}

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
  failures.push("A rolling ten-round window skipped or repeated a public format.");
}
for (const format of PUBLIC_ROUND_FORMATS) {
  const pool = pools.get(format) ?? [];
  const formatRounds = scheduled.filter((round) => round.format === format);
  const opening = formatRounds.slice(0, Math.min(pool.length, formatRounds.length));
  if (new Set(opening.map((round) => round.question.id)).size !== opening.length) {
    failures.push(`${format} repeated a question before exhausting its format pool.`);
  }
}

if (failures.length) {
  throw new Error(failures.join("\n"));
}

const poolCounts = Object.fromEntries([...pools].map(([format, pool]) => [format, pool.length]));
console.log(
  `Validated one ${liveQuestions.length}-question public room across ten continuous formats: ${JSON.stringify(poolCounts)}.`,
);
