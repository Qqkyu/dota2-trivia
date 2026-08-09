#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { auditAudioAssets, auditImageAssets, questionAudioUrls, questionImageUrls } from "./image-assets.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [generatedQuestions, soundcheckQuestions, shopkeeperQuestions, valueOrderQuestions] = await Promise.all([
  readFile(join(root, "src", "data", "questions.generated.json"), "utf8").then(JSON.parse),
  readFile(join(root, "src", "data", "soundcheck-questions.json"), "utf8").then(JSON.parse),
  readFile(join(root, "src", "data", "shopkeeper-questions.json"), "utf8").then(JSON.parse),
  readFile(join(root, "src", "data", "value-order-questions.json"), "utf8").then(JSON.parse),
]);
const questions = [...generatedQuestions, ...soundcheckQuestions, ...shopkeeperQuestions, ...valueOrderQuestions];
const [images, audio] = await Promise.all([auditImageAssets(questions), auditAudioAssets(questions)]);
const failures = questions.flatMap((question) => {
  const missing = [
    ...questionImageUrls(question).filter((url) => !images.availability.get(url)),
    ...questionAudioUrls(question).filter((url) => !audio.availability.get(url)),
  ];
  return missing.length ? [`${question.id}: ${missing.join(", ")}`] : [];
});

if (failures.length) {
  console.error(`Found unavailable question assets:\n${failures.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(
    `Verified ${images.checkedCount} remote images and ${audio.checkedCount} audio clips across ${questions.length} questions.`,
  );
}
