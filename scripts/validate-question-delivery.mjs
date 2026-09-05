#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { heroCorrectAnswerKey, isHeroPickerQuestion } from "../src/lib/hero-picker.mjs";
import { itemPickerCorrectAnswerKey, recipeBuilderCorrectAnswerKey } from "../src/lib/item-picker.mjs";
import { publicQuestionForRound, publicQuestionRevision } from "../src/lib/public-question.mjs";
import { valueOrderCorrectAnswerKey } from "../src/lib/value-order.mjs";

const root = process.cwd();
const readJson = async (file) => JSON.parse(await readFile(path.join(root, "src", "data", file), "utf8"));
const [generated, shopkeeper, soundcheck, valueOrder, aghanim, flashback] = await Promise.all([
  readJson("questions.generated.json"),
  readJson("shopkeeper-questions.json"),
  readJson("soundcheck-questions.json"),
  readJson("value-order-questions.json"),
  readJson("aghanim-questions.json"),
  readJson("flashback-questions.json"),
]);
const failures = [];

function record(condition, message) {
  if (!condition) failures.push(message);
}

function keysInside(value, keys = new Set()) {
  if (!value || typeof value !== "object") return keys;
  if (Array.isArray(value)) {
    value.forEach((entry) => keysInside(entry, keys));
    return keys;
  }
  for (const [key, entry] of Object.entries(value)) {
    keys.add(key);
    keysInside(entry, keys);
  }
  return keys;
}

function roundFor(question, game, phase = "answering", now = 1_000) {
  return {
    id: `public-room:round:${question.kind}:${phase}`,
    phase,
    game,
    answerDeadline: 15_000,
    answerDuration: 15_000,
    now,
  };
}

const forbiddenAnsweringKeys = new Set([
  "correctIndex",
  "explanation",
  "source",
  "targetItemKey",
  "targetItemKeys",
  "sourceItemKey",
  "sharedComponentKey",
  "componentKey",
  "recipeComponentKeys",
  "targetRecipeKeys",
  "answerItemKeys",
  "answerRecipeKeys",
  "answerIngredientKeys",
  "answerCosts",
  "clientBuild",
  "audit",
  "subject",
  "event",
  "eventFile",
  "outcomes",
  "targetedOptions",
  "values",
  "correctOrder",
  "correctYear",
  "value",
  "derivedFrom",
  "revealMedia",
]);

const orderFamilies = [
  "item-price",
  "ability-cooldown",
  "ability-mana",
  "ability-damage",
  "hero-move-speed",
  "hero-attack-range",
];
const representativeOrderQuestions = orderFamilies.map((family) =>
  valueOrder.find((question) => question.valueOrder?.family === family),
);

const representativeQuestions = [
  [generated.find((question) => question.kind === "cooldown"), "trivia"],
  [generated.find((question) => question.kind === "spell-owner"), "spell-link"],
  [generated.find((question) => question.kind === "fogged-hero"), "fogged-vision"],
  [generated.find((question) => question.kind === "hero-voice"), "echo-hunt"],
  [generated.find((question) => question.kind === "hero-quote"), "quote-hunt"],
  [aghanim.find((question) => question.kind === "aghanim-upgrade"), "aghanim-lab"],
  [shopkeeper.find((question) => question.shopkeeper?.format === "build-result"), "shopkeeper"],
  [shopkeeper.find((question) => question.shopkeeper?.format === "real-recipe"), "shopkeeper"],
  [shopkeeper.find((question) => question.shopkeeper?.format === "upgrade-path"), "shopkeeper"],
  [
    soundcheck.find(
      (question) => question.soundcheck?.family === "ability" && question.soundcheck?.format === "single",
    ),
    "soundcheck",
  ],
  [
    soundcheck.find((question) => question.soundcheck?.family === "item" && question.soundcheck?.format === "single"),
    "soundcheck",
  ],
  [soundcheck.find((question) => question.soundcheck?.format === "sequence"), "soundcheck"],
  ...representativeOrderQuestions.map((question) => [question, "order-up"]),
  [flashback.find((question) => question.kind === "flashback-year"), "flashback"],
  [flashback.find((question) => question.kind === "flashback-choice"), "flashback"],
  [flashback.find((question) => question.kind === "flashback-order"), "flashback"],
];

