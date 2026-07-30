#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CLIENT_CONSTANT_AUDIT } from "./client-constant-audit.mjs";
import { questionImageUrls } from "./image-assets.mjs";
import {
  areShopkeeperPricesBalanced,
  itemNamesOverlap,
  selectShopkeeperDistractors,
} from "../src/lib/shopkeeper-quality.mjs";
import { parseValveKeyValues } from "./valve-keyvalues.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const QUESTIONS_PATH = join(ROOT, "src", "data", "questions.generated.json");
const META_PATH = join(ROOT, "src", "data", "trivia-meta.generated.json");
const clientRootArgument = process.argv.find((argument) => argument.startsWith("--client-root="));
const CLIENT_ROOT = resolve(
  clientRootArgument?.slice("--client-root=".length) ??
    process.env.DOTA_CLIENT_AUDIT_ROOT ??
    `/tmp/queue-arcade-live${CLIENT_CONSTANT_AUDIT.clientBuild}`,
);
const ITEMS_PATH = join(CLIENT_ROOT, "core", "scripts", "npc", "items.txt");

const questions = JSON.parse(await readFile(QUESTIONS_PATH, "utf8"));
const metadata = JSON.parse(await readFile(META_PATH, "utf8"));
const itemDefinitions = parseValveKeyValues(await readFile(ITEMS_PATH, "utf8")).DOTAAbilities;

const scalar = (value) => (value && typeof value === "object" && "value" in value ? value.value : value);
const itemKeyFromArtwork = (url) => url?.match(/\/items\/([^/?]+)\.png/)?.[1];
const itemCosts = new Map(
  Object.entries(itemDefinitions).map(([key, item]) => [key.replace(/^item_/, ""), Number(scalar(item?.ItemCost))]),
);
const recipes = new Map();

for (const item of Object.values(itemDefinitions)) {
  if (!item?.ItemResult || !item.ItemRequirements) continue;
  const requirement = Object.values(item.ItemRequirements)[0];
  const components = String(requirement ?? "")
    .split(";")
    .map((component) => component.replace(/^item_/, "").replace(/\*/g, ""))
    .filter(Boolean);
  recipes.set(item.ItemResult.replace(/^item_/, ""), components);
}
const knownComponentKeys = new Set([...recipes.values()].flat());

const artworkByItemKey = new Map();
for (const question of questions) {
  if (question.image?.kind === "item") {
    artworkByItemKey.set(itemKeyFromArtwork(question.image.src), {
      key: itemKeyFromArtwork(question.image.src),
      dname: question.eyebrow?.split(" · ")[0],
      image: question.image.src,
    });
  }
  if (question.answerImageKind === "item") {
    for (const [index, image] of (question.answerImages ?? []).entries()) {
      artworkByItemKey.set(itemKeyFromArtwork(image), {
        key: itemKeyFromArtwork(image),
        dname: question.answers[index],
        image,
      });
    }
  }
}

const componentPool = [...artworkByItemKey.values()]
  .map((item) => ({ ...item, cost: itemCosts.get(item.key) }))
  .filter(
    (item) =>
      item.key &&
      knownComponentKeys.has(item.key) &&
      item.dname &&
      item.image &&
      Number.isFinite(item.cost) &&
      item.cost > 0,
  );
const rebuilt = [];
let removed = 0;

