#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSpellHint } from "./spell-hints.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const questionsPath = join(root, "src", "data", "questions.generated.json");
const questions = JSON.parse(await readFile(questionsPath, "utf8"));
let updated = 0;

for (const question of questions) {
  if (!question.id?.startsWith("ability-owner:")) continue;

  const ownerName = question.answers[question.correctIndex];
  const explanationPrefix = `${question.eyebrow} belongs to ${ownerName}.`;
  const description = question.explanation.startsWith(explanationPrefix)
    ? question.explanation.slice(explanationPrefix.length)
    : question.explanation.split(". ").slice(1).join(". ");

  question.hint = buildSpellHint(description, ownerName, question.eyebrow, { redactAbility: false });
  updated += 1;
}

await writeFile(questionsPath, `${JSON.stringify(questions, null, 2)}\n`);
console.log(`Backfilled ${updated} answer-safe Spell Link hints.`);