for (const [question, game] of representativeQuestions) {
  record(Boolean(question), `Missing ${game} representative question.`);
  if (!question) continue;

  const answeringRound = roundFor(question, game);
  const payload = publicQuestionForRound(question, answeringRound, answeringRound.now);
  const publicKeys = keysInside(payload);
  const leakedKeys = [...forbiddenAnsweringKeys].filter((key) => publicKeys.has(key));
  record(payload.id === answeringRound.id, `${question.id}: the internal catalog ID became the public identity.`);
  record(!Object.hasOwn(payload, "patch"), `${question.id}: the global patch label was repeated in the round payload.`);
  record(payload.reveal === null, `${question.id}: answering payload included reveal data.`);
  record(leakedKeys.length === 0, `${question.id}: answering payload leaked ${leakedKeys.join(", ")}.`);
  if (isHeroPickerQuestion(question)) {
    record(
      payload.answerMode === "hero-grid" &&
        payload.answers.every((answer) => answer === "") &&
        !payload.answerImages &&
        !JSON.stringify(payload).includes(heroCorrectAnswerKey(question)),
      `${question.id}: hero-grid answering payload exposed its old choices or target.`,
    );
  }

  const revealRound = roundFor(question, game, "reveal", 16_000);
  const revealPayload = publicQuestionForRound(question, revealRound, revealRound.now);
  const reveal = revealPayload.reveal;
  record(
    !Object.hasOwn(revealPayload, "patch"),
    `${question.id}: the global patch label was repeated in the reveal payload.`,
  );
  record(
    reveal?.correctIndex === question.correctIndex && reveal?.explanation === question.explanation,
    `${question.id}: reveal payload did not restore the server answer and explanation.`,
  );
  if (isHeroPickerQuestion(question)) {
    record(
      reveal?.correctAnswerKey === heroCorrectAnswerKey(question),
      `${question.id}: hero-grid reveal did not restore its correct hero key.`,
    );
  }
  const revealQuestion = Object.fromEntries(Object.entries(revealPayload).filter(([key]) => key !== "reveal"));
  const leakedRevealKeys = [...forbiddenAnsweringKeys].filter((key) => keysInside(revealQuestion).has(key));
  record(leakedRevealKeys.length === 0, `${question.id}: reveal question leaked ${leakedRevealKeys.join(", ")}.`);
}

const flashbackYear = flashback.find((question) => question.kind === "flashback-year");
if (flashbackYear) {
  const answeringRound = roundFor(flashbackYear, "flashback");
  const answering = publicQuestionForRound(flashbackYear, answeringRound, answeringRound.now);
  const revealRound = roundFor(flashbackYear, "flashback", "reveal", 16_000);
  const reveal = publicQuestionForRound(flashbackYear, revealRound, revealRound.now);
  record(
    answering.answerMode === "flashback-year" &&
      answering.answers.every((answer) => answer === "") &&
      answering.flashback?.yearMax === new Date(answeringRound.now).getFullYear() &&
      !JSON.stringify(answering).includes("correctYear"),
    "Flashback year ticks still send the four nearby years while answers are open.",
  );
  record(
    reveal.reveal?.correctAnswerKey === `year-v1:${flashbackYear.flashback.correctYear}`,
    "Flashback year reveal no longer carries the keyed year.",
  );
}

const flashbackWinner = flashback.find((question) => question.id === "flashback:ti1-winner");
if (flashbackWinner) {
  const answeringRound = roundFor(flashbackWinner, "flashback");
  const answering = publicQuestionForRound(flashbackWinner, answeringRound, answeringRound.now);
  const revealRound = roundFor(flashbackWinner, "flashback", "reveal", 16_000);
  const reveal = publicQuestionForRound(flashbackWinner, revealRound, revealRound.now);
  record(
    answering.reveal === null &&
      !JSON.stringify(answering).includes("revealMedia") &&
      !JSON.stringify(answering).includes("team_logos/36") &&
      !JSON.stringify(answering).includes("/arcade/flashback/winners/"),
    "Flashback who-won still shows the winning-team picture while answers are open.",
  );
  record(
    reveal.reveal?.media?.src && reveal.reveal.media.alt.includes("Natus Vincere"),
    "Flashback who-won no longer shows the winning team after reveal.",
  );
}

