#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { CLIENT_CONSTANT_AUDIT } from "./client-constant-audit.mjs";
import { parseValveKeyValues } from "./valve-keyvalues.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "src", "data", "shopkeeper-questions.json");
const CDN = "https://cdn.cloudflare.steamstatic.com";
const PATCH = CLIENT_CONSTANT_AUDIT.patch;

const itemsCacheArgument = process.argv.find((argument) => argument.startsWith("--items-cache="));
const clientRootArgument = process.argv.find((argument) => argument.startsWith("--client-root="));
const ITEMS_CACHE = resolve(itemsCacheArgument?.slice("--items-cache=".length) ?? "/tmp/queue-arcade-items.json");
const CLIENT_ROOT = resolve(
  clientRootArgument?.slice("--client-root=".length) ??
    process.env.DOTA_CLIENT_AUDIT_ROOT ??
    `/tmp/queue-arcade-live${CLIENT_CONSTANT_AUDIT.clientBuild}`,
);
const ITEMS_PATH = join(CLIENT_ROOT, "core", "scripts", "npc", "items.txt");

const BUILD_RESULT_TARGETS = [
  "bloodthorn",
  "butterfly",
  "lotus_orb",
  "ultimate_scepter",
  "bfury",
  "satanic",
  "monkey_king_bar",
  "mage_slayer",
  "boots_of_bearing",
  "shivas_guard",
  "vladmir",
  "phase_boots",
];

const REAL_RECIPE_TARGETS = [
  "oblivion_staff",
  "witch_blade",
  "dagon",
  "echo_sabre",
  "cyclone",
  "maelstrom",
  "armlet",
  "invis_sword",
  "falcon_blade",
  "tranquil_boots",
  "solar_crest",
  "veil_of_discord",
];

const SHARED_PART_PAIRS = [
  ["lotus_orb", "sphere"],
  ["butterfly", "radiance"],
  ["bloodthorn", "monkey_king_bar"],
  ["mage_slayer", "bfury"],
  ["ultimate_scepter", "dragon_lance"],
  ["satanic", "invis_sword"],
  ["black_king_bar", "echo_sabre"],
  ["shivas_guard", "blade_mail"],
  ["pipe", "boots_of_bearing"],
  ["bracer", "urn_of_shadows"],
  ["cyclone", "aether_lens"],
  ["dagon", "holy_locket"],
];

const UPGRADE_PATHS = [
  ["cyclone", "wind_waker"],
  ["force_staff", "hurricane_pike"],
  ["basher", "abyssal_blade"],
  ["diffusal_blade", "disperser"],
  ["witch_blade", "devastator"],
  ["maelstrom", "mjollnir"],
  ["vanguard", "crimson_guard"],
  ["tranquil_boots", "boots_of_bearing"],
  ["arcane_boots", "guardian_greaves"],
  ["phylactery", "angels_demise"],
  ["echo_sabre", "harpoon"],
  ["invis_sword", "silver_edge"],
];

function hash(input) {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function scalar(value) {
  return value && typeof value === "object" && "value" in value ? value.value : value;
}

function artwork(path) {
  return path ? `${CDN}${path.replace(/\?$/, "")}` : undefined;
}

function itemKey(value) {
  return String(value ?? "")
    .replace(/^item_/, "")
    .replace(/\*/g, "")
    .trim();
}

function multisetDifference(left, right) {
  const counts = new Map();
  for (const key of left) counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const key of right) counts.set(key, (counts.get(key) ?? 0) - 1);
  return [...counts.values()].reduce((total, count) => total + Math.abs(count), 0);
}

const itemsByKey = JSON.parse(await readFile(ITEMS_CACHE, "utf8"));
const itemDefinitions = parseValveKeyValues(await readFile(ITEMS_PATH, "utf8")).DOTAAbilities;
const source = {
  label: `Dota 2 live-client recipes · build ${CLIENT_CONSTANT_AUDIT.clientBuild}`,
  url: `https://www.dota2.com/patches/${PATCH}`,
};

