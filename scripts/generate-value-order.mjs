#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { seededShuffle } from "../src/lib/variety.mjs";
import { valueOrderAnswerKey } from "../src/lib/value-order.mjs";

const ROOT = process.cwd();
const QUESTIONS_PATH = join(ROOT, "src", "data", "questions.generated.json");
const OUTPUT_PATH = join(ROOT, "src", "data", "value-order-questions.json");

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
  const [hero, ability] = question.eyebrow.split(" · ");
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

function buildQuestion(entries, family, index) {
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
  const isItem = family === "item-price";
  const readableOrder = correct.map((entry) => `${entry.name} (${entry.label})`).join(" → ");

  return {
    id,
    kind: isItem ? "value-order-item" : "value-order-cooldown",
    varietyKey: `value-order:${family}`,
    category: isItem ? "Items" : "Cooldowns",
    difficulty: 3,
    eyebrow: isItem ? "Item prices" : "Base cooldowns",
    prompt: isItem ? "Cheapest → priciest" : "Shortest → longest",
    answers: privateAnswerChoices(correctKeys, correctIndex),
    correctIndex,
    explanation: `${isItem ? "Cheapest to priciest" : "Shortest to longest"}: ${readableOrder}.`,
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

const sourceQuestions = JSON.parse(await readFile(QUESTIONS_PATH, "utf8"));
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
];

await writeFile(OUTPUT_PATH, `${JSON.stringify(questions, null, 2)}\n`);
console.log(
  `Generated ${questions.length} audited ordering rounds (${ITEM_SETS.length} item, ${COOLDOWN_SETS.length} cooldown).`,
);