const flashbackWinnerPhoto = flashback.find((question) => question.id === "flashback:ti7-winner");
if (flashbackWinnerPhoto) {
  const answeringRound = roundFor(flashbackWinnerPhoto, "flashback");
  const answering = publicQuestionForRound(flashbackWinnerPhoto, answeringRound, answeringRound.now);
  const revealRound = roundFor(flashbackWinnerPhoto, "flashback", "reveal", 16_000);
  const reveal = publicQuestionForRound(flashbackWinnerPhoto, revealRound, revealRound.now);
  record(
    answering.reveal === null && !JSON.stringify(answering).includes("ti7-liquid"),
    "Flashback still shows the TI7 hoist photo while answers are open.",
  );
  record(
    reveal.reveal?.media?.src === "/arcade/flashback/winners/ti7-liquid.jpg" &&
      reveal.reveal.media.kind === "photo" &&
      reveal.reveal.media.alt.includes("Team Liquid"),
    "Flashback TI7 reveal no longer uses the official hoist photo.",
  );
}

const buildResult = shopkeeper.find((question) => question.shopkeeper?.format === "build-result");
if (buildResult) {
  const answeringRound = roundFor(buildResult, "shopkeeper");
  const answering = publicQuestionForRound(buildResult, answeringRound, answeringRound.now);
  const revealRound = roundFor(buildResult, "shopkeeper", "reveal", 16_000);
  const reveal = publicQuestionForRound(buildResult, revealRound, revealRound.now);
  record(
    !JSON.stringify(answering).includes(buildResult.shopkeeper.targetItemKey),
    "Build Result disclosed its target item while answers were open.",
  );
  record(
    answering.answerMode === "item-grid" && reveal.reveal?.correctAnswerKey === buildResult.shopkeeper.targetItemKey,
    "Build Result did not reveal its target item after the deadline.",
  );
}

const realRecipe = shopkeeper.find((question) => question.shopkeeper?.format === "real-recipe");
if (realRecipe) {
  const answeringRound = roundFor(realRecipe, "shopkeeper");
  const answering = publicQuestionForRound(realRecipe, answeringRound, answeringRound.now);
  const revealRound = roundFor(realRecipe, "shopkeeper", "reveal", 16_000);
  const reveal = publicQuestionForRound(realRecipe, revealRound, revealRound.now);
  const answeringJson = JSON.stringify(answering);
  record(
    answering.answerMode === "item-recipe" &&
      answering.shopkeeper?.recipeSize === realRecipe.shopkeeper.recipeComponentKeys.length &&
      answering.answers.every((answer) => answer === "") &&
      !answering.shopkeeper?.answerGroups &&
      realRecipe.shopkeeper.recipeComponentKeys.every((itemKey) => !answeringJson.includes(JSON.stringify(itemKey))),
    "Real Recipe exposed a component or retained its giveaway trays while answers were open.",
  );
  record(
    reveal.reveal?.correctAnswerKey === recipeBuilderCorrectAnswerKey(realRecipe),
    "Real Recipe did not reveal its canonical direct recipe after the deadline.",
  );
}

const upgradePath = shopkeeper.find((question) => question.shopkeeper?.format === "upgrade-path");
if (upgradePath) {
  const answeringRound = roundFor(upgradePath, "shopkeeper");
  const answering = publicQuestionForRound(upgradePath, answeringRound, answeringRound.now);
  const revealRound = roundFor(upgradePath, "shopkeeper", "reveal", 16_000);
  const reveal = publicQuestionForRound(upgradePath, revealRound, revealRound.now);
  const answeringJson = JSON.stringify(answering);
  record(
    answering.answerMode === "item-grid" &&
      answering.answers.every((answer) => answer === "") &&
      !answering.answerImages &&
      !answeringJson.includes(JSON.stringify(upgradePath.shopkeeper.targetItemKey)),
    "Upgrade Path retained its giveaway choices or exposed the target item while answers were open.",
  );
  record(
    reveal.reveal?.correctAnswerKey === itemPickerCorrectAnswerKey(upgradePath),
    "Upgrade Path did not reveal its direct upgrade after the deadline.",
  );
}