for (const question of questions) {
  if (question.kind !== "recipe-component") {
    rebuilt.push(question);
    continue;
  }

  const targetItemKey = itemKeyFromArtwork(question.image?.src);
  const recipeComponentKeys = [...new Set(recipes.get(targetItemKey) ?? [])].filter(
    (key) => key && !key.startsWith("recipe_") && Number.isFinite(itemCosts.get(key)) && itemCosts.get(key) > 0,
  );
  const eligibleComponents = recipeComponentKeys
    .map((key) => componentPool.find((candidate) => candidate.key === key))
    .filter((component) => component && !itemNamesOverlap(question.eyebrow, component.dname));

  if (recipeComponentKeys.length < 2 || eligibleComponents.length === 0) {
    removed += 1;
    continue;
  }

  const previousCorrectKey = itemKeyFromArtwork(question.answerImages?.[question.correctIndex]);
  const correct =
    eligibleComponents.find((component) => component.key === previousCorrectKey) ??
    [...eligibleComponents].sort((left, right) => left.key.localeCompare(right.key))[0];
  const distractors = selectShopkeeperDistractors(
    componentPool,
    correct,
    recipeComponentKeys,
    `shopkeeper:${targetItemKey}:${correct.key}`,
  );
  const answerItems = [correct, ...distractors];
  if (distractors.length !== 3 || !areShopkeeperPricesBalanced(answerItems, correct)) {
    removed += 1;
    continue;
  }

  const orderedItems = [...answerItems].sort(
    (left, right) =>
      question.answers.indexOf(left.dname) - question.answers.indexOf(right.dname) || left.key.localeCompare(right.key),
  );
  while (orderedItems.length < 4) orderedItems.push(answerItems[orderedItems.length]);
  const correctIndex = Math.max(
    0,
    orderedItems.findIndex((item) => item.key === correct.key),
  );
  const recipeNames = recipeComponentKeys
    .map((key) => artworkByItemKey.get(key)?.dname)
    .filter(Boolean)
    .join(", ");

  rebuilt.push({
    ...question,
    id: `item-component:${targetItemKey}:${correct.key}`,
    answers: orderedItems.map((item) => item.dname),
    answerImages: orderedItems.map((item) => item.image),
    correctIndex,
    explanation: `${question.eyebrow} is built with ${recipeNames}.`,
    shopkeeper: {
      targetItemKey,
      componentKey: correct.key,
      recipeComponentKeys,
      answerItemKeys: orderedItems.map((item) => item.key),
      answerCosts: orderedItems.map((item) => item.cost),
      clientBuild: CLIENT_CONSTANT_AUDIT.clientBuild,
    },
  });
}

const shopkeeperQuestions = rebuilt
  .filter((question) => question.kind === "recipe-component")
  .sort((left, right) => left.id.localeCompare(right.id));
for (const [index, question] of shopkeeperQuestions.entries()) {
  const targetIndex = index % 4;
  if (question.correctIndex === targetIndex) continue;
  const answers = [...question.answers];
  const answerImages = [...question.answerImages];
  const answerItemKeys = [...question.shopkeeper.answerItemKeys];
  const answerCosts = [...question.shopkeeper.answerCosts];
  const [answer] = answers.splice(question.correctIndex, 1);
  const [image] = answerImages.splice(question.correctIndex, 1);
  const [answerItemKey] = answerItemKeys.splice(question.correctIndex, 1);
  const [answerCost] = answerCosts.splice(question.correctIndex, 1);
  answers.splice(targetIndex, 0, answer);
  answerImages.splice(targetIndex, 0, image);
  answerItemKeys.splice(targetIndex, 0, answerItemKey);
  answerCosts.splice(targetIndex, 0, answerCost);
  question.answers = answers;
  question.answerImages = answerImages;
  question.shopkeeper.answerItemKeys = answerItemKeys;
  question.shopkeeper.answerCosts = answerCosts;
  question.correctIndex = targetIndex;
}

metadata.contentVersion = `${metadata.patch}-variety-6`;
metadata.questionCount = rebuilt.length;
metadata.categoryCounts = Object.fromEntries(
  [...new Set(rebuilt.map((question) => question.category))]
    .sort()
    .map((category) => [category, rebuilt.filter((question) => question.category === category).length]),
);
metadata.kindCounts = Object.fromEntries(
  [...new Set(rebuilt.map((question) => question.kind))]
    .sort()
    .map((kind) => [kind, rebuilt.filter((question) => question.kind === kind).length]),
);
metadata.assetValidation.verifiedAssetCount = new Set(rebuilt.flatMap(questionImageUrls)).size;

await writeFile(QUESTIONS_PATH, `${JSON.stringify(rebuilt, null, 2)}\n`);
await writeFile(META_PATH, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`Rebalanced ${shopkeeperQuestions.length} Shopkeeper questions; removed ${removed} giveaway recipes.`);
