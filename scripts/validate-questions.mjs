#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { containsAnswerLeak } from "./spell-hints.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const questions = JSON.parse(await readFile(join(root, "src", "data", "questions.generated.json"), "utf8"));
const metadata = JSON.parse(await readFile(join(root, "src", "data", "trivia-meta.generated.json"), "utf8"));

const failures = [];
const ids = new Set();
const imageUrls = new Set();

if (!Array.isArray(questions) || questions.length < 100) {
  failures.push("The generated deck must contain at least 100 questions.");
}

for (const [index, question] of questions.entries()) {
  const label = question?.id ?? `question ${index}`;

  if (!question?.id || ids.has(question.id)) failures.push(`${label}: missing or duplicate id.`);
  ids.add(question.id);

  if (!Array.isArray(question.answers) || question.answers.length !== 4) {
    failures.push(`${label}: must have exactly four answers.`);
    continue;
  }

  if (new Set(question.answers).size !== 4) failures.push(`${label}: answers must be unique.`);
  if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex > 3) {
    failures.push(`${label}: invalid correctIndex.`);
  }
  if (!question.answers[question.correctIndex]) failures.push(`${label}: correct answer is empty.`);
  if (!/^https:\/\//.test(question.image?.src ?? "")) failures.push(`${label}: image URL is invalid.`);
  if (question.image?.src) imageUrls.add(question.image.src);
  if (
    question.answerImages &&
    (question.answerImages.length !== 4 || question.answerImages.some((image) => !/^https:\/\//.test(image ?? "")))
  ) {
    failures.push(`${label}: answer images must contain four valid HTTPS URLs.`);
  }
  for (const image of question.answerImages ?? []) imageUrls.add(image);
  if (
    (question.id.startsWith("ability-owner:") || question.id.startsWith("item-component:")) &&
    !question.answerImages
  ) {
    failures.push(`${label}: visual arcade rounds require answer images.`);
  }
  if (question.id.startsWith("ability-owner:")) {
    const correctAnswer = question.answers[question.correctIndex];
    if (!question.hint?.trim()) failures.push(`${label}: Spell Link requires an answer-safe hint.`);
    if (question.hint && containsAnswerLeak(question.hint, correctAnswer)) {
      failures.push(`${label}: Spell Link hint leaks the correct hero (${correctAnswer}).`);
    }
  }
  if (!/^https:\/\//.test(question.source?.url ?? "")) failures.push(`${label}: source URL is invalid.`);
  if (question.patch !== metadata.patch) failures.push(`${label}: patch does not match metadata.`);
}

const spellLinkQuestions = questions.filter((question) => question.id.startsWith("ability-owner:"));
const learningSpellCount = spellLinkQuestions.filter((question) => question.difficulty === 1).length;
const veteranSpellCount = spellLinkQuestions.filter((question) => question.difficulty >= 2).length;
const magnusSkewer = spellLinkQuestions.find((question) => question.id === "ability-owner:magnataur_skewer");

if (learningSpellCount < 12 || veteranSpellCount < 12) {
  failures.push(
    `Spell Link needs viable Learning and Veteran pools (found ${learningSpellCount} Learning and ${veteranSpellCount} Veteran).`,
  );
}
if (magnusSkewer?.difficulty !== 1) {
  failures.push("Magnus's highly recognizable Skewer icon must stay out of the Veteran Spell Link pool.");
}

if (metadata.questionCount !== questions.length) {
  failures.push(`Metadata says ${metadata.questionCount} questions, but the deck has ${questions.length}.`);
}
if (metadata.assetValidation?.checkedAt !== metadata.snapshotDate) {
  failures.push("The generated deck must record an artwork check for its snapshot date.");
}
if (metadata.assetValidation?.verifiedAssetCount !== imageUrls.size) {
  failures.push(
    `Metadata says ${metadata.assetValidation?.verifiedAssetCount ?? 0} images were verified, but the deck uses ${imageUrls.size}.`,
  );
}
for (const rejectedId of metadata.assetValidation?.rejectedQuestionIds ?? []) {
  if (ids.has(rejectedId)) failures.push(`${rejectedId}: rejected artwork remains in the playable deck.`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${questions.length} questions across ${Object.keys(metadata.categoryCounts).length} categories for patch ${metadata.patch}.`,
  );
}
