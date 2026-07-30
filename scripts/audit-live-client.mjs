#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CLIENT_CONSTANT_AUDIT } from "./client-constant-audit.mjs";
import { DAMAGE_QUESTION_FACTS } from "./damage-question-facts.mjs";
import { parseValveKeyValues } from "./valve-keyvalues.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clientRootArgument = process.argv.find((argument) => argument.startsWith("--client-root="));
const CLIENT_ROOT = resolve(
  clientRootArgument?.slice("--client-root=".length) ??
    process.env.DOTA_CLIENT_AUDIT_ROOT ??
    `/tmp/queue-arcade-live${CLIENT_CONSTANT_AUDIT.clientBuild}`,
);
const HERO_ABILITY_DIRECTORY = join(CLIENT_ROOT, "npc", "scripts", "npc", "heroes");
const CORE_NPC_DIRECTORY = join(CLIENT_ROOT, "core", "scripts", "npc");
const CREEP_PULL_TIMINGS_PATH = join(CLIENT_ROOT, "scripts", "creep_pull_timings.txt");
const MAP_ENTITY_PATH = join(CLIENT_ROOT, "map", "maps", "dota", "entities", "default_ents.vents");

const questions = JSON.parse(await readFile(join(ROOT, "src", "data", "questions.generated.json"), "utf8"));
const metadata = JSON.parse(await readFile(join(ROOT, "src", "data", "trivia-meta.generated.json"), "utf8"));
const mapMechanics = JSON.parse(await readFile(join(ROOT, "src", "data", "map-sense-mechanics.json"), "utf8"));
const mapStackAudit = JSON.parse(await readFile(join(ROOT, "src", "data", "map-sense-stack-audit.json"), "utf8"));
const failures = [];
let checks = 0;

function record(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function valuesOf(value) {
  const raw = value && typeof value === "object" ? value.value : value;
  return String(raw ?? "")
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter(Number.isFinite);
}

function currentAbilityValues(ability, field) {
  return valuesOf(ability?.AbilityValues?.[field] ?? ability?.[field]);
}

function numericAnswer(question) {
  return Number(String(question.answers[question.correctIndex]).replace(/[^\d.-]/g, ""));
}

function heroKeyFromArtwork(url) {
  const slug = url?.match(/\/heroes\/([^/?]+)\.png/)?.[1];
  return slug ? `npc_dota_hero_${slug}` : undefined;
}

function itemKeyFromArtwork(url) {
  return url?.match(/\/items\/([^/?]+)\.png/)?.[1];
}

function abilityKeyFromArtwork(url) {
  return url?.match(/\/abilities\/([^/?]+)\.png/)?.[1];
}

function correctArtwork(question) {
  return question.answerImages?.[question.correctIndex];
}

async function loadKeyValues(path, rootKey) {
  return parseValveKeyValues(await readFile(path, "utf8"))[rootKey] ?? {};
}

const abilities = {
  ...(await loadKeyValues(join(CORE_NPC_DIRECTORY, "npc_abilities.txt"), "DOTAAbilities")),
};
const abilityOwners = new Map();
const heroAbilityFiles = (await readdir(HERO_ABILITY_DIRECTORY)).filter((file) => file.endsWith(".txt"));

for (const file of heroAbilityFiles) {
  const owner = file.replace(/\.txt$/, "");
  const heroAbilities = await loadKeyValues(join(HERO_ABILITY_DIRECTORY, file), "DOTAAbilities");

  for (const [abilityKey, ability] of Object.entries(heroAbilities)) {
    if (!ability || typeof ability !== "object") continue;
    abilities[abilityKey] = { ...(abilities[abilityKey] ?? {}), ...ability };
    if (!abilityOwners.has(abilityKey)) abilityOwners.set(abilityKey, new Set());
    abilityOwners.get(abilityKey).add(owner);
  }
}

const heroes = await loadKeyValues(join(CORE_NPC_DIRECTORY, "npc_heroes.txt"), "DOTAHeroes");
const items = await loadKeyValues(join(CORE_NPC_DIRECTORY, "items.txt"), "DOTAAbilities");
const creepPullTimingsSource = await readFile(CREEP_PULL_TIMINGS_PATH, "utf8");
const creepPullTimings = parseValveKeyValues(creepPullTimingsSource).CREEP_PULL_TIMINGS ?? {};
const mapEntitySource = await readFile(MAP_ENTITY_PATH, "utf8");
const recipes = new Map();

for (const item of Object.values(items)) {
  if (!item?.ItemResult || !item.ItemRequirements) continue;
  const requirement = Object.values(item.ItemRequirements)[0];
  const components = String(requirement ?? "")
    .split(";")
    .map((component) => component.replace(/^item_/, "").replace(/\*/g, ""))
    .filter(Boolean);
  recipes.set(item.ItemResult.replace(/^item_/, ""), components);
}

record(metadata.patch === CLIENT_CONSTANT_AUDIT.patch, `Metadata patch ${metadata.patch} is not the audited patch.`);
record(
  metadata.clientConstantAudit?.clientBuild === CLIENT_CONSTANT_AUDIT.clientBuild,
  "Generated metadata does not identify the audited Dota client build.",
);
record(
  mapStackAudit.snapshot?.clientBuild === CLIENT_CONSTANT_AUDIT.clientBuild &&
    mapStackAudit.snapshot?.steamBuildId === CLIENT_CONSTANT_AUDIT.steamBuildId,
  "Map stack audit does not identify the current audited Dota client.",
);
record(
  createHash("sha256").update(creepPullTimingsSource).digest("hex") === mapStackAudit.snapshot?.extractedSha256,
  "The extracted creep-pull timing resource changed from the reviewed client snapshot.",
);

for (const [campId, expected] of Object.entries(mapStackAudit.camps ?? {})) {
  const current = creepPullTimings[campId];
  record(
    Number(current?.stack_start) === expected.start &&
      Number(current?.stack_end) === expected.end &&
      Number(current?.stack_arrow_direction) === expected.direction,
    `${campId}: reviewed stack guide ${JSON.stringify(expected)} does not match the current client resource.`,
  );
}

const overview = {
  posX: -9472,
  posY: 9472,
  worldSpan: 18.5 * 1024,
};
const neutralTypeTiers = ["small", "medium", "large", "ancient"];
const spawners = new Map();
for (const block of mapEntitySource.split(/\r?\n====\d+====\r?\n/)) {
  if (!/^classname\s+"npc_dota_neutral_spawner"/m.test(block)) continue;
  const campId = block.match(/^volumename\s+"\[PR#\](neutralcamp_(?:good|evil)_\d+)"/m)?.[1];
  const origin = block.match(/^origin\s+\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]/m);
  const neutralType = Number(block.match(/^neutraltype\s+"?(\d+)"?/m)?.[1]);
  if (campId && origin) {
    spawners.set(campId, {
      position: {
        x: (Number(origin[1]) - overview.posX) / overview.worldSpan,
        y: (overview.posY - Number(origin[2])) / overview.worldSpan,
      },
      tier: neutralTypeTiers[neutralType],
      side: campId.includes("_good_") ? "radiant" : "dire",
    });
  }
}

