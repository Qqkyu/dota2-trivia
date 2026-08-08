#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { CLIENT_CONSTANT_AUDIT } from "./client-constant-audit.mjs";
import { parseValveKeyValues } from "./valve-keyvalues.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "src", "data", "shopkeeper-questions.json");
const CATALOG_OUTPUT = join(ROOT, "src", "data", "shopkeeper-catalog.json");
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
  "skadi",
  "assault",
  "black_king_bar",
  "desolator",
  "heart",
  "manta",
  "nullifier",
  "octarine_core",
  "orchid",
  "pipe",
  "radiance",
  "refresher",
  "soul_booster",
  "spirit_vessel",
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
  "abyssal_blade",
  "disperser",
  "silver_edge",
  "helm_of_the_overlord",
  "mjollnir",
  "ethereal_blade",
  "sheepstick",
  "greater_crit",
  "bloodstone",
  "harpoon",
  "gungir",
  "hurricane_pike",
  "hydras_breath",
  "consecrated_wraps",
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
  ["yasha", "orb_of_corrosion"],
  ["basher", "ancient_janggo"],
  ["ultimate_scepter", "specialists_array"],
  ["armlet", "mage_slayer"],
  ["monkey_king_bar", "invis_sword"],
  ["phase_boots", "arcane_boots"],
  ["vladmir", "assault"],
  ["witch_blade", "solar_crest"],
  ["shivas_guard", "gungir"],
  ["butterfly", "satanic"],
  ["pipe", "consecrated_wraps"],
  ["dagon", "meteor_hammer"],
  ["monkey_king_bar", "silver_edge"],
  ["hurricane_pike", "hydras_breath"],
  ["swift_blink", "butterfly"],
  ["lotus_orb", "aeon_disk"],
  ["force_staff", "veil_of_discord"],
  ["mekansm", "ancient_janggo"],
  ["assault", "mjollnir"],
  ["bloodthorn", "maelstrom"],
  ["black_king_bar", "maelstrom"],
  ["orchid", "bloodthorn"],
  ["heart", "satanic"],
  ["invis_sword", "glimmer_cape"],
  ["spirit_vessel", "essence_distiller"],
  ["veil_of_discord", "revenants_brooch"],
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

