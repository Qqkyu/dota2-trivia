#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { damageOrderMeasurement } from "./damage-question-facts.mjs";
import { ORDER_DETAILS } from "./numeric-question-copy.mjs";
import {
  isValueOrderAnswerForQuestion,
  isValueOrderQuestion,
  valueOrderAnswerIndex,
  valueOrderAnswerKey,
  valueOrderCorrectAnswerKey,
  valueOrderKeysFromAnswerKey,
} from "../src/lib/value-order.mjs";

const root = process.cwd();
const readJson = async (file) => JSON.parse(await readFile(join(root, "src", "data", file), "utf8"));
const [sourceQuestions, orderQuestions] = await Promise.all([
  readJson("questions.generated.json"),
  readJson("value-order-questions.json"),
]);
const sourceById = new Map(sourceQuestions.map((question) => [question.id, question]));
const failures = [];

const FAMILY_RULES = Object.freeze({
  "item-price": {
    kind: "value-order-item",
    count: 16,
    cardKind: "item",
    prompt: "How do these items rank from cheapest to most expensive?",
  },
  "ability-cooldown": {
    kind: "value-order-cooldown",
    count: 16,
    cardKind: "ability",
    prompt: "How do these abilities rank from shortest to longest max-level cooldown?",
  },
  "ability-mana": {
    kind: "value-order-mana",
    count: 12,
    cardKind: "ability",
    prompt: "How do these abilities rank from lowest to highest max-level mana cost?",
  },
  "ability-damage": {
    kind: "value-order-damage",
    count: 12,
    cardKind: "ability",
    prompt: "How do these abilities rank from lowest to highest max-level damage?",
  },
  "hero-move-speed": {
    kind: "value-order-move-speed",
    count: 12,
    cardKind: "hero",
    prompt: "How do these heroes rank from slowest to fastest?",
  },
  "hero-attack-range": {
    kind: "value-order-attack-range",
    count: 12,
    cardKind: "hero",
    prompt: "How do these heroes rank from shortest to longest base attack range?",
  },
});

