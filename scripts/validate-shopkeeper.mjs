#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CLIENT_CONSTANT_AUDIT } from "./client-constant-audit.mjs";
import { parseValveKeyValues } from "./valve-keyvalues.mjs";
import {
  isItemPickerQuestion,
  isRealRecipeBuilderQuestion,
  itemPickerCorrectAnswerKey,
  recipeAnswerKeyForItems,
  recipeBuilderAnswerIndex,
  recipeBuilderCorrectAnswerKey,
  recipeItemsFromAnswerKey,
} from "../src/lib/item-picker.mjs";
import { questionPresentationRevision } from "../src/lib/question-revision.mjs";
import {
  isPlayableShopkeeperQuestion,
  SHOPKEEPER_KINDS,
  shopkeeperQuestionIssues,
} from "../src/lib/shopkeeper-quality.mjs";
import { varietyShuffle } from "../src/lib/variety.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const questions = JSON.parse(await readFile(join(root, "src", "data", "shopkeeper-questions.json"), "utf8"));
const catalog = JSON.parse(await readFile(join(root, "src", "data", "shopkeeper-catalog.json"), "utf8"));
const [voteRouteSource, postgresStoreSource, arcadeSource, arcadeStyles] = await Promise.all([
  readFile(join(root, "src", "app", "api", "votes", "route.ts"), "utf8"),
  readFile(join(root, "src", "lib", "vote-store-postgres.ts"), "utf8"),
  readFile(join(root, "src", "components", "queue-arcade.tsx"), "utf8"),
  readFile(join(root, "src", "components", "queue-arcade.module.css"), "utf8"),
]);
const failures = [];
const ids = new Set();
const expectedSource = `Dota 2 live-client recipes · build ${CLIENT_CONSTANT_AUDIT.clientBuild}`;
const itemKeyFromArtwork = (url) => url?.match(/\/items\/([^/?]+)\.png/)?.[1];
const clientRootArgument = process.argv.find((argument) => argument.startsWith("--client-root="));
const clientRoot = resolve(
  clientRootArgument?.slice("--client-root=".length) ??
    process.env.DOTA_CLIENT_AUDIT_ROOT ??
    `/tmp/queue-arcade-live${CLIENT_CONSTANT_AUDIT.clientBuild}`,
);
const clientItemsPath = join(clientRoot, "core", "scripts", "npc", "items.txt");
let liveRecipes;

try {
  const definitions = parseValveKeyValues(await readFile(clientItemsPath, "utf8")).DOTAAbilities;
  liveRecipes = new Map();
  for (const definition of Object.values(definitions)) {
    if (!definition?.ItemResult || !definition.ItemRequirements) continue;
    const resultKey = String(definition.ItemResult).replace(/^item_/, "");
    const variants = Object.values(definition.ItemRequirements).map((requirement) =>
      String(requirement ?? "")
        .split(";")
        .map((component) =>
          component
            .replace(/^item_/, "")
            .replace(/\*/g, "")
            .trim(),
        )
        .filter((component) => component && !component.startsWith("recipe_")),
    );
    liveRecipes.set(resultKey, variants);
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const sameMultiset = (left = [], right = []) =>
  left.length === right.length && [...left].sort().join("\0") === [...right].sort().join("\0");
const matchesLiveRecipe = (targetKey, componentKeys) =>
  liveRecipes?.get(targetKey)?.some((variant) => sameMultiset(variant, componentKeys)) ?? false;

const expectedCatalogGroups = [
  "consumables",
  "attributes",
  "weapons_armor",
  "misc",
  "secretshop",
  "basics",
  "support",
  "magics",
  "defense",
  "weapons",
  "artifacts",
];
const catalogItems = catalog.groups?.flatMap((group) => group.items ?? []) ?? [];
const catalogKeys = new Set(catalogItems.map((item) => item.key));
const itemButtonRule = arcadeStyles.match(/\.shopkeeperGroup button \{([^}]*)\}/)?.[1] ?? "";
const tooltipRule = arcadeStyles.match(/\.shopkeeperTooltip \{([^}]*)\}/)?.[1] ?? "";

