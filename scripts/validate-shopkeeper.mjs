#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CLIENT_CONSTANT_AUDIT } from "./client-constant-audit.mjs";
import { parseValveKeyValues } from "./valve-keyvalues.mjs";
import {
  isPlayableShopkeeperQuestion,
  SHOPKEEPER_KINDS,
  shopkeeperQuestionIssues,
} from "../src/lib/shopkeeper-quality.mjs";
import { varietyShuffle } from "../src/lib/variety.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const questions = JSON.parse(await readFile(join(root, "src", "data", "shopkeeper-questions.json"), "utf8"));
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

if (questions.length !== 48) failures.push(`Shopkeeper needs 48 curated rounds (found ${questions.length}).`);

for (const kind of SHOPKEEPER_KINDS) {
  const family = questions.filter((question) => question.kind === kind);
  if (family.length !== 12) failures.push(`${kind}: expected 12 rounds, found ${family.length}.`);
  const answerSlots = [0, 1, 2, 3].map((slot) => family.filter((question) => question.correctIndex === slot).length);
  if (answerSlots.some((count) => count !== 3)) {
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

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${questions.length} client-audited Shopkeeper rounds: 12 each across Build Result, Real Recipe, Shared Part, and Upgrade Path${liveRecipes ? `, with build ${CLIENT_CONSTANT_AUDIT.clientBuild} recipe parity` : ""}.`,
  );
}