const liveCost = (key) => Number(scalar(itemDefinitions[`item_${key}`]?.ItemCost) ?? itemsByKey[key]?.cost);
const canDisplay = (key) => Boolean(itemsByKey[key]?.dname && itemsByKey[key]?.img);
const isPurchasable = (key) => {
  const definition = itemDefinitions[`item_${key}`];
  return (
    definition &&
    String(scalar(definition.ItemPurchasable) ?? "1") !== "0" &&
    String(scalar(definition.IsObsolete) ?? "0") !== "1" &&
    liveCost(key) > 0
  );
};

const recipes = new Map();
for (const definition of Object.values(itemDefinitions)) {
  if (!definition?.ItemResult || !definition.ItemRequirements) continue;
  const resultKey = itemKey(definition.ItemResult);
  const requirementVariants = Object.values(definition.ItemRequirements).map((requirement) =>
    String(requirement ?? "")
      .split(";")
      .map(itemKey)
      .filter((key) => key && !key.startsWith("recipe_")),
  );
  const uniqueVariants = new Set(requirementVariants.map((keys) => [...keys].sort().join("+")));
  if (uniqueVariants.size !== 1) continue;
  const componentKeys = requirementVariants[0];

  if (
    !itemsByKey[resultKey]?.created ||
    !isPurchasable(resultKey) ||
    !canDisplay(resultKey) ||
    componentKeys.length < 2 ||
    componentKeys.length > 4 ||
    componentKeys.some((key) => !canDisplay(key))
  ) {
    continue;
  }

  recipes.set(resultKey, {
    key: resultKey,
    name: itemsByKey[resultKey].dname,
    image: artwork(itemsByKey[resultKey].img),
    cost: liveCost(resultKey),
    componentKeys,
  });
}

function requireRecipe(key) {
  const recipe = recipes.get(key);
  if (!recipe)
    throw new Error(
      `Curated Shopkeeper recipe ${key} is missing from client build ${CLIENT_CONSTANT_AUDIT.clientBuild}.`,
    );
  return recipe;
}

function itemReference(key, count = 1) {
  const item = itemsByKey[key];
  if (!item?.dname || !item?.img) throw new Error(`Shopkeeper artwork metadata is missing for ${key}.`);
  return {
    key,
    name: item.dname,
    image: artwork(item.img),
    count,
  };
}

function collapsedItems(keys) {
  const counts = new Map();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts].map(([key, count]) => itemReference(key, count));
}

function ingredientClosure(key, seen = new Set()) {
  if (seen.has(key)) return new Set();
  const recipe = recipes.get(key);
  if (!recipe) return new Set([key]);
  const nextSeen = new Set(seen).add(key);
  return new Set([
    key,
    ...recipe.componentKeys.flatMap((componentKey) => [...ingredientClosure(componentKey, nextSeen)]),
  ]);
}

function placeCorrect(options, correctKey, slot) {
  const correct = options.find((option) => option.key === correctKey);
  const wrong = options
    .filter((option) => option.key !== correctKey)
    .sort((left, right) => hash(`${correctKey}:${left.key}`) - hash(`${correctKey}:${right.key}`));
  if (!correct || wrong.length !== 3)
    throw new Error(`Expected one correct and three unique choices for ${correctKey}.`);
  wrong.splice(slot, 0, correct);
  return wrong;
}

