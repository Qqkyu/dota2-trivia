#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { auditAudioAssets, auditImageAssets, questionAudioUrls, questionImageUrls } from "./image-assets.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const questionFiles = [
  "questions.generated.json",
  "soundcheck-questions.json",
  "shopkeeper-questions.json",
  "value-order-questions.json",
  "aghanim-questions.json",
  "flashback-questions.json",
];
const questions = (
  await Promise.all(questionFiles.map((file) => readFile(join(root, "src", "data", file), "utf8").then(JSON.parse)))
).flat();
// Include every selectable hero and shop item, even when no current clue uses its image.
for (const file of ["hero-picker.json", "shopkeeper-catalog.json"]) {
  const catalog = JSON.parse(await readFile(join(root, "src", "data", file), "utf8"));
  questions.push(
    ...catalog.groups.flatMap((group) =>
      (group.heroes ?? group.items).map((entry) => ({
        id: `${file}:${entry.key}`,
        image: { src: entry.image },
      })),
    ),
  );
}
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
    `Verified availability and media headers for ${images.checkedCount} local/remote images and ${audio.checkedCount} audio clips across all six question catalogs and both pickers (including archived rows).`,
  );
}
