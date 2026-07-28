#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const questions = JSON.parse(await readFile(join(root, "src", "data", "counterplay-questions.json"), "utf8"));
const metadata = JSON.parse(await readFile(join(root, "src", "data", "trivia-meta.generated.json"), "utf8"));

const expectedKinds = {
  "debuff-immunity": "counterplay-immunity",
  "basic-dispel": "counterplay-basic-dispel",
  "strong-dispel": "counterplay-strong-dispel",
  "offensive-dispel": "counterplay-nullifier",
  "spell-block": "counterplay-spell-block",
  "spell-reflect": "counterplay-spell-reflect",
};
const failures = [];
const ids = new Set();
const answerSets = new Set();
const familyCounts = Object.fromEntries(Object.keys(expectedKinds).map((family) => [family, 0]));
const learningCounts = Object.fromEntries(Object.keys(expectedKinds).map((family) => [family, 0]));
const veteranCounts = Object.fromEntries(Object.keys(expectedKinds).map((family) => [family, 0]));
const answerPositionCounts = [0, 0, 0, 0];

if (!Array.isArray(questions) || questions.length < 60) {
  failures.push(`Counterplay needs at least 60 audited questions (found ${questions.length ?? 0}).`);
}

for (const [index, question] of questions.entries()) {
  const label = question?.id ?? `question ${index}`;
  const family = question?.counterplay?.family;
  const expectedKind = expectedKinds[family];

  if (!question?.id || ids.has(question.id)) failures.push(`${label}: missing or duplicate id.`);
  ids.add(question.id);
  if (!expectedKind || question.kind !== expectedKind) {
    failures.push(`${label}: family and question kind do not match.`);
  }
  if (!question.id.startsWith(`${question.kind}:`)) failures.push(`${label}: id must be namespaced by kind.`);
  if (question.category !== "Mechanics") failures.push(`${label}: Counterplay must use the Mechanics category.`);
  if (![1, 2, 3].includes(question.difficulty)) failures.push(`${label}: invalid difficulty.`);
  if (question.patch !== metadata.patch) failures.push(`${label}: patch does not match trivia metadata.`);
  if (!/^OpenDota game constants · 2026-07-28$/.test(question.source?.label ?? "")) {
    failures.push(`${label}: source snapshot is missing or stale.`);
  }
  if (question.source?.url !== "https://docs.opendota.com/") failures.push(`${label}: source URL is invalid.`);
  if ((question.prompt?.trim().split(/\s+/).length ?? 99) > 5) {
    failures.push(`${label}: prompt is too slow to scan.`);
  }
  if (!question.counterplay?.tool?.trim()) failures.push(`${label}: mechanic tool is missing.`);

  if (!Array.isArray(question.answers) || question.answers.length !== 4) {
    failures.push(`${label}: must have exactly four answers.`);
    continue;
  }
  if (new Set(question.answers).size !== 4) failures.push(`${label}: answers must be unique.`);
  const answerSet = [...question.answers].sort().join("|");
  if (answerSets.has(answerSet)) failures.push(`${label}: duplicate four-option matchup.`);
  answerSets.add(answerSet);
  if (
    !Array.isArray(question.answerImages) ||
    question.answerImages.length !== 4 ||
    question.answerImages.some(
      (image) =>
        !/^https:\/\/cdn\.cloudflare\.steamstatic\.com\/apps\/dota2\/images\/dota_react\/abilities\/.+\.png$/.test(
          image,
        ),
    )
  ) {
    failures.push(`${label}: answer ability artwork is incomplete.`);
  }
  if (question.answerImageKind !== "ability") failures.push(`${label}: answers must use ability artwork.`);
  if (
    !/^https:\/\/cdn\.cloudflare\.steamstatic\.com\/apps\/dota2\/images\/dota_react\/(?:items|abilities)\/.+\.png$/.test(
      question.image?.src ?? "",
    )
  ) {
    failures.push(`${label}: mechanic artwork is invalid.`);
  }

  const outcomes = question.counterplay?.outcomes;
  if (!Array.isArray(outcomes) || outcomes.length !== 4 || outcomes.filter(Boolean).length !== 1) {
    failures.push(`${label}: must record exactly one true interaction outcome.`);
  }
  if (
    !Number.isInteger(question.correctIndex) ||
    question.correctIndex < 0 ||
    question.correctIndex > 3 ||
    outcomes?.[question.correctIndex] !== true
  ) {
    failures.push(`${label}: correctIndex does not point at the audited interaction.`);
  } else {
    answerPositionCounts[question.correctIndex] += 1;
    if (!question.explanation?.includes(question.answers[question.correctIndex])) {
      failures.push(`${label}: explanation does not name the correct interaction.`);
    }
  }

  if (expectedKind) {
    familyCounts[family] += 1;
    if (question.difficulty === 1) learningCounts[family] += 1;
    if (question.difficulty >= 2) veteranCounts[family] += 1;
  }
}

for (const family of Object.keys(expectedKinds)) {
  if (familyCounts[family] < 10) {
    failures.push(`${family}: needs at least 10 matchups (found ${familyCounts[family]}).`);
  }
  if (learningCounts[family] < 2 || veteranCounts[family] < 7) {
    failures.push(
      `${family}: needs viable Learning and Veteran pools (found ${learningCounts[family]} and ${veteranCounts[family]}).`,
    );
  }
}

if (Math.max(...answerPositionCounts) - Math.min(...answerPositionCounts) > 1) {
  failures.push(`Correct answer positions are unbalanced: ${JSON.stringify(answerPositionCounts)}.`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${questions.length} Counterplay questions across six audited mechanics (${JSON.stringify(
      familyCounts,
    )}; answer slots ${JSON.stringify(answerPositionCounts)}).`,
  );
}
