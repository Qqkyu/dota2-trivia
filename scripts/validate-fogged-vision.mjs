#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { questionPresentationRevision } from "../src/lib/question-revision.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [styles, component, questions] = await Promise.all([
  readFile(join(root, "src", "components", "queue-arcade.module.css"), "utf8"),
  readFile(join(root, "src", "components", "queue-arcade.tsx"), "utf8"),
  readFile(join(root, "src", "data", "questions.generated.json"), "utf8").then(JSON.parse),
]);
const failures = [];
const approvedCurve = Object.freeze({
  "fog-start-blur": "21px",
  "fog-start-grayscale": "0.7",
  "fog-start-brightness": "0.5",
  "fog-start-saturation": "0.44",
  "fog-start-contrast": "0.88",
  "fog-start-scale": "1.42",
  "fog-middle-blur": "14px",
  "fog-middle-grayscale": "0.56",
  "fog-middle-brightness": "0.56",
  "fog-middle-saturation": "0.6",
  "fog-middle-contrast": "0.9",
  "fog-middle-scale": "1.25",
  "fog-final-blur": "8px",
  "fog-final-grayscale": "0.42",
  "fog-final-brightness": "0.65",
  "fog-final-saturation": "0.6",
  "fog-final-contrast": "0.92",
  "fog-final-scale": "1.13",
});
const fogBlock = styles.match(/\.fogQuestion\s*\{([^}]+)\}/s)?.[1] ?? "";

for (const [variable, expected] of Object.entries(approvedCurve)) {
  const actual = fogBlock.match(new RegExp(`--${variable}:\\s*([^;]+);`))?.[1]?.trim();
  if (actual !== expected) failures.push(`${variable} drifted from ${expected} to ${actual ?? "missing"}.`);
}

if (styles.includes('.fogQuestion[data-skill-level="')) {
  failures.push("Retired difficulty overrides returned to Fogged Vision.");
}
if (
  !component.includes("data-fog-stage={clueStage}") ||
  !component.includes("key={`${activeRoundId}:fog`}") ||
  !component.includes('currentGame === "fogged-vision"')
) {
  failures.push("Fogged Vision no longer renders a stable, round-keyed three-stage reveal.");
}

const fogQuestions = questions.filter((question) => question.kind === "fogged-hero");
if (
  fogQuestions.length < 40 ||
  fogQuestions.some((question) => questionPresentationRevision(question) !== "fog-veteran-curve-1")
) {
  failures.push("Fogged Vision questions lost their approved presentation revision.");
}

if (failures.length) throw new Error(failures.join("\n"));

console.log(
  `Validated ${fogQuestions.length} Fogged Vision questions against the approved former-Veteran three-stage curve.`,
);