const itemSound = soundcheck.find(
  (question) => question.soundcheck?.family === "item" && question.soundcheck?.format === "single",
);
if (itemSound) {
  const answeringRound = roundFor(itemSound, "soundcheck");
  const answering = publicQuestionForRound(itemSound, answeringRound, answeringRound.now);
  const revealRound = roundFor(itemSound, "soundcheck", "reveal", 16_000);
  const reveal = publicQuestionForRound(itemSound, revealRound, revealRound.now);
  const soundSource = itemSound.soundcheck.clips[0].subject;
  record(
    answering.answerMode === "item-grid" &&
      answering.answers.every((answer) => answer === "") &&
      !answering.answerImages &&
      !JSON.stringify(answering).includes(soundSource),
    "A single-item Soundcheck round exposed its old choices or hidden sound source.",
  );
  record(
    reveal.reveal?.correctAnswerKey === soundSource,
    "A single-item Soundcheck round did not reveal its shop answer after the deadline.",
  );
}

const itemSequence = soundcheck.find(
  (question) => question.soundcheck?.family === "item" && question.soundcheck?.format === "sequence",
);
if (itemSequence) {
  const round = roundFor(itemSequence, "soundcheck");
  const answering = publicQuestionForRound(itemSequence, round, round.now);
  record(
    answering.answerMode === undefined && answering.answerImagePairs?.length === 4,
    "Ordered item sounds should remain a four-pair ordering task.",
  );
}

for (const orderQuestion of representativeOrderQuestions.filter(Boolean)) {
  const answeringRound = roundFor(orderQuestion, "order-up");
  const answering = publicQuestionForRound(orderQuestion, answeringRound, answeringRound.now);
  const revealRound = roundFor(orderQuestion, "order-up", "reveal", 16_000);
  const reveal = publicQuestionForRound(orderQuestion, revealRound, revealRound.now);
  const answeringJson = JSON.stringify(answering);
  record(
    answering.answerMode === "value-order" &&
      answering.answers.every((answer) => answer === "") &&
      answering.valueOrder?.cards.length === 4 &&
      orderQuestion.valueOrder.values.every(({ label }) => !answeringJson.includes(JSON.stringify(label))) &&
      !answeringJson.includes(valueOrderCorrectAnswerKey(orderQuestion)),
    "Order Up exposed a value, correct order, or private fallback choice while answers were open.",
  );
  record(
    reveal.reveal?.correctAnswerKey === valueOrderCorrectAnswerKey(orderQuestion) &&
      reveal.reveal?.orderValues?.length === 4,
    `${orderQuestion.valueOrder.family} Order Up did not reveal its canonical order and values after the deadline.`,
  );
}

const spell = generated.find((question) => question.kind === "spell-owner");
if (spell) {
  const baseRound = roundFor(spell, "spell-link");
  const first = publicQuestionForRound(spell, baseRound, 1_000);
  const second = publicQuestionForRound(spell, baseRound, 6_000);
  const third = publicQuestionForRound(spell, baseRound, 11_000);
  record(
    first.clueStage === 1 && first.eyebrow === "Spell Link" && first.hint === spell.hint && !first.image,
    "Spell Link clue one did not deliver the complete answer-safe description.",
  );
  record(second.clueStage === 2 && second.eyebrow === spell.eyebrow && !second.image, "Spell Link clue two drifted.");
  record(third.clueStage === 3 && third.image?.src === spell.image?.src, "Spell Link clue three did not unlock.");
  record(
    new Set([1_000, 6_000, 11_000].map((now) => publicQuestionRevision(baseRound, now))).size === 3,
    "Spell Link cache revisions do not advance with server-authoritative clues.",
  );
}

