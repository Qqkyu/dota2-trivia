#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { seededShuffle } from "../src/lib/variety.mjs";
import { valueOrderAnswerKey } from "../src/lib/value-order.mjs";

const ROOT = process.cwd();
const QUESTIONS_PATH = join(ROOT, "src", "data", "questions.generated.json");
const HERO_PICKER_PATH = join(ROOT, "src", "data", "hero-picker.json");
const OUTPUT_PATH = join(ROOT, "src", "data", "value-order-questions.json");
const GENERATED_FAMILY_COUNT = 12;

const FAMILY_CONFIG = Object.freeze({
  "item-price": {
    kind: "value-order-item",
    category: "Items",
    eyebrow: "Item prices",
    prompt: "How do these items rank from cheapest to most expensive?",
    lead: "Cheapest to priciest",
  },
  "ability-cooldown": {
    kind: "value-order-cooldown",
    category: "Cooldowns",
    eyebrow: "Base cooldowns",
    prompt: "How do these abilities rank from shortest to longest cooldown?",
    lead: "Shortest to longest",
  },
  "ability-mana": {
    kind: "value-order-mana",
    category: "Mana",
    eyebrow: "Max-level mana costs",
    prompt: "How do these abilities rank from lowest to highest max-level mana cost?",
    lead: "Lowest to highest",
  },
  "ability-damage": {
    kind: "value-order-damage",
    category: "Damage",
    eyebrow: "Max-level damage",
    prompt: "How do these abilities rank from lowest to highest max-level damage?",
    lead: "Lowest to highest",
  },
  "hero-move-speed": {
    kind: "value-order-move-speed",
    category: "Heroes",
    eyebrow: "Base movement speed",
    prompt: "How do these heroes rank from slowest to fastest?",
    lead: "Slowest to fastest",
  },
  "hero-attack-range": {
    kind: "value-order-attack-range",
    category: "Heroes",
    eyebrow: "Base attack range",
    prompt: "How do these heroes rank from shortest to longest attack range?",
    lead: "Shortest to longest",
  },
});

const ITEM_SETS = [
  ["clarity", "enchanted_mango", "dust", "tango"],
  ["magic_wand", "bracer", "bottle", "soul_ring"],
  ["gem", "falcon_blade", "aghanims_shard", "phase_boots"],
  ["ghost", "vanguard", "mekansm", "glimmer_cape"],
  ["force_staff", "blink", "blade_mail", "armlet"],
  ["travel_boots", "cyclone", "basher", "maelstrom"],
  ["aeon_disk", "invis_sword", "orchid", "desolator"],
  ["crimson_guard", "lotus_orb", "moon_shard", "black_king_bar"],
  ["kaya_and_sange", "guardian_greaves", "shivas_guard", "manta"],
  ["bloodstone", "sphere", "octarine_core", "monkey_king_bar"],
  ["refresher", "satanic", "greater_crit", "assault"],
  ["ethereal_blade", "butterfly", "mjollnir", "rapier"],
  ["silver_edge", "skadi", "abyssal_blade", "bloodthorn"],
  ["glimmer_cape", "blink", "armlet", "basher"],
  ["orchid", "pipe", "hurricane_pike", "shivas_guard"],
  ["aghanims_shard", "vanguard", "force_staff", "blade_mail"],
];