if (
  catalog.patch !== CLIENT_CONSTANT_AUDIT.patch ||
  catalog.clientBuild !== CLIENT_CONSTANT_AUDIT.clientBuild ||
  JSON.stringify(catalog.groups?.map((group) => group.key)) !== JSON.stringify(expectedCatalogGroups) ||
  catalog.groups?.filter((group) => group.section === "basics").length !== 5 ||
  catalog.groups?.filter((group) => group.section === "upgrades").length !== 6
) {
  failures.push("The open-answer shop no longer matches the audited Dota shop section layout.");
}
if (catalogItems.length !== 182 || catalogKeys.size !== catalogItems.length) {
  failures.push(`The open-answer shop needs 182 unique purchasable entries (found ${catalogItems.length}).`);
}
for (const item of catalogItems) {
  if (
    typeof item.key !== "string" ||
    typeof item.name !== "string" ||
    !item.image?.includes(`/items/${item.key}.png`) ||
    !Number.isFinite(item.cost) ||
    item.cost < 0 ||
    item.key.startsWith("recipe_")
  ) {
    failures.push(`Open-shop catalog entry ${item.key ?? "unknown"} is incomplete or invalid.`);
  }
}
if (
  !voteRouteSource.includes("keyedAnswerIndex(question, answerKey)") ||
  !voteRouteSource.includes("isValidAnswerKeyForQuestion(question, answerKey)") ||
  !voteRouteSource.includes("answerKey: resolvedAnswerKey") ||
  !postgresStoreSource.includes("ADD COLUMN IF NOT EXISTS answer_key TEXT") ||
  !postgresStoreSource.includes("GROUP BY answer_key") ||
  !arcadeSource.includes('data-testid="shopkeeper-store"') ||
  !arcadeSource.includes("onChoose={chooseKeyedAnswer}") ||
  !arcadeSource.includes('data-testid="shopkeeper-item-tooltip"') ||
  !arcadeSource.includes('data-testid="shopkeeper-recipe-builder"') ||
  !arcadeSource.includes('data-testid="shopkeeper-recipe-slot"') ||
  !arcadeSource.includes('data-testid="shopkeeper-recipe-build"') ||
  !arcadeSource.includes("recipeAnswerKeyForItems(draftRecipeKeys)") ||
  !arcadeSource.includes("setDraftRecipeKeys((itemKeys) => itemKeys.filter") ||
  !arcadeSource.includes("createPortal(") ||
  !arcadeSource.includes("recipeBuilder ? addRecipeItem(item.key) : chooseItem(item.key)") ||
  !arcadeSource.match(
    /const chooseItem = \(itemKey: string\) => \{\s*setQuery\(""\);\s*setTooltip\(null\);\s*onChoose\(itemKey\);/s,
  ) ||
  !itemButtonRule.includes("overflow: hidden;") ||
  !tooltipRule.includes("position: fixed;") ||
  arcadeStyles.includes(".shopkeeperGroup button > span")
) {
  failures.push("The Build Result item-key vote, reconnect, store UI, or stable tooltip contract was removed.");
}

const expectedKindCounts = new Map([
  ["shopkeeper-build-result", 26],
  ["shopkeeper-real-recipe", 26],
  ["shopkeeper-shared-part", 38],
  ["shopkeeper-upgrade-path", 12],
]);
const expectedQuestionCount = [...expectedKindCounts.values()].reduce((total, count) => total + count, 0);
if (questions.length !== expectedQuestionCount) {
  failures.push(`Shopkeeper needs ${expectedQuestionCount} curated rounds (found ${questions.length}).`);
}

for (const kind of SHOPKEEPER_KINDS) {
  const family = questions.filter((question) => question.kind === kind);
  const expectedCount = expectedKindCounts.get(kind);
  if (family.length !== expectedCount)
    failures.push(`${kind}: expected ${expectedCount} rounds, found ${family.length}.`);
  const answerSlots = [0, 1, 2, 3].map((slot) => family.filter((question) => question.correctIndex === slot).length);
  if (Math.max(...answerSlots) - Math.min(...answerSlots) > 1) {
    failures.push(`${kind}: correct answers are not balanced across A–D (${answerSlots.join(" / ")}).`);
  }
}

for (const question of questions) {
  if (!question.id || ids.has(question.id)) failures.push(`${question.id ?? "unknown"}: missing or duplicate id.`);
  ids.add(question.id);
  const issues = shopkeeperQuestionIssues(question);
  if (issues.length) failures.push(`${question.id}: ${issues.join(", ")}.`);
  if (question.shopkeeper?.clientBuild !== CLIENT_CONSTANT_AUDIT.clientBuild) {
    failures.push(`${question.id}: recipe is not stamped with the audited client build.`);
  }
  if (question.patch !== CLIENT_CONSTANT_AUDIT.patch || question.source?.label !== expectedSource) {
    failures.push(`${question.id}: patch/source audit stamp drifted.`);
  }
  if (question.prompt.trim().split(/\s+/).length > 7) {
    failures.push(`${question.id}: prompt is too slow to scan.`);
  }

  for (const item of question.shopkeeper?.promptItems ?? []) {
    if (item.key !== itemKeyFromArtwork(item.image))
      failures.push(`${question.id}: prompt artwork/key drift for ${item.key}.`);
  }
  for (const group of question.shopkeeper?.answerGroups ?? []) {
    for (const item of group) {
      if (item.key !== itemKeyFromArtwork(item.image))
        failures.push(`${question.id}: recipe artwork/key drift for ${item.key}.`);
    }
  }
  if (question.shopkeeper?.answerItemKeys) {
    const artworkKeys = (question.answerImages ?? []).map(itemKeyFromArtwork);
    if (JSON.stringify(artworkKeys) !== JSON.stringify(question.shopkeeper.answerItemKeys)) {
      failures.push(`${question.id}: answer artwork drifted from audited item keys.`);
    }
  }
  if (question.shopkeeper?.format === "build-result") {
    const targetKey = question.shopkeeper.targetItemKey;
    const target = catalogItems.find((item) => item.key === targetKey);
    if (!target || question.answers[question.correctIndex] !== target.name) {
      failures.push(`${question.id}: open-shop target is missing or disagrees with the correct answer.`);
    }
  }
  if (question.shopkeeper?.format === "real-recipe") {
    const answerKey = recipeBuilderCorrectAnswerKey(question);
    const parsedKeys = recipeItemsFromAnswerKey(answerKey);
    const wrongItem = catalogItems.find((item) => !question.shopkeeper.recipeComponentKeys.includes(item.key));
    const wrongAnswerKey = recipeAnswerKeyForItems([
      wrongItem.key,
      ...question.shopkeeper.recipeComponentKeys.slice(1),
    ]);
    if (
      !isRealRecipeBuilderQuestion(question) ||
      !answerKey ||
      !parsedKeys ||
      !sameMultiset(parsedKeys, question.shopkeeper.recipeComponentKeys) ||
      recipeBuilderAnswerIndex(question, answerKey) !== question.correctIndex ||
      recipeBuilderAnswerIndex(question, wrongAnswerKey) === question.correctIndex ||
      question.prompt !== `Build ${question.eyebrow}.` ||
      questionPresentationRevision(question) !== "real-recipe-builder-1"
    ) {
      failures.push(`${question.id}: open-shop recipe builder contract drifted.`);
    }
  }
  if (question.shopkeeper?.format === "upgrade-path") {
    if (
      !isItemPickerQuestion(question) ||
      itemPickerCorrectAnswerKey(question) !== question.shopkeeper.targetItemKey ||
      questionPresentationRevision(question) !== "open-shop-1"
    ) {
      failures.push(`${question.id}: Upgrade Path no longer uses the full-shop keyed-answer contract.`);
    }
  }

  if (liveRecipes) {
    const audit = question.shopkeeper;
    const auditedRecipeTargets =
      audit.format === "shared-part"
        ? (audit.targetItemKeys ?? [])
        : audit.format === "real-recipe"
          ? [audit.targetItemKey]
          : (audit.answerItemKeys ?? []);
    for (const targetKey of auditedRecipeTargets) {
      const variants = liveRecipes.get(targetKey) ?? [];
      const uniqueVariants = new Set(variants.map((variant) => [...variant].sort().join("+")));
      if (uniqueVariants.size !== 1) {
        failures.push(`${question.id}: ${targetKey} has multiple client recipe variants and is not exact-tray safe.`);
      }
    }
    if (
      ["build-result", "real-recipe"].includes(audit.format) &&
      !matchesLiveRecipe(audit.targetItemKey, audit.recipeComponentKeys)
    ) {
      failures.push(`${question.id}: target recipe disagrees with client build ${CLIENT_CONSTANT_AUDIT.clientBuild}.`);
    }
    if (audit.format === "build-result" || audit.format === "upgrade-path") {
      for (const [index, targetKey] of (audit.answerItemKeys ?? []).entries()) {
        if (!matchesLiveRecipe(targetKey, audit.answerRecipeKeys?.[index])) {
          failures.push(`${question.id}: option ${index + 1} recipe disagrees with the audited client.`);
        }
      }
    }
    if (audit.format === "shared-part") {
      for (const [index, targetKey] of (audit.targetItemKeys ?? []).entries()) {
        if (!matchesLiveRecipe(targetKey, audit.targetRecipeKeys?.[index])) {
          failures.push(`${question.id}: displayed item ${index + 1} recipe disagrees with the audited client.`);
        }
      }
    }
  }
}

for (const seed of ["shopkeeper-regression-a", "shopkeeper-regression-b", "shopkeeper-regression-c"]) {
  const opening = varietyShuffle(questions, seed).slice(0, 16);
  const formatCounts = [...SHOPKEEPER_KINDS].map((kind) => opening.filter((question) => question.kind === kind).length);
  if (
    opening.some((question, index) => index > 0 && question.kind === opening[index - 1].kind) ||
    formatCounts.some((count) => count !== 4)
  ) {
    failures.push(`${seed}: opening format cadence drifted (${formatCounts.join(" / ")}).`);
  }
}

if (isPlayableShopkeeperQuestion({ kind: "recipe-component" })) {
  failures.push("The retired single-component Shopkeeper format passed the playable gate.");
}

const duplicateRecipeKey = recipeAnswerKeyForItems(["broadsword", "claymore", "broadsword"]);
if (
  duplicateRecipeKey !== "recipe-v1:broadsword+broadsword+claymore" ||
  JSON.stringify(recipeItemsFromAnswerKey(duplicateRecipeKey)) !==
    JSON.stringify(["broadsword", "broadsword", "claymore"]) ||
  recipeItemsFromAnswerKey("recipe-v1:claymore+broadsword") !== null ||
  recipeItemsFromAnswerKey("recipe-v1:../../private") !== null
) {
  failures.push("Canonical recipe answers no longer preserve duplicates or reject malformed keys.");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${questions.length} client-audited Shopkeeper rounds, ${expectedKindCounts.get("shopkeeper-real-recipe")} full-shop recipe builders, and the ${catalogItems.length}-item Dota shop picker${liveRecipes ? `, with build ${CLIENT_CONSTANT_AUDIT.clientBuild} recipe parity` : ""}.`,
  );
}