function numericAnswer(question) {
  const answer = question?.answers?.[question.correctIndex];
  const value = typeof answer === "string" ? Number(answer.replace(/[^\d.]/g, "")) : Number.NaN;
  return Number.isFinite(value) ? value : null;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function maxLevelMana(question) {
  const match = question?.explanation?.match(/mana cost is ([\d\s/.]+?)(?: across its levels|, before)/i);
  const values = match?.[1]
    .split("/")
    .map((value) => Number(value.trim()))
    .filter(Number.isFinite);
  return values?.at(-1) ?? null;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rangeSourceIndex(source, card) {
  const imageIndex = source?.answerImages?.indexOf(card.image) ?? -1;
  if (imageIndex >= 0) return imageIndex;
  return source?.answers?.indexOf(card.name) ?? -1;
}

function sourceMatchesCard(family, source, card) {
  if (!source) return false;
  if (family === "item-price") return source.id === `item-cost:${card.key}`;
  if (family === "ability-cooldown") return source.kind === "cooldown" && source.id.split(":")[1] === card.key;
  if (family === "ability-mana") return source.kind === "mana-cost" && source.id.split(":")[1] === card.key;
  if (family === "ability-damage") {
    return source.kind === "ability-damage" && source.id.split(":")[1] === card.key;
  }
  if (family === "hero-move-speed") return source.id === `move-speed:${card.key}`;
  return (
    family === "hero-attack-range" &&
    source.kind === "hero-stat-duel" &&
    source.eyebrow.endsWith("attack range") &&
    rangeSourceIndex(source, card) >= 0
  );
}

function sourceValueAndLabel(family, source, card) {
  if (family === "item-price" || family === "ability-cooldown") {
    return {
      value: numericAnswer(source),
      label: `${source.answers[source.correctIndex]}${card.key === "invoker_invoke" ? " base cooldown" : ""}`,
    };
  }
  if (family === "ability-mana") {
    const value = maxLevelMana(source);
    return { value, label: `${formatNumber(value)} mana` };
  }
  if (family === "ability-damage") {
    const value = numericAnswer(source);
    return { value, label: `${formatNumber(value)} ${damageOrderMeasurement(card.key)}` };
  }
  if (family === "hero-move-speed") {
    const value = numericAnswer(source);
    return { value, label: `${formatNumber(value)} move speed` };
  }
  const sourceName = source.answers[rangeSourceIndex(source, card)];
  const value = Number(source.explanation?.match(new RegExp(`${escapeRegex(sourceName)}\\s+([\\d.]+)`))?.[1]);
  return { value, label: `${formatNumber(value)} range` };
}

const closeValueUniverseByFamily = new Map(
  [
    ["ability-mana", sourceQuestions.filter((question) => question.kind === "mana-cost").map(maxLevelMana)],
    [
      "ability-damage",
      sourceQuestions
        .filter((question) => question.kind === "ability-damage" && damageOrderMeasurement(question.id.split(":")[1]))
        .map(numericAnswer),
    ],
    ["hero-move-speed", sourceQuestions.filter((question) => question.kind === "hero-move-speed").map(numericAnswer)],
    [
      "hero-attack-range",
      sourceQuestions
        .filter((question) => question.kind === "hero-stat-duel" && question.eyebrow.endsWith("attack range"))
        .flatMap((question) =>
          question.answers.map(
            (name, index) =>
              sourceValueAndLabel("hero-attack-range", question, {
                name,
                image: question.answerImages[index],
              }).value,
          ),
        ),
    ],
  ].map(([family, values]) => [
    family,
    [...new Set(values.filter(Number.isFinite))].sort((left, right) => left - right),
  ]),
);

function permutations(keys) {
  if (keys.length < 2) return [keys];
  return keys.flatMap((key, index) =>
    permutations(keys.filter((_, candidateIndex) => candidateIndex !== index)).map((tail) => [key, ...tail]),
  );
}

if (orderQuestions.length !== 80) failures.push(`Expected 80 ordering rounds; found ${orderQuestions.length}.`);
if (new Set(orderQuestions.map((question) => question.id)).size !== orderQuestions.length) {
  failures.push("Ordering question IDs are not unique.");
}

const cardSetSignatures = new Set();
for (const question of orderQuestions) {
  const order = question.valueOrder;
  if (!isValueOrderQuestion(question)) {
    failures.push(`${question.id} does not satisfy the private ordering contract.`);
    continue;
  }

  if (question.detail !== ORDER_DETAILS[order.family]) {
    failures.push(`${question.id} omits its visible comparison conditions.`);
  }
  const rule = FAMILY_RULES[order.family];
  if (
    !rule ||
    question.kind !== rule.kind ||
    question.prompt !== rule.prompt ||
    order.direction !== "ascending" ||
    order.cards.length !== 4 ||
    order.values.length !== 4 ||
    order.cards.some((card) => card.kind !== rule.cardKind) ||
    new Set(order.cards.map((card) => card.key)).size !== 4 ||
    new Set(order.values.map((entry) => entry.value)).size !== 4
  ) {
    failures.push(`${question.id} has a malformed, ambiguous, or mislabeled ordering contract.`);
    continue;
  }

  const cardSetSignature = `${order.family}:${order.cards
    .map((card) => card.key)
    .sort()
    .join("|")}`;
  if (cardSetSignatures.has(cardSetSignature)) failures.push(`${question.id} repeats an exact card set.`);
  cardSetSignatures.add(cardSetSignature);

  const valueByKey = new Map(order.values.map((entry) => [entry.key, entry]));
  const closeValueUniverse = closeValueUniverseByFamily.get(order.family);
  if (closeValueUniverse) {
    const valueIndexes = order.values
      .map((entry) => closeValueUniverse.indexOf(entry.value))
      .sort((left, right) => left - right);
    if (
      valueIndexes.some((index) => index < 0) ||
      valueIndexes.some((index, position) => position > 0 && index !== valueIndexes[position - 1] + 1)
    ) {
      failures.push(`${question.id} is not built from four neighboring audited values.`);
    }
  }
  const expectedOrder = [...order.cards]
    .sort((left, right) => valueByKey.get(left.key).value - valueByKey.get(right.key).value)
    .map((card) => card.key);
  if (expectedOrder.join(",") !== order.correctOrder.join(",")) {
    failures.push(`${question.id} has the wrong ascending order.`);
  }

  if (!Array.isArray(order.audit?.derivedFrom) || order.audit.derivedFrom.length !== 4) {
    failures.push(`${question.id} lost its four-source audit trail.`);
  } else {
    const sources = order.audit.derivedFrom.map((sourceId) => sourceById.get(sourceId));
    for (const [cardIndex, card] of order.cards.entries()) {
      const source = sources.find((candidate) => sourceMatchesCard(order.family, candidate, card));
      const derived = valueByKey.get(card.key);
      const expected = source ? sourceValueAndLabel(order.family, source, card) : null;
      if (
        !source ||
        !derived ||
        !Number.isFinite(expected?.value) ||
        derived.value !== expected.value ||
        derived.label !== expected.label ||
        source.patch !== question.patch
      ) {
        failures.push(`${question.id} card ${cardIndex + 1} drifted from its audited source.`);
      }
      if (order.family === "ability-damage" && source) {
        const measurement = damageOrderMeasurement(card.key);
        if (
          !measurement ||
          !card.context?.endsWith(` · ${measurement}`) ||
          question.detail !== ORDER_DETAILS["ability-damage"]
        ) {
          failures.push(`${question.id} omits the damage measurement or conditions for ${source.id}.`);
        }
      }
      if (card.key === "invoker_invoke" && !card.context?.includes("before orb-level reductions")) {
        failures.push(`${question.id} omits Invoke's orb-level condition.`);
      }
    }
  }

  const correctKey = valueOrderCorrectAnswerKey(question);
  if (
    !correctKey ||
    valueOrderKeysFromAnswerKey(correctKey)?.join(",") !== expectedOrder.join(",") ||
    !isValueOrderAnswerForQuestion(question, correctKey) ||
    valueOrderAnswerIndex(question, correctKey) !== question.correctIndex
  ) {
    failures.push(`${question.id} cannot resolve its correct opaque answer.`);
  }

  const submittedOrders = permutations(order.cards.map((card) => card.key));
  const resolvedOrders = submittedOrders.map((keys) => {
    const answerKey = valueOrderAnswerKey(keys);
    return { answerKey, answerIndex: answerKey ? valueOrderAnswerIndex(question, answerKey) : null };
  });
  if (
    submittedOrders.length !== 24 ||
    resolvedOrders.some(({ answerKey, answerIndex }) => !answerKey || answerIndex === null) ||
    resolvedOrders.filter(({ answerIndex }) => answerIndex === question.correctIndex).length !== 1 ||
    resolvedOrders.find(({ answerIndex }) => answerIndex === question.correctIndex)?.answerKey !== correctKey
  ) {
    failures.push(`${question.id} does not resolve all 24 possible orders with exactly one winner.`);
  }

  const wrongOrder = [expectedOrder[1], expectedOrder[0], expectedOrder[2], expectedOrder[3]];
  const wrongKey = valueOrderAnswerKey(wrongOrder);
  if (
    !wrongKey ||
    valueOrderAnswerIndex(question, wrongKey) === null ||
    valueOrderAnswerIndex(question, wrongKey) === question.correctIndex
  ) {
    failures.push(`${question.id} cannot resolve a valid wrong order.`);
  }
  if (
    isValueOrderAnswerForQuestion(
      question,
      valueOrderAnswerKey([expectedOrder[0], expectedOrder[1], expectedOrder[2], "foreign_key"]),
    )
  ) {
    failures.push(`${question.id} accepts a card from another question.`);
  }
}

const familyCounts = Object.fromEntries(
  Object.entries(FAMILY_RULES).map(([family, rule]) => {
    const count = orderQuestions.filter((question) => question.valueOrder?.family === family).length;
    if (count !== rule.count) failures.push(`${family} expected ${rule.count} rounds; found ${count}.`);
    return [family, count];
  }),
);

if (failures.length) throw new Error(failures.join("\n"));

console.log(
  `Validated ${orderQuestions.length} tie-free ordering rounds against current audited values: ${JSON.stringify(familyCounts)}.`,
);