const quote = generated.find((question) => question.kind === "hero-quote");
if (quote) {
  const baseRound = roundFor(quote, "quote-hunt");
  const first = publicQuestionForRound(quote, baseRound, 1_000);
  const second = publicQuestionForRound(quote, baseRound, 6_000);
  const third = publicQuestionForRound(quote, baseRound, 11_000);
  record(
    first.clueStage === 1 && first.quoteHints?.length === 0 && !JSON.stringify(first).includes(quote.quoteHints[0]),
    "Quote Hunt disclosed a future identity clue at stage one.",
  );
  record(
    second.clueStage === 2 &&
      JSON.stringify(second.quoteHints) === JSON.stringify(quote.quoteHints.slice(0, 1)) &&
      !JSON.stringify(second).includes(quote.quoteHints[1]),
    "Quote Hunt stage two did not reveal only the primary-attribute clue.",
  );
  record(
    third.clueStage === 3 && JSON.stringify(third.quoteHints) === JSON.stringify(quote.quoteHints),
    "Quote Hunt stage three did not reveal both identity clues.",
  );
  record(
    new Set([1_000, 6_000, 11_000].map((now) => publicQuestionRevision(baseRound, now))).size === 3,
    "Quote Hunt cache revisions do not advance with server-authoritative clues.",
  );
}

const aghanimUpgrade = aghanim.find((question) => question.kind === "aghanim-upgrade");
if (aghanimUpgrade) {
  const baseRound = roundFor(aghanimUpgrade, "aghanim-lab");
  const first = publicQuestionForRound(aghanimUpgrade, baseRound, 1_000);
  const second = publicQuestionForRound(aghanimUpgrade, baseRound, 6_000);
  const third = publicQuestionForRound(aghanimUpgrade, baseRound, 11_000);
  record(
    first.clueStage === 1 &&
      first.aghanim?.effect === aghanimUpgrade.aghanim.effect &&
      first.aghanim?.upgradeType === undefined &&
      first.aghanim?.upgradeMode === undefined &&
      first.aghanim?.abilityName === undefined,
    "Aghanim's Lab disclosed a later clue at stage one.",
  );
  record(
    second.clueStage === 2 &&
      second.aghanim?.upgradeType === aghanimUpgrade.aghanim.upgradeType &&
      second.aghanim?.upgradeMode === aghanimUpgrade.aghanim.upgradeMode &&
      second.aghanim?.abilityName === undefined,
    "Aghanim's Lab stage two did not reveal only the upgrade details.",
  );
  record(
    third.clueStage === 3 && third.aghanim?.abilityName === aghanimUpgrade.aghanim.abilityName,
    "Aghanim's Lab stage three did not reveal the ability name.",
  );
  record(
    new Set([1_000, 6_000, 11_000].map((now) => publicQuestionRevision(baseRound, now))).size === 3,
    "Aghanim's Lab cache revisions do not advance with server-authoritative clues.",
  );
}

const [clientSource, clientStyles, roundsSource, votesSource, reportsSource, roundAudioSource] = await Promise.all(
  [
    "src/components/queue-arcade.tsx",
    "src/components/queue-arcade.module.css",
    "src/app/api/rounds/route.ts",
    "src/app/api/votes/route.ts",
    "src/app/api/reports/route.ts",
    "src/app/api/round-audio/route.ts",
  ].map((file) => readFile(path.join(root, file), "utf8")),
);
record(!clientSource.includes("@/lib/game-catalogs"), "The gameplay client imports the private game catalog.");

