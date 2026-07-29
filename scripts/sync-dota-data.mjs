#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyAbilityConstantAudit,
  applyHeroConstantAudit,
  applyItemConstantAudit,
  CLIENT_CONSTANT_AUDIT,
} from "./client-constant-audit.mjs";
import { DAMAGE_QUESTION_FACTS, damageQuestionExplanation, damageQuestionPrompt } from "./damage-question-facts.mjs";
import { auditAudioAssets, auditImageAssets, questionAudioUrls, questionImageUrls } from "./image-assets.mjs";
import {
  NON_TRIVIA_COOLDOWN_KEYS,
  NON_TRIVIA_DETECTIVE_KEYS,
  NON_TRIVIA_SPELL_OWNER_KEYS,
} from "./question-quality-audit.mjs";
import { spellDifficulty, spellDistractors } from "./spell-difficulty.mjs";
import { buildSpellHint, containsAnswerLeak } from "./spell-hints.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "src", "data", "questions.generated.json");
const META_OUTPUT = join(ROOT, "src", "data", "trivia-meta.generated.json");

const PATCH = process.env.DOTA_PATCH ?? "7.41d";
const SNAPSHOT_DATE = process.env.DOTA_SNAPSHOT_DATE ?? new Date().toISOString().slice(0, 10);
const CONTENT_VERSION = `${PATCH}-variety-4`;
const CDN = "https://cdn.cloudflare.steamstatic.com";
const DOTABASE_RAW = "https://raw.githubusercontent.com/mdiller/dotabase/master";
const DOTABASE_ASSETS = "https://dotabase.dillerm.io/vpk";

const endpoints = {
  heroes: "https://api.opendota.com/api/constants/heroes",
  items: "https://api.opendota.com/api/constants/items",
  abilities: "https://api.opendota.com/api/constants/abilities",
  heroAbilities: "https://api.opendota.com/api/constants/hero_abilities",
  dotabaseHeroes: `${DOTABASE_RAW}/json/heroes.json`,
};

const cacheArg = process.argv.find((argument) => argument.startsWith("--cache-dir="));
const cacheDirectory = cacheArg ? resolve(cacheArg.split("=")[1]) : undefined;

if (PATCH !== CLIENT_CONSTANT_AUDIT.patch) {
  throw new Error(
    `Dota ${PATCH} has not been audited against a live client. Update client-constant-audit.mjs before generating it.`,
  );
}

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

function numericOptions(correct, kind, salt, configuredStep) {
  let step = configuredStep ?? 5;
  if (configuredStep === undefined) {
    if (kind === "mana") step = correct < 80 ? 10 : correct < 220 ? 20 : 50;
    if (kind === "cooldown") step = correct <= 8 ? 1 : correct <= 20 ? 2 : correct <= 60 ? 5 : 10;
    if (kind === "damage") step = correct < 100 ? 20 : correct < 300 ? 50 : 100;
    if (kind === "speed") step = 5;
  }

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
  kind,
  category,
  difficulty,
  eyebrow,
  prompt,
  image,
  answers,
  correctAnswer,
  answerImagesByValue,
  answerImageKind,
  explanation,
  detail,
  hint,
  audio,
  source,
}) {
  const orderedAnswers = shuffle(answers, id);
  const question = {
    id,
    kind,
    category,
    difficulty,
    eyebrow,
    prompt,
    answers: orderedAnswers,
    correctIndex: orderedAnswers.indexOf(correctAnswer),
    explanation,
    source,
    patch: PATCH,
  };

  if (image) question.image = image;
  if (detail) question.detail = detail;
  if (hint) question.hint = hint;
  if (audio) question.audio = audio;

  if (answerImagesByValue && orderedAnswers.every((answer) => answerImagesByValue[answer])) {
    question.answerImages = orderedAnswers.map((answer) => answerImagesByValue[answer]);
    question.answerImageKind = answerImageKind;
  }

  return question;
}

