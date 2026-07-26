#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { auditAudioAssets, auditImageAssets, questionAudioUrls, questionImageUrls } from "./image-assets.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const questions = JSON.parse(await readFile(join(root, "src", "data", "questions.generated.json"), "utf8"));
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