const COOLDOWN_SETS = [
  ["spectre_reality", "zuus_arc_lightning", "bristleback_viscous_nasal_goo", "weaver_geminate_attack"],
  ["undying_decay", "tinker_rearm", "death_prophet_carrion_swarm", "invoker_invoke"],
  ["faceless_void_time_walk", "lina_light_strike_array", "lina_dragon_slave", "kunkka_torrent"],
  ["pugna_life_drain", "oracle_fates_edict", "mars_gods_rebuke", "bane_brain_sap"],
  ["skeleton_king_hellfire_blast", "marci_grapple", "bloodseeker_blood_bath", "batrider_flamebreak"],
  ["meepo_earthbind", "bane_brain_sap", "spirit_breaker_charge_of_darkness", "phantom_assassin_fan_of_knives"],
  ["batrider_flamebreak", "phantom_assassin_fan_of_knives", "snapfire_firesnap_cookie", "mirana_arrow"],
  ["mirana_arrow", "elder_titan_ancestral_spirit", "warlock_fatal_bonds", "pudge_dismember"],
  ["warlock_fatal_bonds", "pudge_dismember", "sandking_sand_storm", "largo_croak_of_genius"],
  ["largo_croak_of_genius", "invoker_tornado", "furion_force_of_nature", "spirit_breaker_nether_strike"],
  ["obsidian_destroyer_objurgation", "hoodwink_decoy", "spirit_breaker_nether_strike", "meepo_petrify"],
  ["spirit_breaker_planar_pocket", "spirit_breaker_nether_strike", "oracle_rain_of_destiny", "lina_laguna_blade"],
  ["lina_laguna_blade", "gyrocopter_call_down", "alchemist_chemical_rage", "axe_culling_blade"],
  ["gyrocopter_call_down", "batrider_flaming_lasso", "disruptor_static_storm", "witch_doctor_death_ward"],
  ["beastmaster_primal_roar", "ringmaster_wheel", "witch_doctor_death_ward", "chen_hand_of_god"],
  ["axe_culling_blade", "witch_doctor_death_ward", "chen_hand_of_god", "enigma_black_hole"],
];