function balanceCorrectAnswerSlots(deck) {
  const byKind = new Map();
  for (const question of deck) {
    if (!byKind.has(question.kind)) byKind.set(question.kind, []);
    byKind.get(question.kind).push(question);
  }

  for (const [kind, kindQuestions] of byKind) {
    const slotOrder = [...kindQuestions].sort(
      (left, right) =>
        hash(`answer-slot:${kind}:${left.id}`) - hash(`answer-slot:${kind}:${right.id}`) ||
        left.id.localeCompare(right.id),
    );

    for (const [index, question] of slotOrder.entries()) {
      const targetSlot = index % 4;
      if (question.correctIndex === targetSlot) continue;

      const answers = [...question.answers];
      const [correctAnswer] = answers.splice(question.correctIndex, 1);
      answers.splice(targetSlot, 0, correctAnswer);
      question.answers = answers;

      if (question.answerImages) {
        const answerImages = [...question.answerImages];
        const [correctArtwork] = answerImages.splice(question.correctIndex, 1);
        answerImages.splice(targetSlot, 0, correctArtwork);
        question.answerImages = answerImages;
      }

      question.correctIndex = targetSlot;
    }
  }

  return deck;
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

function comparisonGroup(anchor, pool, valueOf, direction, salt) {
  const correctValue = valueOf(anchor);
  const candidates = pool
    .filter((candidate) => {
      if (candidate.key === anchor.key) return false;
      const value = valueOf(candidate);
      return direction === "max" ? value < correctValue : value > correctValue;
    })
    .sort((left, right) => {
      const distance = Math.abs(valueOf(left) - correctValue) - Math.abs(valueOf(right) - correctValue);
      return distance || hash(`${salt}:${left.key}`) - hash(`${salt}:${right.key}`);
    });

  return [anchor, ...candidates.slice(0, 3)];
}

function answerArtworkByName(entries) {
  return Object.fromEntries(entries.map((entry) => [entry.localized_name ?? entry.dname, entry.image]));
}

function normalizedWords(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9'-]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3);
}

function responseSlug(value) {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function voiceLineText(response) {
  return (response.text || response.text_simple || "").replace(/\s+/g, " ").trim();
}

function isVoiceVocalization(word) {
  return /^(?:a+h+|h+a+h*|h+e+h+|h+o+h*|h+u+h+|(?:ha){2,}h?|(?:ah){2,}a?|(?:he){2,}h?|(?:eh){2,}e?|(?:ho){2,}h?|(?:oh){2,}o?|hm+|hmm+|e+h+|o+h+|u+gh+|gr+r+|ar+gh+)$/i.test(
    word,
  );
}

function meaningfulVoiceWords(value) {
  const words = value.match(/[a-z]+(?:['’-][a-z]+)*/gi) ?? [];
  return words.filter((word) => !isVoiceVocalization(word));
}

function isProperVoiceLine(response, minimumCharacters, minimumWords) {
  const text = voiceLineText(response);
  const assetName = [response.name, response.fullname, response.mp3].filter(Boolean).join(" ");
  const vocalizations = (text.match(/[a-z]+/gi) ?? []).filter(isVoiceVocalization);

  return (
    text.length >= minimumCharacters &&
    text.length <= 110 &&
    meaningfulVoiceWords(text).length >= minimumWords &&
    !vocalizations.some((word) => word.length >= 4) &&
    vocalizations.length < 2 &&
    !/[<>{}]/.test(text) &&
    !/(?:^|[_\s-])(laugh|chuckle|giggle)(?:[_\s.-]|$)/i.test(assetName)
  );
}

function voiceLineLeaksHero(response, hero, dotabaseHero) {
  const line = voiceLineText(response);
  const aliases = new Set([
    ...normalizedWords(hero.localized_name),
    ...normalizedWords(dotabaseHero?.name ?? ""),
    ...normalizedWords(dotabaseHero?.aliases ?? ""),
  ]);

  return [...aliases].some((alias) =>
    new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(line),
  );
}

async function loadDataset(name, url) {
  if (cacheDirectory) {
    const cacheName =
      name === "heroAbilities" ? "hero-abilities" : name === "dotabaseHeroes" ? "dotabase-heroes" : name;
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

async function loadHeroResponses(responseNames) {
  for (const responseName of responseNames) {
    if (cacheDirectory) {
      try {
        return JSON.parse(await readFile(join(cacheDirectory, `dota-responses-${responseName}.json`), "utf8"));
      } catch (error) {
        if (error?.code === "ENOENT") continue;
        throw error;
      }
    }

    const url = `${DOTABASE_RAW}/json/responses/${responseName}.json`;
    const response = await fetch(url, {
      headers: {
        "user-agent": "queue-arcade-data-sync/1.0",
      },
    });
    if (response.status === 404) continue;
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    return response.json();
  }

  throw new Error(`No response file matched ${responseNames.join(" or ")}`);
}

const [heroesById, itemsByKey, abilitiesByKey, heroAbilitiesByKey, dotabaseHeroes] = await Promise.all(
  Object.entries(endpoints).map(([name, url]) => loadDataset(name, url)),
);

const dotabaseHeroById = new Map(dotabaseHeroes.map((hero) => [hero.id, hero]));
const heroes = Object.values(heroesById)
  .filter((hero) => hero.localized_name && hero.name && hero.img)
  .map((hero) =>
    applyHeroConstantAudit({
      ...hero,
      key: hero.name,
      image: asset(hero.img),
      responseNames: [
        ...new Set(
          [
            dotabaseHeroById.get(hero.id)?.media_name,
            dotabaseHeroById.get(hero.id)?.name,
            responseSlug(hero.localized_name),
          ].filter(Boolean),
        ),
      ],
    }),
  );

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
  .map(([key, owners]) =>
    applyAbilityConstantAudit({
      ...abilitiesByKey[key],
      key,
      owner: owners[0],
      image: asset(abilitiesByKey[key].img),
    }),
  );

const questionSource = {
  label: `OpenDota constants · ${SNAPSHOT_DATE}`,
  url: "https://docs.opendota.com/",
};
const clientQuestionSource = {
  label: `Dota 2 live-client audit · build ${CLIENT_CONSTANT_AUDIT.clientBuild}`,
  url: `https://www.dota2.com/patches/${CLIENT_CONSTANT_AUDIT.patch}`,
};
const voiceSource = {
  label: `Dotabase hero responses · ${SNAPSHOT_DATE}`,
  url: "https://github.com/mdiller/dotabase",
};

const questions = [];

const spellOwnerCandidates = abilities.filter((ability) => !NON_TRIVIA_SPELL_OWNER_KEYS.includes(ability.key));

for (const ability of stableSample(spellOwnerCandidates, 73, "ability-owner")) {
  const ownerAbilityKeys = heroAbilitiesByKey[ability.owner.key]?.abilities ?? [];
  const difficulty = spellDifficulty(ability.key, ownerAbilityKeys);
  const distractors = spellDistractors(ability.owner, heroes, difficulty, ability.key, hash);
  const answerHeroes = [ability.owner, ...distractors];

  questions.push(
    makeQuestion({
      id: `ability-owner:${ability.key}`,
      kind: "spell-owner",
      category: "Abilities",
      difficulty,
      eyebrow: ability.dname,
      prompt: "Which hero owns this ability?",
      image: { src: ability.image, alt: `${ability.dname} ability icon`, kind: "ability" },
      answers: answerHeroes.map((hero) => hero.localized_name),
      correctAnswer: ability.owner.localized_name,
      answerImagesByValue: Object.fromEntries(answerHeroes.map((hero) => [hero.localized_name, hero.image])),
      answerImageKind: "hero",
      explanation: `${ability.dname} belongs to ${ability.owner.localized_name}.${ability.desc ? ` ${ability.desc}` : ""}`,
      hint: buildSpellHint(ability.desc, ability.owner.localized_name, ability.dname, {
        redactAbility: false,
      }),
      source: clientQuestionSource,
    }),
  );
}

const detectiveCandidates = abilities
  .map((ability) => {
    const siblings = abilities.filter(
      (candidate) =>
        candidate.owner.key === ability.owner.key &&
        candidate.key !== ability.key &&
        candidate.dname !== ability.dname &&
        candidate.image,
    );
    const detail = buildSpellHint(ability.desc, ability.owner.localized_name, ability.dname);
    return { ...ability, siblings, detail };
  })
  .filter(
    (ability) =>
      !NON_TRIVIA_DETECTIVE_KEYS.includes(ability.key) &&
      ability.siblings.length >= 3 &&
      ability.detail.length >= 18 &&
      !ability.detail.startsWith("No additional mechanical clue") &&
      !containsAnswerLeak(ability.detail, ability.dname),
  );

for (const ability of stableSample(detectiveCandidates, 49, "ability-detective")) {
  const siblingAnswers = stableSample(ability.siblings, 3, `ability-detective:${ability.key}`);
  const answerAbilities = [ability, ...siblingAnswers];

  questions.push(
    makeQuestion({
      id: `ability-detective:${ability.key}`,
      kind: "ability-detective",
      category: "Abilities",
      difficulty: 2,
      eyebrow: `${ability.owner.localized_name} · Ability Detective`,
      prompt: "Which of this hero’s abilities matches the effect below?",
      detail: ability.detail,
      image: {
        src: ability.owner.image,
        alt: `${ability.owner.localized_name} hero portrait`,
        kind: "hero",
      },
      answers: answerAbilities.map((candidate) => candidate.dname),
      correctAnswer: ability.dname,
      answerImagesByValue: answerArtworkByName(answerAbilities),
      answerImageKind: "ability",
      explanation: `${ability.dname}: ${ability.desc}`,
      source: clientQuestionSource,
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
      kind: "mana-cost",
      category: "Mana",
      difficulty: 2,
      eyebrow: `${ability.owner.localized_name} · ${ability.dname}`,
      prompt: `How much mana does ${ability.dname} cost${levelLabel}?`,
      image: { src: ability.image, alt: `${ability.dname} ability icon`, kind: "ability" },
      answers: answerValues,
      correctAnswer: formatNumber(correct),
      explanation: `${ability.dname}'s mana cost is ${values.map(formatNumber).join(" / ")}${values.length > 1 ? " across its levels" : ""}, before modifiers.`,
      source: clientQuestionSource,
    }),
  );
}

const cooldownAbilities = abilities.filter((ability) => {
  const values = numericValue(ability.cd);
  return (
    !NON_TRIVIA_COOLDOWN_KEYS.includes(ability.key) &&
    values?.length &&
    values.every((value) => value > 0 && value <= 300)
  );
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
      kind: "cooldown",
      category: "Cooldowns",
      difficulty: 3,
      eyebrow: `${ability.owner.localized_name} · ${ability.dname}`,
      prompt: `What is ${ability.dname}'s cooldown${levelLabel}?`,
      image: { src: ability.image, alt: `${ability.dname} ability icon`, kind: "ability" },
      answers: answerValues.map((answer) => `${answer}s`),
      correctAnswer: `${formatNumber(correct)}s`,
      explanation: `${ability.dname}'s cooldown is ${values.map((value) => `${formatNumber(value)}s`).join(" / ")}${values.length > 1 ? " across its levels" : ""}, before reductions.`,
      source: clientQuestionSource,
    }),
  );
}

const abilitiesByKeyWithOwner = new Map(abilities.map((ability) => [ability.key, ability]));

for (const [abilityKey, fact] of Object.entries(DAMAGE_QUESTION_FACTS)) {
  const ability = abilitiesByKeyWithOwner.get(abilityKey);
  if (!ability) throw new Error(`Audited damage ability ${abilityKey} is missing from the current hero data.`);

  const damageAttribute = ability.attrib?.find(
    (attribute) => attribute.key === fact.attributeKey && attribute.header === "DAMAGE:",
  );
  const values = numericValue(damageAttribute?.value);
  if (!values?.length || values.some((value) => value <= 0 || value > 2000)) {
    throw new Error(`Audited damage values for ${abilityKey} are missing or invalid.`);
  }

  const levelIndex = values.length - 1;
  const correct = values[levelIndex];
  const answerValues = numericOptions(correct, "damage", `damage:${ability.key}`, fact.optionStep);
  const suffix = fact.suffix ?? "";

  questions.push(
    makeQuestion({
      id: `damage:${ability.key}:${levelIndex + 1}`,
      kind: "ability-damage",
      category: "Damage",
      difficulty: 3,
      eyebrow: `${ability.owner.localized_name} · ${ability.dname}`,
      prompt: damageQuestionPrompt(ability.dname, fact, values.length > 1),
      image: { src: ability.image, alt: `${ability.dname} ability icon`, kind: "ability" },
      answers: answerValues.map((answer) => `${answer}${suffix}`),
      correctAnswer: `${formatNumber(correct)}${suffix}`,
      explanation: damageQuestionExplanation(ability.dname, fact, values),
      source: clientQuestionSource,
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
      kind: "hero-primary-attribute",
      category: "Heroes",
      difficulty: 1,
      eyebrow: hero.localized_name,
      prompt: `What is ${hero.localized_name}'s primary attribute?`,
      image: { src: hero.image, alt: `${hero.localized_name} hero portrait`, kind: "hero" },
      answers: Object.values(attributeNames),
      correctAnswer: correct,
      explanation: `${hero.localized_name} is a ${correct} hero in patch ${PATCH}.`,
      source: clientQuestionSource,
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
      kind: "hero-move-speed",
      category: "Heroes",
      difficulty: 2,
      eyebrow: hero.localized_name,
      prompt: `What is ${hero.localized_name}'s base movement speed?`,
      image: { src: hero.image, alt: `${hero.localized_name} hero portrait`, kind: "hero" },
      answers: answerValues,
      correctAnswer: formatNumber(correct),
      explanation: `${hero.localized_name} has ${formatNumber(correct)} base movement speed, before boots and other modifiers.`,
      source: clientQuestionSource,
    }),
  );
}

const heroStatDefinitions = [
  {
    key: "move-speed",
    label: "base movement speed",
    value: (hero) => Number(hero.move_speed),
    eligible: (hero) => Number.isFinite(hero.move_speed),
    direction: "max",
    difficulty: 2,
    format: (value) => formatNumber(value),
  },
  {
    key: "attack-range",
    label: "attack range",
    value: (hero) => Number(hero.attack_range),
    eligible: (hero) => hero.attack_type === "Ranged" && Number.isFinite(hero.attack_range),
    direction: "max",
    difficulty: 2,
    format: (value) => formatNumber(value),
  },
  {
    key: "base-attack-time",
    label: "base attack time",
    value: (hero) => Number(hero.attack_rate),
    eligible: (hero) => Number.isFinite(hero.attack_rate) && hero.attack_rate > 0,
    direction: "min",
    difficulty: 3,
    format: (value) => `${formatNumber(value)}s`,
  },
];

for (const stat of heroStatDefinitions) {
  const pool = heroes.filter(stat.eligible);
  const anchors = pool.filter(
    (hero) => comparisonGroup(hero, pool, stat.value, stat.direction, `hero-stat:${stat.key}:${hero.key}`).length === 4,
  );

  for (const hero of stableSample(anchors, 14, `hero-stat:${stat.key}`)) {
    const answerHeroes = comparisonGroup(hero, pool, stat.value, stat.direction, `hero-stat:${stat.key}:${hero.key}`);
    const comparisonWord = stat.direction === "max" ? "highest" : "lowest";
    const values = answerHeroes
      .map((candidate) => `${candidate.localized_name} ${stat.format(stat.value(candidate))}`)
      .join(" · ");

    questions.push(
      makeQuestion({
        id: `hero-stat:${stat.key}:${hero.key}`,
        kind: "hero-stat-duel",
        category: "Heroes",
        difficulty: stat.difficulty,
        eyebrow: `Stat Duel · ${stat.label}`,
        prompt: `Which hero has the ${comparisonWord} ${stat.label}?`,
        answers: answerHeroes.map((candidate) => candidate.localized_name),
        correctAnswer: hero.localized_name,
        answerImagesByValue: answerArtworkByName(answerHeroes),
        answerImageKind: "hero",
        explanation: `${hero.localized_name} leads these choices. ${values}.`,
        source: clientQuestionSource,
      }),
    );
  }
}

const heroesByAttribute = heroes.reduce((groups, hero) => {
  groups[hero.primary_attr] ??= [];
  groups[hero.primary_attr].push(hero);
  return groups;
}, {});
for (const hero of stableSample(heroes, 32, "hero-intruder")) {
  const distractorAttributes = Object.keys(heroesByAttribute).filter(
    (attribute) => attribute !== hero.primary_attr && (heroesByAttribute[attribute]?.length ?? 0) >= 3,
  );
  const distractorAttribute = distractorAttributes[hash(`hero-intruder:${hero.key}`) % distractorAttributes.length];
  const distractors = stableSample(
    heroesByAttribute[distractorAttribute] ?? [],
    3,
    `hero-intruder:${hero.key}:${distractorAttribute}`,
  );
  if (distractors.length !== 3) continue;

  const answerHeroes = [hero, ...distractors];
  const heroAttribute = attributeNames[hero.primary_attr];
  const sharedAttribute = attributeNames[distractorAttribute];

  questions.push(
    makeQuestion({
      id: `hero-intruder:${hero.key}:${distractorAttribute}`,
      kind: "hero-intruder",
      category: "Heroes",
      difficulty: 2,
      eyebrow: "Draft Intruder · Primary attributes",
      prompt: "Which hero does not share the others’ primary attribute?",
      answers: answerHeroes.map((candidate) => candidate.localized_name),
      correctAnswer: hero.localized_name,
      answerImagesByValue: answerArtworkByName(answerHeroes),
      answerImageKind: "hero",
      explanation: `${hero.localized_name} is ${heroAttribute}; the other three heroes are ${sharedAttribute}.`,
      source: clientQuestionSource,
    }),
  );
}

for (const hero of stableSample(heroes, 56, "fogged-hero")) {
  const distractors = spellDistractors(hero, heroes, 2, `fogged:${hero.key}`, hash);
  if (distractors.length !== 3) continue;
  const answerHeroes = [hero, ...distractors];

  questions.push(
    makeQuestion({
      id: `fogged-hero:${hero.key}`,
      kind: "fogged-hero",
      category: "Heroes",
      difficulty: 2,
      eyebrow: "Fogged Vision",
      prompt: "Which hero is hidden in the fog?",
      image: { src: hero.image, alt: `${hero.localized_name} hero portrait`, kind: "hero" },
      answers: answerHeroes.map((candidate) => candidate.localized_name),
      correctAnswer: hero.localized_name,
      explanation: `${hero.localized_name} was hiding behind the fog.`,
      source: questionSource,
    }),
  );
}

const voiceHeroes = stableSample(
  heroes.filter((hero) => hero.responseNames.length),
  48,
  "hero-voice",
);
const voiceResponses = await Promise.all(
  voiceHeroes.map(async (hero) => {
    try {
      return [hero, await loadHeroResponses(hero.responseNames)];
    } catch (error) {
      console.warn(`Skipping voice responses for ${hero.localized_name}: ${error.message}`);
      return [hero, []];
    }
  }),
);

for (const [hero, responses] of voiceResponses) {
  const dotabaseHero = dotabaseHeroById.get(hero.id);
  const candidates = responses
    .filter((response) => {
      return (
        response.hero_id === hero.id &&
        typeof response.mp3 === "string" &&
        response.mp3.endsWith(".mp3") &&
        isProperVoiceLine(response, 18, 3) &&
        /(Moving|Attacking|Spawning|Killing a hero)/.test(response.pretty_criteria ?? "") &&
        !voiceLineLeaksHero(response, hero, dotabaseHero)
      );
    })
    .map((response) => ({
      ...response,
      key: response.fullname ?? response.name,
      normalizedText: voiceLineText(response),
    }));
  const audioLine = stableSample(candidates, 1, `hero-voice:${hero.key}`)[0];
  const quoteCandidates = candidates.filter(
    (response) =>
      response.key !== audioLine?.key &&
      response.normalizedText.length >= 28 &&
      meaningfulVoiceWords(response.normalizedText).length >= 5,
  );
  const quoteLine = stableSample(quoteCandidates, 1, `hero-quote:${hero.key}`)[0];
  if (!audioLine && !quoteLine) continue;

  const distractors = spellDistractors(hero, heroes, 2, `hero-voice:${hero.key}`, hash);
  if (distractors.length !== 3) continue;
  const answerHeroes = [hero, ...distractors];

  if (audioLine) {
    questions.push(
      makeQuestion({
        id: `hero-voice:${hero.key}:${audioLine.name}`,
        kind: "hero-voice",
        category: "Heroes",
        difficulty: 2,
        eyebrow: "Echo Hunt",
        prompt: "Which hero said this?",
        image: { src: hero.image, alt: `${hero.localized_name} hero portrait`, kind: "hero" },
        answers: answerHeroes.map((candidate) => candidate.localized_name),
        correctAnswer: hero.localized_name,
        answerImagesByValue: answerArtworkByName(answerHeroes),
        answerImageKind: "hero",
        explanation: `“${audioLine.normalizedText}” is spoken by ${hero.localized_name}.`,
        audio: { src: `${DOTABASE_ASSETS}${audioLine.mp3}` },
        source: voiceSource,
      }),
    );
  }

  if (quoteLine) {
    questions.push(
      makeQuestion({
        id: `hero-quote:${hero.key}:${quoteLine.name}`,
        kind: "hero-quote",
        category: "Heroes",
        difficulty: 2,
        eyebrow: "Quote Hunt",
        prompt: "Which hero said this line?",
        detail: quoteLine.normalizedText,
        answers: answerHeroes.map((candidate) => candidate.localized_name),
        correctAnswer: hero.localized_name,
        answerImagesByValue: answerArtworkByName(answerHeroes),
        answerImageKind: "hero",
        explanation: `“${quoteLine.normalizedText}” is spoken by ${hero.localized_name}.`,
        source: voiceSource,
      }),
    );
  }
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
  .map((key) => applyItemConstantAudit({ ...itemsByKey[key], key, image: asset(itemsByKey[key]?.img) }))
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
      kind: "item-cost",
      category: "Items",
      difficulty: item.cost >= 3000 ? 2 : 1,
      eyebrow: item.dname,
      prompt: `How much does ${item.dname} cost?`,
      image: { src: item.image, alt: `${item.dname} item icon`, kind: "item" },
      answers: [item.cost, ...distractorCosts].map((value) => `${value.toLocaleString("en-US")} gold`),
      correctAnswer: correct,
      explanation: `${item.dname} costs ${item.cost.toLocaleString("en-US")} gold in patch ${PATCH}.`,
      source: clientQuestionSource,
    }),
  );
}

const componentPool = [...new Set(items.flatMap((item) => item.components ?? []))]
  .map((key) => ({ ...itemsByKey[key], key, image: asset(itemsByKey[key]?.img) }))
  .filter((item) => item.dname && item.image);

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
      kind: "recipe-component",
      category: "Recipes",
      difficulty: 2,
      eyebrow: item.dname,
      prompt: `Which item is part of ${item.dname}'s recipe?`,
      image: { src: item.image, alt: `${item.dname} item icon`, kind: "item" },
      answers: answerItems.map((answerItem) => answerItem.dname),
      correctAnswer: component.dname,
      answerImagesByValue: Object.fromEntries(answerItems.map((answerItem) => [answerItem.dname, answerItem.image])),
      answerImageKind: "item",
      explanation: `${item.dname} is built with ${formatRecipeComponents(item.components, itemsByKey)}.`,
      source: clientQuestionSource,
    }),
  );
}