function resultDistractors(target) {
  const componentSet = new Set(target.componentKeys);
  const candidates = [...recipes.values()]
    .filter(
      (candidate) =>
        candidate.key !== target.key &&
        !componentSet.has(candidate.key) &&
        !candidate.componentKeys.includes(target.key),
    )
    .map((candidate) => {
      const overlap = new Set(candidate.componentKeys.filter((key) => componentSet.has(key))).size;
      const costDistance = Math.abs(Math.log(candidate.cost / target.cost));
      const lengthDistance = Math.abs(candidate.componentKeys.length - target.componentKeys.length);
      return { candidate, overlap, score: overlap * 100 - costDistance * 18 - lengthDistance * 5 };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        hash(`build-result:${target.key}:${left.candidate.key}`) -
          hash(`build-result:${target.key}:${right.candidate.key}`),
    );

  const overlapping = candidates.filter(({ overlap }) => overlap > 0).slice(0, 3);
  const selected = overlapping.length === 3 ? overlapping : candidates.slice(0, 3);
  return selected.map(({ candidate }) => candidate);
}

const componentFrequency = new Map();
for (const recipe of recipes.values()) {
  for (const key of new Set(recipe.componentKeys)) {
    componentFrequency.set(key, (componentFrequency.get(key) ?? 0) + 1);
  }
}

function recipeReplacement(target, componentIndex, usedKeys) {
  const replacedKey = target.componentKeys[componentIndex];
  const replacedCost = Math.max(1, liveCost(replacedKey));
  const unchanged = target.componentKeys.filter((_, index) => index !== componentIndex);
  const candidates = [...componentFrequency.keys()]
    .filter(
      (key) =>
        !target.componentKeys.includes(key) &&
        !usedKeys.has(key) &&
        canDisplay(key) &&
        liveCost(key) > 0 &&
        liveCost(key) / replacedCost >= 0.58 &&
        liveCost(key) / replacedCost <= 1.72,
    )
    .map((key) => {
      const cooccurrences = [...recipes.values()].filter(
        (recipe) =>
          recipe.componentKeys.includes(key) && unchanged.some((component) => recipe.componentKeys.includes(component)),
      ).length;
      const costDistance = Math.abs(Math.log(liveCost(key) / replacedCost));
      return { key, score: cooccurrences * 20 - costDistance * 10 + (componentFrequency.get(key) ?? 0) };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        hash(`real-recipe:${target.key}:${componentIndex}:${left.key}`) -
          hash(`real-recipe:${target.key}:${componentIndex}:${right.key}`),
    );
  const replacement = candidates[0]?.key;
  if (!replacement) throw new Error(`No plausible component replacement found for ${target.key}:${replacedKey}.`);
  return replacement;
}

function wrongRecipeGroups(target) {
  const groups = [];
  const usedKeys = new Set();
  const indexes = [...target.componentKeys.keys()].sort(
    (left, right) => hash(`recipe-slot:${target.key}:${left}`) - hash(`recipe-slot:${target.key}:${right}`),
  );
  while (indexes.length < 3) indexes.push(indexes[indexes.length % target.componentKeys.length]);

  for (const componentIndex of indexes.slice(0, 3)) {
    const replacement = recipeReplacement(target, componentIndex, usedKeys);
    usedKeys.add(replacement);
    const keys = [...target.componentKeys];
    keys[componentIndex] = replacement;
    if (multisetDifference(keys, target.componentKeys) !== 2) {
      throw new Error(`${target.key}: a fake recipe must swap exactly one component.`);
    }
    groups.push(keys);
  }
  return groups;
}

function sharedPartChoices(left, right, sharedKey) {
  const union = [...new Set([...left.componentKeys, ...right.componentKeys])];
  const distractors = union
    .filter((key) => key !== sharedKey)
    .sort(
      (first, second) =>
        Math.abs(Math.log(liveCost(first) / liveCost(sharedKey))) -
          Math.abs(Math.log(liveCost(second) / liveCost(sharedKey))) ||
        hash(`shared:${left.key}:${right.key}:${first}`) - hash(`shared:${left.key}:${right.key}:${second}`),
    )
    .slice(0, 3);
  if (distractors.length !== 3)
    throw new Error(`${left.key} + ${right.key}: shared-part shelf needs three plausible distractors.`);
  return [sharedKey, ...distractors].map((key) => ({ key, ...itemReference(key) }));
}

function upgradeDistractors(sourceKey, target) {
  return [...recipes.values()]
    .filter((candidate) => {
      if (candidate.key === target.key || candidate.key === sourceKey) return false;
      const ingredients = ingredientClosure(candidate.key);
      return !ingredients.has(sourceKey);
    })
    .map((candidate) => {
      const costDistance = Math.abs(Math.log(candidate.cost / target.cost));
      const lengthDistance = Math.abs(candidate.componentKeys.length - target.componentKeys.length);
      const qualityMatch = itemsByKey[candidate.key]?.qual === itemsByKey[target.key]?.qual ? 1 : 0;
      return { candidate, score: qualityMatch * 12 - costDistance * 20 - lengthDistance * 4 };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        hash(`upgrade:${sourceKey}:${target.key}:${left.candidate.key}`) -
          hash(`upgrade:${sourceKey}:${target.key}:${right.candidate.key}`),
    )
    .slice(0, 3)
    .map(({ candidate }) => candidate);
}

const questions = [];
const formatCounts = new Map();
function nextSlot(kind) {
  const count = formatCounts.get(kind) ?? 0;
  formatCounts.set(kind, count + 1);
  return count % 4;
}

for (const targetKey of BUILD_RESULT_TARGETS) {
  const target = requireRecipe(targetKey);
  const kind = "shopkeeper-build-result";
  const choices = placeCorrect([target, ...resultDistractors(target)], target.key, nextSlot(kind));
  questions.push({
    id: `shopkeeper-build:${target.key}`,
    kind,
    varietyKey: kind,
    category: "Recipes",
    difficulty: 3,
    eyebrow: "Build Result",
    prompt: "What do these components build?",
    answers: choices.map((choice) => choice.name),
    answerImages: choices.map((choice) => choice.image),
    answerImageKind: "item",
    correctIndex: choices.findIndex((choice) => choice.key === target.key),
    explanation: `${target.name} is built from ${collapsedItems(target.componentKeys)
      .map((item) => `${item.name}${item.count > 1 ? ` ×${item.count}` : ""}`)
      .join(", ")}.`,
    shopkeeper: {
      format: "build-result",
      targetItemKey: target.key,
      promptItems: collapsedItems(target.componentKeys),
      recipeComponentKeys: target.componentKeys,
      answerItemKeys: choices.map((choice) => choice.key),
      answerRecipeKeys: choices.map((choice) => choice.componentKeys),
      answerCosts: choices.map((choice) => choice.cost),
      clientBuild: CLIENT_CONSTANT_AUDIT.clientBuild,
    },
    source,
    patch: PATCH,
  });
}

for (const targetKey of REAL_RECIPE_TARGETS) {
  const target = requireRecipe(targetKey);
  const kind = "shopkeeper-real-recipe";
  const correctSlot = nextSlot(kind);
  const wrongGroups = wrongRecipeGroups(target).sort(
    (left, right) => hash(`${target.key}:${left.join("+")}`) - hash(`${target.key}:${right.join("+")}`),
  );
  const answerRecipeKeys = [...wrongGroups];
  answerRecipeKeys.splice(correctSlot, 0, target.componentKeys);
  questions.push({
    id: `shopkeeper-recipe:${target.key}`,
    kind,
    varietyKey: kind,
    category: "Recipes",
    difficulty: 3,
    eyebrow: target.name,
    prompt: `Which recipe builds ${target.name}?`,
    image: { src: target.image, alt: `${target.name} item icon`, kind: "item" },
    answers: ["Recipe A", "Recipe B", "Recipe C", "Recipe D"],
    correctIndex: correctSlot,
    explanation: `${target.name} uses ${collapsedItems(target.componentKeys)
      .map((item) => `${item.name}${item.count > 1 ? ` ×${item.count}` : ""}`)
      .join(", ")}.`,
    shopkeeper: {
      format: "real-recipe",
      targetItemKey: target.key,
      promptItems: [itemReference(target.key)],
      recipeComponentKeys: target.componentKeys,
      answerRecipeKeys,
      answerGroups: answerRecipeKeys.map(collapsedItems),
      clientBuild: CLIENT_CONSTANT_AUDIT.clientBuild,
    },
    source,
    patch: PATCH,
  });
}

for (const [leftKey, rightKey] of SHARED_PART_PAIRS) {
  const left = requireRecipe(leftKey);
  const right = requireRecipe(rightKey);
  const sharedKeys = [...new Set(left.componentKeys.filter((key) => right.componentKeys.includes(key)))];
  if (sharedKeys.length !== 1) {
    throw new Error(
      `${leftKey} + ${rightKey}: expected exactly one directly shared component, found ${sharedKeys.join(", ")}.`,
    );
  }
  const sharedKey = sharedKeys[0];
  const kind = "shopkeeper-shared-part";
  const choices = placeCorrect(sharedPartChoices(left, right, sharedKey), sharedKey, nextSlot(kind));
  questions.push({
    id: `shopkeeper-shared:${left.key}:${right.key}`,
    kind,
    varietyKey: kind,
    category: "Recipes",
    difficulty: 3,
    eyebrow: "Shared Part",
    prompt: "What component do both items use?",
    answers: choices.map((choice) => choice.name),
    answerImages: choices.map((choice) => choice.image),
    answerImageKind: "item",
    correctIndex: choices.findIndex((choice) => choice.key === sharedKey),
    explanation: `${left.name} and ${right.name} both use ${itemsByKey[sharedKey].dname} in their direct recipes.`,
    shopkeeper: {
      format: "shared-part",
      targetItemKeys: [left.key, right.key],
      promptItems: [itemReference(left.key), itemReference(right.key)],
      targetRecipeKeys: [left.componentKeys, right.componentKeys],
      sharedComponentKey: sharedKey,
      answerItemKeys: choices.map((choice) => choice.key),
      clientBuild: CLIENT_CONSTANT_AUDIT.clientBuild,
    },
    source,
    patch: PATCH,
  });
}

for (const [sourceKey, targetKey] of UPGRADE_PATHS) {
  const target = requireRecipe(targetKey);
  if (!target.componentKeys.includes(sourceKey)) {
    throw new Error(
      `${sourceKey} is not a direct component of ${targetKey} in client build ${CLIENT_CONSTANT_AUDIT.clientBuild}.`,
    );
  }
  const sourceItem = itemReference(sourceKey);
  const kind = "shopkeeper-upgrade-path";
  const distractors = upgradeDistractors(sourceKey, target);
  const choices = placeCorrect([target, ...distractors], target.key, nextSlot(kind));
  questions.push({
    id: `shopkeeper-upgrade:${sourceKey}:${target.key}`,
    kind,
    varietyKey: kind,
    category: "Recipes",
    difficulty: 3,
    eyebrow: "Upgrade Path",
    prompt: `Which upgrade uses ${sourceItem.name}?`,
    answers: choices.map((choice) => choice.name),
    answerImages: choices.map((choice) => choice.image),
    answerImageKind: "item",
    correctIndex: choices.findIndex((choice) => choice.key === target.key),
    explanation: `${sourceItem.name} is a direct component of ${target.name}.`,
    shopkeeper: {
      format: "upgrade-path",
      sourceItemKey: sourceKey,
      targetItemKey: target.key,
      promptItems: [sourceItem],
      answerItemKeys: choices.map((choice) => choice.key),
      answerRecipeKeys: choices.map((choice) => requireRecipe(choice.key).componentKeys),
      answerIngredientKeys: choices.map((choice) => [...ingredientClosure(choice.key)].sort()),
      answerCosts: choices.map((choice) => choice.cost),
      clientBuild: CLIENT_CONSTANT_AUDIT.clientBuild,
    },
    source,
    patch: PATCH,
  });
}

const expectedKinds = [
  "shopkeeper-build-result",
  "shopkeeper-real-recipe",
  "shopkeeper-shared-part",
  "shopkeeper-upgrade-path",
];
for (const kind of expectedKinds) {
  const count = questions.filter((question) => question.kind === kind).length;
  if (count !== 12) throw new Error(`${kind}: expected 12 questions, generated ${count}.`);
}

const serializedQuestions = await format(
  JSON.stringify(questions.sort((left, right) => left.id.localeCompare(right.id))),
  { parser: "json", printWidth: 120 },
);
await writeFile(OUTPUT, serializedQuestions);
console.log(
  `Generated ${questions.length} Shopkeeper questions from Dota ${PATCH} client build ${CLIENT_CONSTANT_AUDIT.clientBuild}.`,
);
console.log(
  Object.fromEntries(
    expectedKinds.map((kind) => [kind, questions.filter((question) => question.kind === kind).length]),
  ),
);
