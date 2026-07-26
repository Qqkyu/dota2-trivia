#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { auditImageAssets, questionImageUrls } from "./image-assets.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const questions = JSON.parse(await readFile(join(root, "src", "data", "questions.generated.json"), "utf8"));
const { availability, checkedCount } = await auditImageAssets(questions);
const failures = questions.flatMap((question) => {
  const missing = questionImageUrls(question).filter((url) => !availability.get(url));
  return missing.length ? [`${question.id}: ${missing.join(", ")}`] : [];
});

if (failures.length) {
  console.error(`Found unavailable question artwork:\n${failures.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Verified ${checkedCount} remote images across ${questions.length} questions.`);
}