for (const camp of mapMechanics.camps ?? []) {
  const expectedStack = mapStackAudit.camps?.[camp.id];
  const spawner = spawners.get(camp.id);
  record(
    expectedStack &&
      camp.stack.start === expectedStack.start &&
      camp.stack.end === expectedStack.end &&
      camp.stack.direction === expectedStack.direction,
    `${camp.id}: playable stack values drifted from the reviewed client extraction.`,
  );
  record(
    spawner &&
      Math.abs(spawner.position.x - camp.position.x) <= 0.0000011 &&
      Math.abs(spawner.position.y - camp.position.y) <= 0.0000011 &&
      spawner.tier === camp.tier &&
      spawner.side === camp.side,
    `${camp.id}: displayed camp position, tier, or side does not match the current map entity.`,
  );
}

for (const question of questions) {
  const correctAnswer = question.answers[question.correctIndex];

  if (["mana-cost", "cooldown", "ability-damage"].includes(question.kind)) {
    const match = question.id.match(/^(?:mana|cooldown|damage):(.+):(\d+)$/);
    const abilityKey = match?.[1];
    const levelIndex = Number(match?.[2]) - 1;
    const ability = abilities[abilityKey];
    let values = [];

    if (question.kind === "mana-cost") values = currentAbilityValues(ability, "AbilityManaCost");
    if (question.kind === "cooldown") values = currentAbilityValues(ability, "AbilityCooldown");
    if (question.kind === "ability-damage") {
      values = currentAbilityValues(ability, DAMAGE_QUESTION_FACTS[abilityKey]?.attributeKey);
    }

    const expected = values[levelIndex] ?? (values.length === 1 ? values[0] : undefined);
    record(
      expected === numericAnswer(question),
      `${question.id}: answer ${numericAnswer(question)} does not match client value ${expected} (${values.join(" / ")}).`,
    );
  }

  if (question.kind === "spell-owner") {
    const abilityKey = question.id.slice("ability-owner:".length);
    const expectedOwner = heroKeyFromArtwork(correctArtwork(question));
    const owners = abilityOwners.get(abilityKey) ?? new Set();
    record(
      owners.size === 1 && owners.has(expectedOwner),
      `${question.id}: current client owners are ${[...owners].join(", ") || "missing"}, not ${expectedOwner}.`,
    );
  }

  if (question.kind === "ability-detective") {
    const expectedOwner = heroKeyFromArtwork(question.image?.src);
    const answerAbilityKeys = question.answerImages?.map(abilityKeyFromArtwork) ?? [];
    record(
      answerAbilityKeys.length === 4 &&
        answerAbilityKeys.every((abilityKey) => abilityOwners.get(abilityKey)?.has(expectedOwner)),
      `${question.id}: one or more answer abilities do not belong to ${expectedOwner} in the current client.`,
    );
    record(
      answerAbilityKeys[question.correctIndex] === question.id.slice("ability-detective:".length),
      `${question.id}: the marked answer artwork does not match the described ability.`,
    );
  }

  if (question.kind === "hero-primary-attribute") {
    const heroKey = heroKeyFromArtwork(question.image?.src);
    const labels = {
      DOTA_ATTRIBUTE_STRENGTH: "Strength",
      DOTA_ATTRIBUTE_AGILITY: "Agility",
      DOTA_ATTRIBUTE_INTELLECT: "Intelligence",
      DOTA_ATTRIBUTE_ALL: "Universal",
    };
    record(
      labels[heroes[heroKey]?.AttributePrimary] === correctAnswer,
      `${question.id}: ${correctAnswer} does not match ${heroes[heroKey]?.AttributePrimary}.`,
    );
  }

  if (question.kind === "hero-move-speed") {
    const heroKey = heroKeyFromArtwork(question.image?.src);
    record(
      Number(heroes[heroKey]?.MovementSpeed) === numericAnswer(question),
      `${question.id}: answer ${numericAnswer(question)} does not match client movement speed ${heroes[heroKey]?.MovementSpeed}.`,
    );
  }

  if (question.kind === "hero-stat-duel") {
    const fieldById = {
      "move-speed": "MovementSpeed",
      "attack-range": "AttackRange",
      "base-attack-time": "AttackRate",
    };
    const statKey = question.id.match(/^hero-stat:(.+?):/)?.[1];
    const field = fieldById[statKey];
    const values = question.answerImages.map((artwork) => Number(heroes[heroKeyFromArtwork(artwork)]?.[field]));
    const target = statKey === "base-attack-time" ? Math.min(...values) : Math.max(...values);
    const winnerIndexes = values.flatMap((value, index) => (value === target ? [index] : []));
    record(
      winnerIndexes.length === 1 && winnerIndexes[0] === question.correctIndex,
      `${question.id}: current values ${values.join(" / ")} produce winner indexes ${winnerIndexes.join(", ")}.`,
    );
  }

  if (question.kind === "hero-intruder") {
    const attributes = question.answerImages.map((artwork) => heroes[heroKeyFromArtwork(artwork)]?.AttributePrimary);
    const otherAttributes = attributes.filter((_, index) => index !== question.correctIndex);
    record(
      new Set(otherAttributes).size === 1 && !otherAttributes.includes(attributes[question.correctIndex]),
      `${question.id}: current attributes ${attributes.join(" / ")} do not produce the marked intruder.`,
    );
  }

  if (question.kind === "fogged-hero") {
    const expectedHero = question.id.slice("fogged-hero:".length);
    record(
      heroKeyFromArtwork(question.image?.src) === expectedHero &&
        question.answers[question.correctIndex] === question.explanation.split(" was hiding")[0],
      `${question.id}: hidden portrait, marked answer, and reveal do not identify the same hero.`,
    );
  }

  if (question.kind === "item-cost") {
    const itemKey = itemKeyFromArtwork(question.image?.src);
    record(
      Number(items[`item_${itemKey}`]?.ItemCost) === numericAnswer(question),
      `${question.id}: answer ${numericAnswer(question)} does not match client price ${items[`item_${itemKey}`]?.ItemCost}.`,
    );
  }

  if (question.kind === "recipe-component") {
    const [, resultKey, componentKey] = question.id.split(":");
    record(
      recipes.get(resultKey)?.includes(componentKey),
      `${question.id}: ${componentKey} is not in the current ${resultKey} recipe.`,
    );
  }

  if (question.kind === "recipe-upgrade") {
    const [, componentKey, resultKey] = question.id.split(":");
    record(
      recipes.get(resultKey)?.includes(componentKey),
      `${question.id}: ${componentKey} is not in the current ${resultKey} recipe.`,
    );
  }

  if (question.kind === "item-price-duel") {
    const values = question.answerImages.map((artwork) =>
      Number(items[`item_${itemKeyFromArtwork(artwork)}`]?.ItemCost),
    );
    const target = Math.max(...values);
    const winnerIndexes = values.flatMap((value, index) => (value === target ? [index] : []));
    record(
      winnerIndexes.length === 1 && winnerIndexes[0] === question.correctIndex,
      `${question.id}: current prices ${values.join(" / ")} produce winner indexes ${winnerIndexes.join(", ")}.`,
    );
  }

  if (["hero-voice", "hero-quote"].includes(question.kind)) {
    const idHeroKey = question.id.match(/^hero-(?:voice|quote):([^:]+):/)?.[1];
    record(
      heroKeyFromArtwork(correctArtwork(question)) === idHeroKey,
      `${question.id}: marked answer portrait does not match the response owner.`,
    );
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Live-client audit passed ${checks} answer checks across ${questions.length} questions (Dota ${CLIENT_CONSTANT_AUDIT.patch}, client build ${CLIENT_CONSTANT_AUDIT.clientBuild}).`,
  );
}