// The group names and item order mirror dota/scripts/shops.txt. The file is
// compiled into Valve's VPKs, so we keep the audited layout here and validate
// every item against the same live-client constants used for the questions.
const SHOP_CATALOG_GROUPS = [
  {
    key: "consumables",
    label: "Consumables",
    section: "basics",
    items: [
      "tpscroll",
      "clarity",
      "faerie_fire",
      "smoke_of_deceit",
      "ward_observer",
      "ward_sentry",
      "enchanted_mango",
      "flask",
      "tango",
      "blood_grenade",
      "dust",
      "bottle",
      "infused_raindrop",
      "aghanims_shard",
    ],
  },
  {
    key: "attributes",
    label: "Attributes",
    section: "basics",
    items: [
      "branches",
      "gauntlets",
      "slippers",
      "mantle",
      "circlet",
      "belt_of_strength",
      "boots_of_elves",
      "robe",
      "crown",
      "ogre_axe",
      "blade_of_alacrity",
      "staff_of_wizardry",
      "diadem",
      "ghost",
    ],
  },
  {
    key: "weapons_armor",
    label: "Armaments",
    section: "basics",
    items: [
      "quelling_blade",
      "ring_of_protection",
      "blades_of_attack",
      "orb_of_frost",
      "gloves",
      "chainmail",
      "broadsword",
      "blight_stone",
      "blitz_knuckles",
      "splintmail",
      "claymore",
      "orb_of_venom",
      "javelin",
      "helm_of_iron_will",
      "mithril_hammer",
    ],
  },
  {
    key: "misc",
    label: "Arcane",
    section: "basics",
    items: [
      "ring_of_regen",
      "sobi_mask",
      "wind_lace",
      "magic_stick",
      "fluffy_hat",
      "wizard_hat",
      "boots",
      "voodoo_mask",
      "shawl",
      "shadow_amulet",
      "gem",
      "lifesteal",
      "cloak",
      "chasm_stone",
      "blink",
    ],
  },
  {
    key: "secretshop",
    label: "Secret Shop",
    section: "basics",
    items: [
      "ring_of_health",
      "void_stone",
      "talisman_of_evasion",
      "platemail",
      "ring_of_tarrasque",
      "tiara_of_selemene",
      "hyperstone",
      "demon_edge",
      "vitality_booster",
      "energy_booster",
      "point_booster",
      "relic",
      "reaver",
      "eagle",
      "mystic_staff",
      "ultimate_orb",
    ],
  },
  {
    key: "basics",
    label: "Common",
    section: "upgrades",
    items: [
      "magic_wand",
      "bracer",
      "wraith_band",
      "null_talisman",
      "power_treads",
      "soul_ring",
      "orb_of_corrosion",
      "falcon_blade",
      "phase_boots",
      "pers",
      "mask_of_madness",
      "oblivion_staff",
      "travel_boots",
      "hand_of_midas",
      "moon_shard",
      "soul_booster",
    ],
  },
  {
    key: "support",
    label: "Support",
    section: "upgrades",
    items: [
      "ring_of_basilius",
      "headdress",
      "urn_of_shadows",
      "tranquil_boots",
      "arcane_boots",
      "mekansm",
      "essence_distiller",
      "ancient_janggo",
      "pavise",
      "guardian_greaves",
      "spirit_vessel",
      "boots_of_bearing",
      "solar_crest",
      "glimmer_cape",
      "holy_locket",
      "pipe",
    ],
  },
  {
    key: "magics",
    label: "Caster",
    section: "upgrades",
    items: [
      "veil_of_discord",
      "rod_of_atos",
      "cyclone",
      "phylactery",
      "bloodstone",
      "gungir",
      "wind_waker",
      "angels_demise",
      "force_staff",
      "aether_lens",
      "meteor_hammer",
      "dagon",
      "ultimate_scepter",
      "crellas_crozier",
      "octarine_core",
      "orchid",
      "refresher",
      "ethereal_blade",
      "sheepstick",
      "bloodthorn",
    ],
  },
  {
    key: "defense",
    label: "Armor",
    section: "upgrades",
    items: [
      "buckler",
      "vanguard",
      "blade_mail",
      "helm_of_the_dominator",
      "vladmir",
      "crimson_guard",
      "armlet",
      "helm_of_the_overlord",
      "consecrated_wraps",
      "aeon_disk",
      "lotus_orb",
      "black_king_bar",
      "shivas_guard",
      "sphere",
      "assault",
      "heart",
    ],
  },
  {
    key: "weapons",
    label: "Weapons",
    section: "upgrades",
    items: [
      "lesser_crit",
      "mage_slayer",
      "heavens_halberd",
      "desolator",
      "revenants_brooch",
      "basher",
      "maelstrom",
      "invis_sword",
      "greater_crit",
      "abyssal_blade",
      "mjollnir",
      "silver_edge",
      "bfury",
      "nullifier",
      "manta",
      "radiance",
      "rapier",
      "monkey_king_bar",
      "butterfly",
      "satanic",
    ],
  },
  {
    key: "artifacts",
    label: "Armaments",
    section: "upgrades",
    items: [
      "sange",
      "yasha",
      "kaya",
      "dragon_lance",
      "kaya_and_sange",
      "sange_and_yasha",
      "yasha_and_kaya",
      "hurricane_pike",
      "echo_sabre",
      "diffusal_blade",
      "witch_blade",
      "specialists_array",
      "harpoon",
      "disperser",
      "devastator",
      "hydras_breath",
      "overwhelming_blink",
      "swift_blink",
      "arcane_blink",
      "skadi",
    ],
  },
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
    prompt: `Build ${target.name}.`,
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

const expectedKindCounts = new Map([
  ["shopkeeper-build-result", 26],
  ["shopkeeper-real-recipe", 26],
  ["shopkeeper-shared-part", 38],
  ["shopkeeper-upgrade-path", 12],
]);
for (const [kind, expectedCount] of expectedKindCounts) {
  const count = questions.filter((question) => question.kind === kind).length;
  if (count !== expectedCount) throw new Error(`${kind}: expected ${expectedCount} questions, generated ${count}.`);
}

const serializedQuestions = await format(
  JSON.stringify(questions.sort((left, right) => left.id.localeCompare(right.id))),
  { parser: "json", printWidth: 120 },
);
const catalog = {
  patch: PATCH,
  clientBuild: CLIENT_CONSTANT_AUDIT.clientBuild,
  source: "Dota 2 client scripts/shops.txt",
  groups: SHOP_CATALOG_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    section: group.section,
    items: group.items.map((key) => {
      const definition = itemDefinitions[`item_${key}`];
      const cost = liveCost(key);
      if (
        !definition ||
        String(scalar(definition.ItemPurchasable) ?? "1") === "0" ||
        String(scalar(definition.IsObsolete) ?? "0") === "1" ||
        !Number.isFinite(cost) ||
        cost < 0 ||
        !canDisplay(key)
      ) {
        throw new Error(`Shop catalog item ${key} is not valid in client build ${CLIENT_CONSTANT_AUDIT.clientBuild}.`);
      }
      return {
        key,
        name: itemsByKey[key].dname,
        image: artwork(itemsByKey[key].img),
        cost,
      };
    }),
  })),
};
const serializedCatalog = await format(JSON.stringify(catalog), { parser: "json", printWidth: 120 });
await writeFile(OUTPUT, serializedQuestions);
await writeFile(CATALOG_OUTPUT, serializedCatalog);
console.log(
  `Generated ${questions.length} Shopkeeper questions and ${catalog.groups.reduce((total, group) => total + group.items.length, 0)} shop entries from Dota ${PATCH} client build ${CLIENT_CONSTANT_AUDIT.clientBuild}.`,
);
console.log(
  Object.fromEntries(
    [...expectedKindCounts.keys()].map((kind) => [kind, questions.filter((question) => question.kind === kind).length]),
  ),
);