// Every "use client" module and everything it imports (transitively, value
// imports only) ships to the browser. None of that graph may reach the
// private catalog. This caught /calibration shipping all 1,589 answers via
// site-chrome.tsx -> game-catalogs -> trivia.ts.
const PRIVATE_MODULES = [
  "src/lib/trivia.ts",
  "src/lib/game-catalogs.ts",
  "src/lib/public-rooms.ts",
  "src/lib/private-room-rounds.ts",
  "src/lib/keyed-answer.ts",
  "src/lib/calibration-data.ts",
  "src/lib/vote-store.ts",
  "src/lib/account-store.ts",
  "src/lib/alpha-store.ts",
  "src/data/questions.generated.json",
  "src/data/shopkeeper-questions.json",
  "src/data/soundcheck-questions.json",
  "src/data/value-order-questions.json",
  "src/data/aghanim-questions.json",
  "src/data/flashback-questions.json",
  "src/data/counterplay-questions.json",
];

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return listSourceFiles(target);
      return /\.(?:ts|tsx|mjs)$/.test(entry.name) ? [target] : [];
    }),
  );
  return nested.flat();
}

function resolveImport(fromFile, specifier) {
  const base = specifier.startsWith("@/")
    ? path.join(root, "src", specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(fromFile), specifier)
      : null;
  if (!base) return null;
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.mjs`, path.join(base, "index.ts")];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function isTypeOnlyClause(clause) {
  const named = clause.match(/^\s*\{([^}]*)\}\s*$/);
  if (!named) return false;
  const specifiers = named[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return specifiers.length > 0 && specifiers.every((entry) => /^type\s/.test(entry));
}

function valueImports(source) {
  const specifiers = [];
  const pattern = /^\s*(?:import|export)\s+(?!type\s)([^;]*?)\sfrom\s+["']([^"']+)["']/gm;
  for (const match of source.matchAll(pattern)) {
    if (isTypeOnlyClause(match[1])) continue;
    specifiers.push(match[2]);
  }
  for (const match of source.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) specifiers.push(match[1]);
  return specifiers;
}

async function clientImportGraph(entry) {
  const seen = new Map();
  const queue = [[entry, [entry]]];
  while (queue.length) {
    const [file, trail] = queue.shift();
    if (seen.has(file)) continue;
    seen.set(file, trail);
    if (!/\.(?:ts|tsx|mjs)$/.test(file)) continue;
    const source = await readFile(file, "utf8");
    for (const specifier of valueImports(source)) {
      const resolved = resolveImport(file, specifier);
      if (resolved && !seen.has(resolved)) queue.push([resolved, [...trail, resolved]]);
    }
  }
  return seen;
}

const sourceFiles = await listSourceFiles(path.join(root, "src"));
const clientEntries = [];
for (const file of sourceFiles) {
  const head = (await readFile(file, "utf8")).slice(0, 200);
  if (/^\s*["']use client["']/.test(head)) clientEntries.push(file);
}
record(clientEntries.length >= 5, 'Expected several "use client" components to audit.');
for (const entry of clientEntries) {
  const graph = await clientImportGraph(entry);
  for (const privateModule of PRIVATE_MODULES) {
    const absolute = path.join(root, privateModule);
    const trail = graph.get(absolute);
    record(
      !trail,
      `${path.relative(root, entry)} ships ${privateModule} to the browser via ${trail
        ?.map((step) => path.relative(root, step))
        .join(" -> ")}.`,
    );
  }
}
record(!clientSource.includes("QUESTIONS_BY_ID"), "The gameplay client still builds a local answer catalog.");
record(
  clientSource.includes('data-testid="spell-clue-description"') &&
    clientStyles.includes(".clueList > div:first-child span") &&
    clientStyles.includes("-webkit-line-clamp: unset"),
  "The full Spell Link description is no longer rendered without a line clamp.",
);
record(roundsSource.includes("publicQuestionForRound"), "The round API bypasses the public question serializer.");
record(!votesSource.includes("candidate.questionId"), "The vote API still trusts a client question ID.");
record(!reportsSource.includes("candidate.questionId"), "The report API still trusts a client question ID.");
record(
  roundAudioSource.includes("liveRoundForSettings(settings") &&
    roundAudioSource.includes("round.id !== roundId") &&
    !roundAudioSource.includes('searchParams.get("source")'),
  "The audio proxy no longer limits media delivery to the server-owned current round.",
);

if (failures.length) throw new Error(failures.join("\n"));

console.log("Validated server-delivered questions, phase-aware clues, and the private catalog boundary.");
