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
const audioUrls = new Set();
const isVoiceVocalization = (word) =>
  /^(?:a+h+|h+a+h*|h+e+h+|h+o+h*|h+u+h+|(?:ha){2,}h?|(?:ah){2,}a?|(?:he){2,}h?|(?:eh){2,}e?|(?:ho){2,}h?|(?:oh){2,}o?|hm+|hmm+|e+h+|o+h+|u+gh+|gr+r+|ar+gh+)$/i.test(
    word,
  );
const allowedKinds = new Set([
  "spell-owner",
  "mana-cost",
  "cooldown",
  "ability-damage",
  "hero-primary-attribute",
  "hero-move-speed",
  "item-cost",
  "recipe-component",
  "hero-stat-duel",
  "hero-intruder",
  "ability-detective",
  "recipe-upgrade",
  "item-price-duel",
  "fogged-hero",
  "hero-voice",
  "hero-quote",
]);
const artworkOptionalKinds = new Set(["hero-stat-duel", "hero-intruder", "item-price-duel", "hero-quote"]);

if (!Array.isArray(questions) || questions.length < 100) {
  failures.push("The generated deck must contain at least 100 questions.");
}

for (const [index, question] of questions.entries()) {
  const label = question?.id ?? `question ${index}`;

  if (!question?.id || ids.has(question.id)) failures.push(`${label}: missing or duplicate id.`);
  ids.add(question.id);
  if (!allowedKinds.has(question.kind)) failures.push(`${label}: missing or unknown question kind.`);

  if (!Array.isArray(question.answers) || question.answers.length !== 4) {
    failures.push(`${label}: must have exactly four answers.`);
    continue;
  }

  if (new Set(question.answers).size !== 4) failures.push(`${label}: answers must be unique.`);
  if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex > 3) {
    failures.push(`${label}: invalid correctIndex.`);
  }
  if (!question.answers[question.correctIndex]) failures.push(`${label}: correct answer is empty.`);
  if (!artworkOptionalKinds.has(question.kind) && !/^https:\/\//.test(question.image?.src ?? "")) {
    failures.push(`${label}: image URL is invalid.`);
  }
  if (question.image && !/^https:\/\//.test(question.image.src ?? "")) failures.push(`${label}: image URL is invalid.`);
  if (question.image?.src) imageUrls.add(question.image.src);
  if (
    question.answerImages &&
    (question.answerImages.length !== 4 || question.answerImages.some((image) => !/^https:\/\//.test(image ?? "")))
  ) {
    failures.push(`${label}: answer images must contain four valid HTTPS URLs.`);
  }
  if (question.answerImages && !["ability", "hero", "item"].includes(question.answerImageKind)) {
    failures.push(`${label}: visual answers must declare their artwork kind.`);
  }
  for (const image of question.answerImages ?? []) imageUrls.add(image);
  if (
    [
      "spell-owner",
      "recipe-component",
      "ability-detective",
      "recipe-upgrade",
      "hero-stat-duel",
      "hero-intruder",
      "item-price-duel",
      "hero-voice",
      "hero-quote",
    ].includes(question.kind) &&
    !question.answerImages
  ) {
    failures.push(`${label}: visual arcade rounds require answer images.`);
  }
  if (question.kind === "spell-owner") {
    const correctAnswer = question.answers[question.correctIndex];
    if (!question.hint?.trim()) failures.push(`${label}: Spell Link requires an answer-safe hint.`);
    if (question.hint && containsAnswerLeak(question.hint, correctAnswer)) {
      failures.push(`${label}: Spell Link hint leaks the correct hero (${correctAnswer}).`);
    }
  }
  if (
    question.kind === "ability-detective" &&
    containsAnswerLeak(question.detail ?? "", question.answers[question.correctIndex])
  ) {
    failures.push(`${label}: Ability Detective clue leaks the correct ability.`);
  }
  if (question.kind === "hero-voice") {
    if (!/^https:\/\//.test(question.audio?.src ?? ""))
      failures.push(`${label}: Echo Hunt requires a valid audio URL.`);
    if (question.audio?.src) audioUrls.add(question.audio.src);
    if (/(?:^|[_:-])(laugh|chuckle|giggle)(?:[_:-]|$)/i.test(question.id)) {
      failures.push(`${label}: Echo Hunt must use a proper spoken line, not a laugh.`);
    }
  } else if (question.audio) {
    failures.push(`${label}: unexpected audio payload.`);
  }
  if (question.kind === "hero-quote") {
    const quoteWords = question.detail?.match(/[a-z]+(?:['’-][a-z]+)*/gi) ?? [];
    const vocalizations = quoteWords.filter(isVoiceVocalization);
    const correctAnswer = question.answers[question.correctIndex];
    if ((question.detail?.length ?? 0) < 28 || quoteWords.length < 5) {
      failures.push(`${label}: Quote Hunt requires a substantial spoken line.`);
    }
    if (vocalizations.some((word) => word.length >= 4) || vocalizations.length >= 2) {
      failures.push(`${label}: Quote Hunt must use a proper line without laugh-heavy vocalizations.`);
    }
    if (containsAnswerLeak(question.detail ?? "", correctAnswer)) {
      failures.push(`${label}: Quote Hunt line leaks the correct hero.`);
    }
    if (/(?:^|[_:-])(laugh|chuckle|giggle)(?:[_:-]|$)/i.test(question.id)) {
      failures.push(`${label}: Quote Hunt must never use a laugh or vocalization.`);
    }
  }
  if (!/^https:\/\//.test(question.source?.url ?? "")) failures.push(`${label}: source URL is invalid.`);
  if (question.patch !== metadata.patch) failures.push(`${label}: patch does not match metadata.`);
}

const spellLinkQuestions = questions.filter((question) => question.kind === "spell-owner");
const foggedQuestions = questions.filter((question) => question.kind === "fogged-hero");
const voiceQuestions = questions.filter((question) => question.kind === "hero-voice");
const quoteQuestions = questions.filter((question) => question.kind === "hero-quote");
const learningSpellCount = spellLinkQuestions.filter((question) => question.difficulty === 1).length;
const veteranSpellCount = spellLinkQuestions.filter((question) => question.difficulty >= 2).length;
const magnusSkewer = spellLinkQuestions.find((question) => question.id === "ability-owner:magnataur_skewer");

if (learningSpellCount < 12 || veteranSpellCount < 12) {
  failures.push(
    `Spell Link needs viable approachable and demanding tiers (found ${learningSpellCount} approachable and ${veteranSpellCount} demanding).`,
  );
}
if (foggedQuestions.length < 36) failures.push(`Fogged Vision needs at least 36 playable heroes.`);
if (voiceQuestions.length < 32) failures.push(`Echo Hunt needs at least 32 verified hero clips.`);
if (quoteQuestions.length < 32) failures.push(`Quote Hunt needs at least 32 proper hero lines.`);
if (magnusSkewer?.difficulty !== 1) {
  failures.push("Magnus's highly recognizable Skewer icon must remain in the approachable Spell Link tier.");
}

if (metadata.questionCount !== questions.length) {
  failures.push(`Metadata says ${metadata.questionCount} questions, but the deck has ${questions.length}.`);
}
if (!metadata.contentVersion?.startsWith(`${metadata.patch}-`)) {
  failures.push("The content version must namespace deck changes beneath the gameplay patch.");
}
for (const kind of allowedKinds) {
  const actual = questions.filter((question) => question.kind === kind).length;
  if ((metadata.kindCounts?.[kind] ?? 0) !== actual) {
    failures.push(`${kind}: metadata count does not match the generated deck.`);
  }
}
if (metadata.assetValidation?.checkedAt !== metadata.snapshotDate) {
  failures.push("The generated deck must record an artwork check for its snapshot date.");
}
if (metadata.assetValidation?.verifiedAssetCount !== imageUrls.size) {
  failures.push(
    `Metadata says ${metadata.assetValidation?.verifiedAssetCount ?? 0} images were verified, but the deck uses ${imageUrls.size}.`,
  );
}
if (metadata.assetValidation?.verifiedAudioCount !== audioUrls.size) {
  failures.push(
    `Metadata says ${metadata.assetValidation?.verifiedAudioCount ?? 0} audio clips were verified, but the deck uses ${audioUrls.size}.`,
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
