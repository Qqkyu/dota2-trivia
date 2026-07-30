#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLIENT_CONSTANT_AUDIT } from "./client-constant-audit.mjs";
import { shopkeeperQuestionIssues } from "../src/lib/shopkeeper-quality.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const questions = JSON.parse(await readFile(join(root, "src", "data", "questions.generated.json"), "utf8")).filter(
  (question) => question.kind === "recipe-component",
);
const failures = [];
const answerSlots = [0, 0, 0, 0];
const itemKeyFromArtwork = (url) => url?.match(/\/items\/([^/?]+)\.png/)?.[1];

if (questions.length < 28) {
  failures.push(`Shopkeeper needs at least 28 curated recipes (found ${questions.length}).`);
}

for (const question of questions) {
  const issues = shopkeeperQuestionIssues(question);
  if (issues.length) failures.push(`${question.id}: ${issues.join(", ")}.`);
  if (question.shopkeeper?.clientBuild !== CLIENT_CONSTANT_AUDIT.clientBuild) {
    failures.push(`${question.id}: recipe choices are not stamped with the audited client build.`);
  }
  if (question.shopkeeper?.componentKey !== question.shopkeeper?.answerItemKeys?.[question.correctIndex]) {
    failures.push(`${question.id}: marked answer does not match the audited component key.`);
  }
  if (
    question.shopkeeper?.targetItemKey !== itemKeyFromArtwork(question.image?.src) ||
    JSON.stringify(question.shopkeeper?.answerItemKeys) !==
      JSON.stringify((question.answerImages ?? []).map(itemKeyFromArtwork))
  ) {
    failures.push(`${question.id}: recipe audit keys drifted away from their displayed item artwork.`);
  }
  if (new Set(question.shopkeeper?.answerItemKeys ?? []).size !== 4) {
    failures.push(`${question.id}: component shelf contains duplicate item keys.`);
  }
  if ((question.answers ?? []).some((answer) => /\brecipe\b/i.test(answer))) {
    failures.push(`${question.id}: recipe scroll leaked onto the component shelf.`);
  }
  answerSlots[question.correctIndex] += 1;
}

if (Math.max(...answerSlots) - Math.min(...answerSlots) > 1) {
  failures.push(`Shopkeeper answer slots are unbalanced (${answerSlots.join(" / ")}).`);
}
if (questions.some((question) => question.image?.src.includes("/travel_boots_2."))) {
  failures.push("Boots of Travel 2's one-part non-scroll recipe must stay out of Shopkeeper.");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${questions.length} non-giveaway Shopkeeper recipes with price-matched shelves and answer slots ${answerSlots.join("/")}.`,
  );
}
