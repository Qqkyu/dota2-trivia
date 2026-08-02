#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { heroCorrectAnswerKey } from "../src/lib/hero-picker.mjs";
import { questionPresentationRevision } from "../src/lib/question-revision.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [styles, component, questions, heroCatalog] = await Promise.all([
  readFile(join(root, "src", "components", "queue-arcade.module.css"), "utf8"),
  readFile(join(root, "src", "components", "queue-arcade.tsx"), "utf8"),
  readFile(join(root, "src", "data", "questions.generated.json"), "utf8").then(JSON.parse),
  readFile(join(root, "src", "data", "hero-picker.json"), "utf8").then(JSON.parse),
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
const expectedHeroKeys = (heroCatalog.groups ?? []).flatMap((group) => (group.heroes ?? []).map((hero) => hero.key));
const heroesByKey = new Map(
  (heroCatalog.groups ?? []).flatMap((group) => (group.heroes ?? []).map((hero) => [hero.key, hero])),
);
const fogHeroKeys = fogQuestions.map(heroCorrectAnswerKey);
const fogHeroKeySet = new Set(fogHeroKeys);
if (
  fogQuestions.length !== expectedHeroKeys.length ||
  fogHeroKeySet.size !== expectedHeroKeys.length ||
  expectedHeroKeys.some((heroKey) => !fogHeroKeySet.has(heroKey))
) {
  failures.push(
    `Fogged Vision must cover every enabled hero exactly once (found ${fogQuestions.length}/${expectedHeroKeys.length}).`,
  );
}
if (fogQuestions.some((question) => questionPresentationRevision(question) !== "fog-veteran-curve-1")) {
  failures.push("Fogged Vision questions lost their approved presentation revision.");
}
for (const question of fogQuestions) {
  const hero = heroesByKey.get(heroCorrectAnswerKey(question));
  if (
    !hero ||
    question.answers?.[question.correctIndex] !== hero.name ||
    question.image?.alt !== `${hero.name} hero portrait` ||
    question.explanation !== `${hero.name} was hiding behind the fog.`
  ) {
    failures.push(`${question.id}: Fogged Vision hero naming drifted from the audited picker.`);
  }
}

if (failures.length) throw new Error(failures.join("\n"));

console.log(
  `Validated all ${fogQuestions.length} enabled heroes in Fogged Vision against the approved former-Veteran three-stage curve.`,
);
