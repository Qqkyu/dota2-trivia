#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_ROUND_FORMATS, roundFormatForQuestion } from "../src/lib/arcade-games.mjs";
import { isPlayableClassicTriviaQuestion } from "../src/lib/classic-trivia-quality.mjs";
import {
  SEMANTIC_REPEAT_GAP_ROUNDS,
  SEMANTIC_SLOT_COUNT,
  createSemanticPublicDeck,
  createSemanticSlotPlan,
  semanticSubjectForQuestion,
} from "../src/lib/semantic-schedule.mjs";
import { isPlayableShopkeeperQuestion } from "../src/lib/shopkeeper-quality.mjs";

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
const questions = [...generatedLive, ...shopkeeper.filter(isPlayableShopkeeperQuestion), ...soundcheck];
const seed = "semantic-repetition-regression";
const plan = createSemanticSlotPlan(questions, PUBLIC_ROUND_FORMATS, roundFormatForQuestion, seed);
const failures = [];

const missingSubjects = questions.filter(
  (question) => roundFormatForQuestion(question) && !semanticSubjectForQuestion(question, plan.context),
);
if (missingSubjects.length) {
  failures.push(
    `Live questions have no semantic subject: ${missingSubjects.map((question) => question.id).join(", ")}.`,
  );
}
const unmappedAbilitySounds = questions.filter(
  (question) =>
    question.kind === "soundcheck-ability" && !semanticSubjectForQuestion(question, plan.context)?.startsWith("hero:"),
);
if (unmappedAbilitySounds.length) {
  failures.push(
    `Ability sounds are not connected to their heroes: ${unmappedAbilitySounds.map((question) => question.id).join(", ")}.`,
  );
}

for (const format of PUBLIC_ROUND_FORMATS) {
  const counts = plan.counts.get(format) ?? [];
  if (counts.length !== SEMANTIC_SLOT_COUNT || counts.some((count) => count < 1)) {
    failures.push(`${format} has an empty semantic scheduling slot: ${JSON.stringify(counts)}.`);
  }
}

const deckOptions = {
  formats: PUBLIC_ROUND_FORMATS,
  getFormat: roundFormatForQuestion,
  seed,
  poolSeedForFormat: (format) => `${seed}:pool:${format}`,
};
const sampleLength = 10_000;
const scheduled = createSemanticPublicDeck(questions, { ...deckOptions, length: sampleLength });
const batched = [];
for (let offset = 0; offset < sampleLength; offset += 24) {
  batched.push(
    ...createSemanticPublicDeck(questions, {
      ...deckOptions,
      length: Math.min(24, sampleLength - offset),
      roundOffset: offset,
    }),
  );
}
if (scheduled.some((question, index) => question.id !== batched[index]?.id)) {
  failures.push("Semantic scheduling changes when the same rounds are requested in 24-round server batches.");
}

const lastSubjectRound = new Map();
const lastQuestionRound = new Map();
let minimumSubjectGap = Number.POSITIVE_INFINITY;
let minimumQuestionGap = Number.POSITIVE_INFINITY;
for (let round = 0; round < scheduled.length; round += 1) {
  const question = scheduled[round];
  const expectedFormat = PUBLIC_ROUND_FORMATS[round % PUBLIC_ROUND_FORMATS.length];
  if (roundFormatForQuestion(question) !== expectedFormat) {
    failures.push(`Round ${round} contains ${question.id} instead of a ${expectedFormat} question.`);
    break;
  }

  const subject = semanticSubjectForQuestion(question, plan.context);
  const previousSubjectRound = lastSubjectRound.get(subject);
  if (previousSubjectRound !== undefined) {
    const gap = round - previousSubjectRound;
    minimumSubjectGap = Math.min(minimumSubjectGap, gap);
    if (gap <= SEMANTIC_REPEAT_GAP_ROUNDS) {
      failures.push(`${subject} repeats after only ${gap} rounds (${previousSubjectRound} and ${round}).`);
      break;
    }
  }
  lastSubjectRound.set(subject, round);

  const previousQuestionRound = lastQuestionRound.get(question.id);
  if (previousQuestionRound !== undefined) {
    const gap = round - previousQuestionRound;
    minimumQuestionGap = Math.min(minimumQuestionGap, gap);
    if (gap <= 50) {
      failures.push(`${question.id} repeats inside a 50-round session (${previousQuestionRound} and ${round}).`);
      break;
    }
  }
  lastQuestionRound.set(question.id, round);
}

if (failures.length) throw new Error(failures.join("\n"));

console.log(
  `Validated ${sampleLength.toLocaleString("en-US")} synchronized rounds: main subjects stay ${minimumSubjectGap} rounds apart, exact questions stay at least ${minimumQuestionGap} rounds apart, and 24-round batches agree.`,
);
