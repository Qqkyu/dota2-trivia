#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditImageAssets, questionImageUrls } from "./image-assets.mjs";
import { spellDifficulty, spellDistractors } from "./spell-difficulty.mjs";
import { buildSpellHint } from "./spell-hints.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "src", "data", "questions.generated.json");
const META_OUTPUT = join(ROOT, "src", "data", "trivia-meta.generated.json");

const PATCH = process.env.DOTA_PATCH ?? "7.41d";
const SNAPSHOT_DATE = process.env.DOTA_SNAPSHOT_DATE ?? new Date().toISOString().slice(0, 10);
const CDN = "https://cdn.cloudflare.steamstatic.com";

const endpoints = {
  heroes: "https://api.opendota.com/api/constants/heroes",
  items: "https://api.opendota.com/api/constants/items",
  abilities: "https://api.opendota.com/api/constants/abilities",
  heroAbilities: "https://api.opendota.com/api/constants/hero_abilities",
};

const cacheArg = process.argv.find((argument) => argument.startsWith("--cache-dir="));
const cacheDirectory = cacheArg ? resolve(cacheArg.split("=")[1]) : undefined;

function hash(input) {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function stableSample(values, amount, salt) {
  return [...values].sort((left, right) => hash(`${salt}:${left.key}`) - hash(`${salt}:${right.key}`)).slice(0, amount);
}

function shuffle(values, salt) {
  return [...values].sort((left, right) => hash(`${salt}:${left}`) - hash(`${salt}:${right}`));
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function numericValue(value) {
  const raw = Array.isArray(value) ? value : [value];
  const parsed = raw.map((entry) => {
    if (typeof entry === "number") return entry;
    if (typeof entry !== "string" || !/^-?\d+(?:\.\d+)?$/.test(entry.trim())) return Number.NaN;
    return Number(entry);
  });

  return parsed.every(Number.isFinite) ? parsed : undefined;
}

function numericOptions(correct, kind, salt) {
  let step = 5;
  if (kind === "mana") step = correct < 80 ? 10 : correct < 220 ? 20 : 50;
  if (kind === "cooldown") step = correct <= 8 ? 1 : correct <= 20 ? 2 : correct <= 60 ? 5 : 10;
  if (kind === "damage") step = correct < 100 ? 20 : correct < 300 ? 50 : 100;
  if (kind === "speed") step = 5;

  const candidates = [
    correct,
    Math.max(step, correct - step),
    correct + step,
    correct + step * 2,
    Math.max(step, correct - step * 2),
  ];
  const unique = [...new Set(candidates.map(formatNumber))].slice(0, 4);
  while (unique.length < 4) unique.push(formatNumber(correct + step * (unique.length + 1)));

  return shuffle(unique, salt);
}

function makeQuestion({
  id,
  category,
  difficulty,
  eyebrow,
  prompt,
  image,
  answers,
  correctAnswer,
  answerImagesByValue,
  explanation,
  hint,
  source,
}) {
  const orderedAnswers = shuffle(answers, id);
  const question = {
    id,
    category,
    difficulty,
    eyebrow,
    prompt,
    image,
    answers: orderedAnswers,
    correctIndex: orderedAnswers.indexOf(correctAnswer),
    explanation,
    source,
    patch: PATCH,
  };

  if (hint) question.hint = hint;

  if (answerImagesByValue && orderedAnswers.every((answer) => answerImagesByValue[answer])) {
    question.answerImages = orderedAnswers.map((answer) => answerImagesByValue[answer]);
  }

  return question;
}

function asset(path) {
  return path ? `${CDN}${path.replace(/\?$/, "")}` : undefined;
}

function formatRecipeComponents(componentKeys, itemData) {
  const counts = new Map();

  for (const key of componentKeys) {
    const name = itemData[key]?.dname ?? key;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name)).join(", ");
}

async function loadDataset(name, url) {
  if (cacheDirectory) {
    const cacheName = name === "heroAbilities" ? "hero-abilities" : name;
    return JSON.parse(await readFile(join(cacheDirectory, `dota-${cacheName}.json`), "utf8"));
  }

  const response = await fetch(url, {
    headers: {
      "user-agent": "queue-arcade-data-sync/1.0",
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.json();
}

const [heroesById, itemsByKey, abilitiesByKey, heroAbilitiesByKey] = await Promise.all(
  Object.entries(endpoints).map(([name, url]) => loadDataset(name, url)),
);

const heroes = Object.values(heroesById)
  .filter((hero) => hero.localized_name && hero.name && hero.img)
  .map((hero) => ({
    ...hero,
    key: hero.name,
    image: asset(hero.img),
  }));

const heroByKey = new Map(heroes.map((hero) => [hero.key, hero]));
const ownersByAbility = new Map();

for (const [heroKey, data] of Object.entries(heroAbilitiesByKey)) {
  const hero = heroByKey.get(heroKey);
  if (!hero) continue;

  for (const abilityKey of data.abilities ?? []) {
    if (!ownersByAbility.has(abilityKey)) ownersByAbility.set(abilityKey, []);
    ownersByAbility.get(abilityKey).push(hero);
  }
}

const abilities = [...ownersByAbility.entries()]
  .filter(([key, owners]) => {
    const ability = abilitiesByKey[key];
    return (
      owners.length === 1 &&
      ability?.dname &&
      ability?.img &&
      !key.includes("generic_hidden") &&
      !key.includes("empty") &&
      !key.startsWith("special_bonus")
    );
  })
  .map(([key, owners]) => ({
    ...abilitiesByKey[key],
    key,
    owner: owners[0],
    image: asset(abilitiesByKey[key].img),
  }));

const questionSource = {
  label: `OpenDota constants · ${SNAPSHOT_DATE}`,
  url: "https://docs.opendota.com/",
};

const questions = [];

for (const ability of stableSample(abilities, 72, "ability-owner")) {
  const ownerAbilityKeys = heroAbilitiesByKey[ability.owner.key]?.abilities ?? [];
  const difficulty = spellDifficulty(ability.key, ownerAbilityKeys);
  const distractors = spellDistractors(ability.owner, heroes, difficulty, ability.key, hash);
  const answerHeroes = [ability.owner, ...distractors];

  questions.push(
    makeQuestion({
      id: `ability-owner:${ability.key}`,
      category: "Abilities",
      difficulty,
      eyebrow: ability.dname,
      prompt: "Which hero owns this ability?",
      image: { src: ability.image, alt: `${ability.dname} ability icon`, kind: "ability" },
      answers: answerHeroes.map((hero) => hero.localized_name),
      correctAnswer: ability.owner.localized_name,
      answerImagesByValue: Object.fromEntries(answerHeroes.map((hero) => [hero.localized_name, hero.image])),
      explanation: `${ability.dname} belongs to ${ability.owner.localized_name}.${ability.desc ? ` ${ability.desc}` : ""}`,
      hint: buildSpellHint(ability.desc, ability.owner.localized_name, ability.dname),
      source: questionSource,
    }),
  );
}

const manaAbilities = abilities.filter((ability) => {
  const values = numericValue(ability.mc);
  return values?.length && values.every((value) => value > 0 && value < 1000);
});

for (const ability of stableSample(manaAbilities, 60, "mana")) {
  const values = numericValue(ability.mc);
  const levelIndex = values.length > 1 ? hash(ability.key) % values.length : 0;
  const correct = values[levelIndex];
  const answerValues = numericOptions(correct, "mana", `mana:${ability.key}:${levelIndex}`);
  const levelLabel = values.length > 1 ? ` at level ${levelIndex + 1}` : "";

  questions.push(
    makeQuestion({
      id: `mana:${ability.key}:${levelIndex + 1}`,
      category: "Mana",
      difficulty: 2,
      eyebrow: `${ability.owner.localized_name} · ${ability.dname}`,
      prompt: `How much mana does ${ability.dname} cost${levelLabel}?`,
      image: { src: ability.image, alt: `${ability.dname} ability icon`, kind: "ability" },
      answers: answerValues,
      correctAnswer: formatNumber(correct),
      explanation: `${ability.dname}'s mana cost is ${values.map(formatNumber).join(" / ")}${values.length > 1 ? " across its levels" : ""}, before modifiers.`,
      source: questionSource,
    }),
  );
}

const cooldownAbilities = abilities.filter((ability) => {
  const values = numericValue(ability.cd);
  return values?.length && values.every((value) => value > 0 && value <= 300);
});

for (const ability of stableSample(cooldownAbilities, 52, "cooldown")) {
  const values = numericValue(ability.cd);
  const levelIndex = values.length - 1;
  const correct = values[levelIndex];
  const answerValues = numericOptions(correct, "cooldown", `cooldown:${ability.key}`);
  const levelLabel = values.length > 1 ? " at max level" : "";

  questions.push(
    makeQuestion({
      id: `cooldown:${ability.key}:${levelIndex + 1}`,
      category: "Cooldowns",
      difficulty: 3,
      eyebrow: `${ability.owner.localized_name} · ${ability.dname}`,
      prompt: `What is ${ability.dname}'s cooldown${levelLabel}?`,
      image: { src: ability.image, alt: `${ability.dname} ability icon`, kind: "ability" },
      answers: answerValues.map((answer) => `${answer}s`),
      correctAnswer: `${formatNumber(correct)}s`,
      explanation: `${ability.dname}'s cooldown is ${values.map((value) => `${formatNumber(value)}s`).join(" / ")}${values.length > 1 ? " across its levels" : ""}, before reductions.`,
      source: questionSource,
    }),
  );
}

const damageAbilities = abilities
  .map((ability) => {
    const damageAttribute = ability.attrib?.find((attribute) => attribute.header === "DAMAGE:");
    return { ability, values: numericValue(damageAttribute?.value) };
  })
  .filter(({ values }) => values?.length && values.every((value) => value > 0 && value <= 2000));

for (const { ability, values } of stableSample(
  damageAbilities.map((entry) => ({ ...entry, key: entry.ability.key })),
  48,
  "damage",
)) {
  const levelIndex = values.length - 1;
  const correct = values[levelIndex];
  const answerValues = numericOptions(correct, "damage", `damage:${ability.key}`);
  const levelLabel = values.length > 1 ? " at max level" : "";

  questions.push(
    makeQuestion({
      id: `damage:${ability.key}:${levelIndex + 1}`,
      category: "Damage",
      difficulty: 3,
      eyebrow: `${ability.owner.localized_name} · ${ability.dname}`,
      prompt: `How much damage does ${ability.dname} deal${levelLabel}?`,
      image: { src: ability.image, alt: `${ability.dname} ability icon`, kind: "ability" },
      answers: answerValues,
      correctAnswer: formatNumber(correct),
      explanation: `${ability.dname} deals ${values.map(formatNumber).join(" / ")}${values.length > 1 ? " damage across its levels" : " damage"}, before talents and upgrades.`,
      source: questionSource,
    }),
  );
}

const attributeNames = {
  str: "Strength",
  agi: "Agility",
  int: "Intelligence",
  all: "Universal",
};

for (const hero of stableSample(heroes, 44, "primary-attribute")) {
  const correct = attributeNames[hero.primary_attr];
  if (!correct) continue;

  questions.push(
    makeQuestion({
      id: `primary-attribute:${hero.key}`,
      category: "Heroes",
      difficulty: 1,
      eyebrow: hero.localized_name,
      prompt: `What is ${hero.localized_name}'s primary attribute?`,
      image: { src: hero.image, alt: `${hero.localized_name} hero portrait`, kind: "hero" },
      answers: Object.values(attributeNames),
      correctAnswer: correct,
      explanation: `${hero.localized_name} is a ${correct} hero in patch ${PATCH}.`,
      source: questionSource,
    }),
  );
}

for (const hero of stableSample(
  heroes.filter((entry) => Number.isFinite(entry.move_speed)),
  40,
  "move-speed",
)) {
  const correct = Number(hero.move_speed);
  const answerValues = numericOptions(correct, "speed", `speed:${hero.key}`);

  questions.push(
    makeQuestion({
      id: `move-speed:${hero.key}`,
      category: "Heroes",
      difficulty: 2,
      eyebrow: hero.localized_name,
      prompt: `What is ${hero.localized_name}'s base movement speed?`,
      image: { src: hero.image, alt: `${hero.localized_name} hero portrait`, kind: "hero" },
      answers: answerValues,
      correctAnswer: formatNumber(correct),
      explanation: `${hero.localized_name} has ${formatNumber(correct)} base movement speed, before boots and other modifiers.`,
      source: questionSource,
    }),
  );
}

const popularItemKeys = [
  "blink",
  "overwhelming_blink",
  "swift_blink",
  "arcane_blink",
  "black_king_bar",
  "ultimate_scepter",
  "aghanims_shard",
  "butterfly",
  "rapier",
  "power_treads",
  "phase_boots",
  "travel_boots",
  "travel_boots_2",
  "hand_of_midas",
  "magic_wand",
  "bracer",
  "wraith_band",
  "null_talisman",
  "tango",
  "clarity",
  "flask",
  "enchanted_mango",
  "ward_observer",
  "ward_sentry",
  "dust",
  "smoke_of_deceit",
  "gem",
  "quelling_blade",
  "bottle",
  "soul_ring",
  "falcon_blade",
  "armlet",
  "blade_mail",
  "vanguard",
  "crimson_guard",
  "pipe",
  "hood_of_defiance",
  "mekansm",
  "guardian_greaves",
  "force_staff",
  "hurricane_pike",
  "glimmer_cape",
  "ghost",
  "cyclone",
  "sheepstick",
  "orchid",
  "bloodthorn",
  "sphere",
  "lotus_orb",
  "aeon_disk",
  "manta",
  "sange_and_yasha",
  "kaya_and_sange",
  "yasha_and_kaya",
  "skadi",
  "satanic",
  "heart",
  "assault",
  "shivas_guard",
  "radiance",
  "monkey_king_bar",
  "desolator",
  "daedalus",
  "greater_crit",
  "basher",
  "abyssal_blade",
  "mjollnir",
  "maelstrom",
  "gleipnir",
  "battlefury",
  "silver_edge",
  "invis_sword",
  "ethereal_blade",
  "dagon",
  "octarine_core",
  "refresher",
  "bloodstone",
  "moon_shard",
];

const items = popularItemKeys
  .map((key) => ({ ...itemsByKey[key], key, image: asset(itemsByKey[key]?.img) }))
  .filter((item) => item.dname && item.image && Number.isFinite(item.cost) && item.cost > 0);

for (const item of items) {
  const nearbyItems = items
    .filter((candidate) => candidate.key !== item.key && candidate.cost !== item.cost)
    .sort((left, right) => Math.abs(left.cost - item.cost) - Math.abs(right.cost - item.cost));
  const seenCosts = new Set();
  const nearbyCosts = nearbyItems
    .filter((candidate) => {
      if (seenCosts.has(candidate.cost)) return false;
      seenCosts.add(candidate.cost);
      return true;
    })
    .slice(0, 8);
  const distractorCosts = stableSample(nearbyCosts, 3, `item-cost:${item.key}`).map((candidate) => candidate.cost);
  const correct = `${item.cost.toLocaleString("en-US")} gold`;

  questions.push(
    makeQuestion({
      id: `item-cost:${item.key}`,
      category: "Items",
      difficulty: item.cost >= 3000 ? 2 : 1,
      eyebrow: item.dname,
      prompt: `How much does ${item.dname} cost?`,
      image: { src: item.image, alt: `${item.dname} item icon`, kind: "item" },
      answers: [item.cost, ...distractorCosts].map((value) => `${value.toLocaleString("en-US")} gold`),
      correctAnswer: correct,
      explanation: `${item.dname} costs ${item.cost.toLocaleString("en-US")} gold in patch ${PATCH}.`,
      source: questionSource,
    }),
  );
}

const componentPool = [...new Set(items.flatMap((item) => item.components ?? []))]
  .map((key) => ({ ...itemsByKey[key], key, image: asset(itemsByKey[key]?.img) }))
  .filter((item) => item.dname);

for (const item of stableSample(
  items.filter((entry) => entry.components?.length),
  36,
  "item-components",
)) {
  const componentKey = item.components[hash(`component:${item.key}`) % item.components.length];
  const component = itemsByKey[componentKey];
  if (!component?.dname) continue;

  const distractors = stableSample(
    componentPool.filter((candidate) => !item.components.includes(candidate.key)),
    3,
    `components:${item.key}`,
  );
  const answerItems = [{ ...component, key: componentKey, image: asset(component.img) }, ...distractors];

  questions.push(
    makeQuestion({
      id: `item-component:${item.key}:${componentKey}`,
      category: "Recipes",
      difficulty: 2,
      eyebrow: item.dname,
      prompt: `Which item is part of ${item.dname}'s recipe?`,
      image: { src: item.image, alt: `${item.dname} item icon`, kind: "item" },
      answers: answerItems.map((answerItem) => answerItem.dname),
      correctAnswer: component.dname,
      answerImagesByValue: Object.fromEntries(answerItems.map((answerItem) => [answerItem.dname, answerItem.image])),
      explanation: `${item.dname} is built with ${formatRecipeComponents(item.components, itemsByKey)}.`,
      source: questionSource,
    }),
  );
}

console.log(`Checking artwork for ${questions.length} generated questions...`);
const { availability } = await auditImageAssets(questions);
const rejectedQuestions = questions.filter((question) =>
  questionImageUrls(question).some((url) => !availability.get(url)),
);
const sortedQuestions = questions
  .filter((question) => !rejectedQuestions.includes(question))
  .sort((left, right) => left.id.localeCompare(right.id));
const verifiedAssetCount = new Set(sortedQuestions.flatMap(questionImageUrls)).size;
const categoryCounts = Object.fromEntries(
  [...new Set(sortedQuestions.map((question) => question.category))].map((category) => [
    category,
    sortedQuestions.filter((question) => question.category === category).length,
  ]),
);

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(sortedQuestions, null, 2)}\n`);
await writeFile(
  META_OUTPUT,
  `${JSON.stringify(
    {
      patch: PATCH,
      snapshotDate: SNAPSHOT_DATE,
      questionCount: sortedQuestions.length,
      categoryCounts,
      sources: endpoints,
      assetValidation: {
        checkedAt: SNAPSHOT_DATE,
        verifiedAssetCount,
        rejectedQuestionIds: rejectedQuestions.map((question) => question.id).sort(),
      },
    },
    null,
    2,
  )}\n`,
);

console.log(`Generated ${sortedQuestions.length} questions for Dota ${PATCH}.`);
console.log(categoryCounts);
if (rejectedQuestions.length) {
  console.warn(`Rejected ${rejectedQuestions.length} questions with unavailable artwork:`);
  console.warn(
    rejectedQuestions
      .map((question) => question.id)
      .sort()
      .join("\n"),
  );
}