function numericAnswer(question) {
  const answer = question.answers?.[question.correctIndex];
  const parsed = typeof answer === "string" ? Number(answer.replace(/[^\d.]/g, "")) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new Error(`${question.id} has no numeric correct answer.`);
  return parsed;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function splitAbilityEyebrow(question) {
  const [hero, ability] = question.eyebrow.split(" · ");
  if (!hero || !ability) throw new Error(`${question.id} has no hero and ability identity.`);
  return { hero, ability };
}

function maxLevelMana(question) {
  const match = question.explanation?.match(/mana cost is ([\d\s/.]+?)(?: across its levels|, before)/i);
  const values = match?.[1]
    .split("/")
    .map((value) => Number(value.trim()))
    .filter(Number.isFinite);
  const value = values?.at(-1);
  if (!Number.isFinite(value)) throw new Error(`${question.id} has no auditable max-level mana value.`);
  return value;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function privateAnswerChoices(correctKeys, correctIndex) {
  const alternatives = [
    correctKeys,
    [correctKeys[1], correctKeys[0], correctKeys[2], correctKeys[3]],
    [correctKeys[0], correctKeys[2], correctKeys[1], correctKeys[3]],
    [...correctKeys].reverse(),
  ];
  const correct = alternatives[0];
  const wrong = alternatives.slice(1);
  const ordered = [...wrong];
  ordered.splice(correctIndex, 0, correct);
  return ordered.map((keys) => valueOrderAnswerKey(keys));
}

function itemEntry(question) {
  return {
    key: question.id.replace(/^item-cost:/, ""),
    name: question.eyebrow,
    image: question.image?.src,
    kind: "item",
    value: numericAnswer(question),
    label: question.answers[question.correctIndex],
    sourceId: question.id,
    source: question.source,
    patch: question.patch,
  };
}

function cooldownEntry(question) {
  const { hero, ability } = splitAbilityEyebrow(question);
  return {
    key: question.id.split(":")[1],
    name: ability,
    context: hero,
    image: question.image?.src,
    kind: "ability",
    value: numericAnswer(question),
    label: question.answers[question.correctIndex],
    sourceId: question.id,
    source: question.source,
    patch: question.patch,
  };
}

function manaEntry(question) {
  const { hero, ability } = splitAbilityEyebrow(question);
  const value = maxLevelMana(question);
  return {
    key: question.id.split(":")[1],
    name: ability,
    context: hero,
    image: question.image?.src,
    kind: "ability",
    value,
    label: `${formatNumber(value)} mana`,
    sourceId: question.id,
    source: question.source,
    patch: question.patch,
  };
}

function damageEntry(question) {
  const { hero, ability } = splitAbilityEyebrow(question);
  const value = numericAnswer(question);
  return {
    key: question.id.split(":")[1],
    name: ability,
    context: hero,
    image: question.image?.src,
    kind: "ability",
    value,
    label: `${formatNumber(value)} damage`,
    sourceId: question.id,
    source: question.source,
    patch: question.patch,
  };
}

function movementEntry(question) {
  const value = numericAnswer(question);
  return {
    key: question.id.replace(/^move-speed:/, ""),
    name: question.eyebrow,
    image: question.image?.src,
    kind: "hero",
    value,
    label: `${formatNumber(value)} move speed`,
    sourceId: question.id,
    source: question.source,
    patch: question.patch,
  };
}

function attackRangeEntries(question, heroByName, heroByImage) {
  return question.answers.map((name, index) => {
    const hero = heroByName.get(name) ?? heroByImage.get(question.answerImages?.[index]);
    const match = question.explanation?.match(new RegExp(`${escapeRegex(name)}\\s+([\\d.]+)`));
    const value = Number(match?.[1]);
    if (!hero || !Number.isFinite(value)) {
      throw new Error(`${question.id} cannot audit ${name}'s attack range.`);
    }
    return {
      key: hero.key,
      name: hero.name,
      image: hero.image,
      kind: "hero",
      value,
      label: `${formatNumber(value)} range`,
      sourceId: question.id,
      source: question.source,
      patch: question.patch,
    };
  });
}

function closeValueSets(entries, family, count) {
  const entriesByValue = new Map();
  for (const entry of entries) {
    const group = entriesByValue.get(entry.value) ?? [];
    group.push(entry);
    entriesByValue.set(entry.value, group);
  }
  const groups = [...entriesByValue.entries()]
    .sort(([left], [right]) => left - right)
    .map(([value, candidates]) => ({
      value,
      candidates: [...candidates].sort((left, right) => left.key.localeCompare(right.key)),
    }));
  const windows = groups.slice(0, -3).map((_, index) => groups.slice(index, index + 4));
  if (!windows.length) throw new Error(`${family} needs at least four distinct audited values.`);

  const sets = [];
  const signatures = new Set();
  for (let attempt = 0; sets.length < count && attempt < count * 100; attempt += 1) {
    const cycle = Math.floor(attempt / windows.length);
    const window = seededShuffle(windows, `${family}:windows:${cycle}`)[attempt % windows.length];
    const selected = window.map(
      ({ value, candidates }) =>
        seededShuffle(candidates, `${family}:set:${sets.length}:attempt:${attempt}:value:${value}`)[0],
    );
    const signature = selected
      .map((entry) => entry.key)
      .sort()
      .join("|");
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    sets.push(selected);
  }
  if (sets.length !== count) {
    throw new Error(`${family} produced only ${sets.length} unique close-value sets; ${count} required.`);
  }
  return sets;
}

function buildQuestion(entries, family, index) {
  const config = FAMILY_CONFIG[family];
  if (!config) throw new Error(`Unknown ordering family ${family}.`);
  if (entries.some((entry) => !entry?.key || !entry.name || !entry.image)) {
    throw new Error(`${family} set ${index + 1} contains an incomplete audited source question.`);
  }
  if (new Set(entries.map((entry) => entry.value)).size !== entries.length) {
    throw new Error(`${family} set ${index + 1} contains a value tie and must be re-curated.`);
  }
  if (new Set(entries.map((entry) => entry.patch)).size !== 1) {
    throw new Error(`${family} set ${index + 1} mixes patches.`);
  }

  const id = `value-order:${family}:${String(index + 1).padStart(2, "0")}`;
  const displayed = seededShuffle(entries, `${id}:cards`);
  const correct = [...entries].sort((left, right) => left.value - right.value || left.key.localeCompare(right.key));
  const correctKeys = correct.map((entry) => entry.key);
  const correctIndex = index % 4;
  const readableOrder = correct.map((entry) => `${entry.name} (${entry.label})`).join(" → ");

  return {
    id,
    kind: config.kind,
    varietyKey: `value-order:${family}`,
    category: config.category,
    difficulty: 3,
    eyebrow: config.eyebrow,
    prompt: config.prompt,
    answers: privateAnswerChoices(correctKeys, correctIndex),
    correctIndex,
    explanation: `${config.lead}: ${readableOrder}.`,
    valueOrder: {
      family,
      direction: "ascending",
      cards: displayed.map(({ key, name, context, image, kind }) => ({
        key,
        name,
        ...(context ? { context } : {}),
        image,
        kind,
      })),
      values: displayed.map(({ key, value, label }) => ({ key, value, label })),
      correctOrder: correctKeys,
      audit: {
        derivedFrom: entries.map((entry) => entry.sourceId),
        clientBuild: entries[0].source.label.match(/build\s+(\d+)/i)?.[1] ?? "unknown",
      },
    },
    source: entries[0].source,
    patch: entries[0].patch,
  };
}

const [sourceQuestions, heroPicker] = await Promise.all([
  readFile(QUESTIONS_PATH, "utf8").then(JSON.parse),
  readFile(HERO_PICKER_PATH, "utf8").then(JSON.parse),
]);
const heroes = heroPicker.groups.flatMap((group) => group.heroes);
const heroByName = new Map(heroes.map((hero) => [hero.name, hero]));
const heroByImage = new Map(heroes.map((hero) => [hero.image, hero]));
const itemByKey = new Map(
  sourceQuestions
    .filter((question) => question.kind === "item-cost")
    .map((question) => [itemEntry(question).key, itemEntry(question)]),
);
const cooldownByKey = new Map(
  sourceQuestions
    .filter((question) => question.kind === "cooldown")
    .map((question) => [cooldownEntry(question).key, cooldownEntry(question)]),
);
const manaEntries = sourceQuestions.filter((question) => question.kind === "mana-cost").map(manaEntry);
const damageEntries = sourceQuestions
  .filter(
    (question) =>
      question.kind === "ability-damage" &&
      /^How much (?:base )?damage does .+ deal(?: at max level)?\?$/.test(question.prompt),
  )
  .map(damageEntry);
const movementEntries = sourceQuestions.filter((question) => question.kind === "hero-move-speed").map(movementEntry);
const attackRangeByHero = new Map(
  sourceQuestions
    .filter((question) => question.kind === "hero-stat-duel" && question.eyebrow.endsWith("attack range"))
    .flatMap((question) => attackRangeEntries(question, heroByName, heroByImage))
    .map((entry) => [entry.key, entry]),
);

function entriesForSets(sets, lookup, family) {
  return sets.map((keys, index) =>
    keys.map((key) => {
      const entry = lookup.get(key);
      if (!entry) throw new Error(`${family} set ${index + 1} references missing audited key ${key}.`);
      return entry;
    }),
  );
}

const questions = [
  ...entriesForSets(ITEM_SETS, itemByKey, "item-price").map((entries, index) =>
    buildQuestion(entries, "item-price", index),
  ),
  ...entriesForSets(COOLDOWN_SETS, cooldownByKey, "ability-cooldown").map((entries, index) =>
    buildQuestion(entries, "ability-cooldown", index),
  ),
  ...closeValueSets(manaEntries, "ability-mana", GENERATED_FAMILY_COUNT).map((entries, index) =>
    buildQuestion(entries, "ability-mana", index),
  ),
  ...closeValueSets(damageEntries, "ability-damage", GENERATED_FAMILY_COUNT).map((entries, index) =>
    buildQuestion(entries, "ability-damage", index),
  ),
  ...closeValueSets(movementEntries, "hero-move-speed", GENERATED_FAMILY_COUNT).map((entries, index) =>
    buildQuestion(entries, "hero-move-speed", index),
  ),
  ...closeValueSets([...attackRangeByHero.values()], "hero-attack-range", GENERATED_FAMILY_COUNT).map(
    (entries, index) => buildQuestion(entries, "hero-attack-range", index),
  ),
];

await writeFile(OUTPUT_PATH, `${JSON.stringify(questions, null, 2)}\n`);
const familyCounts = Object.fromEntries(
  Object.keys(FAMILY_CONFIG).map((family) => [
    family,
    questions.filter((question) => question.valueOrder.family === family).length,
  ]),
);
console.log(`Generated ${questions.length} audited ordering rounds: ${JSON.stringify(familyCounts)}.`);