const recipeItems = items.filter((item) => item.components?.length);
for (const item of stableSample(recipeItems, 36, "recipe-upgrade")) {
  const componentKey = item.components[hash(`recipe-upgrade:${item.key}`) % item.components.length];
  const component = {
    ...itemsByKey[componentKey],
    key: componentKey,
    image: asset(itemsByKey[componentKey]?.img),
  };
  if (!component.dname || !component.image) continue;

  const distractors = stableSample(
    recipeItems.filter(
      (candidate) => candidate.key !== item.key && !candidate.components.includes(componentKey) && candidate.image,
    ),
    3,
    `recipe-upgrade:${item.key}:${componentKey}`,
  );
  if (distractors.length !== 3) continue;
  const answerItems = [item, ...distractors];

  questions.push(
    makeQuestion({
      id: `recipe-upgrade:${componentKey}:${item.key}`,
      kind: "recipe-upgrade",
      category: "Items",
      difficulty: 2,
      eyebrow: `${component.dname} · Reverse Shopkeeper`,
      prompt: `Which item can be built using ${component.dname}?`,
      image: { src: component.image, alt: `${component.dname} item icon`, kind: "item" },
      answers: answerItems.map((candidate) => candidate.dname),
      correctAnswer: item.dname,
      answerImagesByValue: Object.fromEntries(answerItems.map((candidate) => [candidate.dname, candidate.image])),
      answerImageKind: "item",
      explanation: `${component.dname} is one of the components used to build ${item.dname}.`,
      source: clientQuestionSource,
    }),
  );
}

