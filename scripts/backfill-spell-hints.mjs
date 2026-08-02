#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSpellHint } from "./spell-hints.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const questionsPath = join(root, "src", "data", "questions.generated.json");
let source = await readFile(questionsPath, "utf8");
const questions = JSON.parse(source);
let updated = 0;

for (const question of questions) {
  if (!question.id?.startsWith("ability-owner:")) continue;

  const ownerName = question.answers[question.correctIndex];
  const explanationPrefix = `${question.eyebrow} belongs to ${ownerName}.`;
  const description = question.explanation.startsWith(explanationPrefix)
    ? question.explanation.slice(explanationPrefix.length)
    : question.explanation.split(". ").slice(1).join(". ");

  const nextHint = buildSpellHint(description, ownerName, question.eyebrow, {
    fullDescription: true,
  });
  const currentField = `"hint": ${JSON.stringify(question.hint)}`;
  const nextField = `"hint": ${JSON.stringify(nextHint)}`;
  if (!source.includes(currentField)) {
    throw new Error(`${question.id}: could not find the existing hint in the generated source.`);
  }
  source = source.replace(currentField, nextField);
  updated += 1;
}

await writeFile(questionsPath, source);
console.log(`Backfilled ${updated} answer-safe Spell Link hints.`);