const priceDuelAnchors = items.filter(
  (item) => comparisonGroup(item, items, (candidate) => candidate.cost, "max", `item-price:${item.key}`).length === 4,
);
for (const item of stableSample(priceDuelAnchors, 28, "item-price-duel")) {
  const answerItems = comparisonGroup(item, items, (candidate) => candidate.cost, "max", `item-price:${item.key}`);
  const values = answerItems
    .map((candidate) => `${candidate.dname} ${candidate.cost.toLocaleString("en-US")}g`)
    .join(" · ");

  questions.push(
    makeQuestion({
      id: `item-price-duel:${item.key}`,
      kind: "item-price-duel",
      category: "Items",
      difficulty: 2,
      eyebrow: "Price Duel · Main shop",
      prompt: "Which item is the most expensive?",
      answers: answerItems.map((candidate) => candidate.dname),
      correctAnswer: item.dname,
      answerImagesByValue: Object.fromEntries(answerItems.map((candidate) => [candidate.dname, candidate.image])),
      answerImageKind: "item",
      explanation: `${item.dname} is the most expensive of these choices. ${values}.`,
      source: clientQuestionSource,
    }),
  );
}

console.log(`Checking remote assets for ${questions.length} generated questions...`);
const [imageAudit, audioAudit] = await Promise.all([auditImageAssets(questions), auditAudioAssets(questions)]);
const rejectedQuestions = questions.filter(
  (question) =>
    questionImageUrls(question).some((url) => !imageAudit.availability.get(url)) ||
    questionAudioUrls(question).some((url) => !audioAudit.availability.get(url)),
);
const sortedQuestions = balanceCorrectAnswerSlots(
  questions.filter((question) => !rejectedQuestions.includes(question)),
).sort((left, right) => left.id.localeCompare(right.id));
const verifiedAssetCount = new Set(sortedQuestions.flatMap(questionImageUrls)).size;
const verifiedAudioCount = new Set(sortedQuestions.flatMap(questionAudioUrls)).size;
const categoryCounts = Object.fromEntries(
  [...new Set(sortedQuestions.map((question) => question.category))].map((category) => [
    category,
    sortedQuestions.filter((question) => question.category === category).length,
  ]),
);
const kindCounts = Object.fromEntries(
  [...new Set(sortedQuestions.map((question) => question.kind))].map((kind) => [
    kind,
    sortedQuestions.filter((question) => question.kind === kind).length,
  ]),
);

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(sortedQuestions, null, 2)}\n`);
await writeFile(
  META_OUTPUT,
  `${JSON.stringify(
    {
      patch: PATCH,
      contentVersion: CONTENT_VERSION,
      snapshotDate: SNAPSHOT_DATE,
      questionCount: sortedQuestions.length,
      categoryCounts,
      kindCounts,
      sources: endpoints,
      clientConstantAudit: CLIENT_CONSTANT_AUDIT,
      assetValidation: {
        checkedAt: SNAPSHOT_DATE,
        verifiedAssetCount,
        verifiedAudioCount,
        rejectedQuestionIds: rejectedQuestions.map((question) => question.id).sort(),
      },
    },
    null,
    2,
  )}\n`,
);

console.log(`Generated ${sortedQuestions.length} questions for Dota ${PATCH}.`);
console.log(categoryCounts);
console.log(kindCounts);
if (rejectedQuestions.length) {
  console.warn(`Rejected ${rejectedQuestions.length} questions with unavailable assets:`);
  console.warn(
    rejectedQuestions
      .map((question) => question.id)
      .sort()
      .join("\n"),
  );
}
