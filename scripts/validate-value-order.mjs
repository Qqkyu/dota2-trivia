#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { join } from "node:path";
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

function numericAnswer(question) {
  return Number(question.answers[question.correctIndex].replace(/[^\d.]/g, ""));
}

function permutations(keys) {
  if (keys.length < 2) return [keys];
  return keys.flatMap((key, index) =>
    permutations(keys.filter((_, candidateIndex) => candidateIndex !== index)).map((tail) => [key, ...tail]),
  );
}

if (orderQuestions.length < 30) failures.push(`Only ${orderQuestions.length} ordering rounds were generated.`);
if (new Set(orderQuestions.map((question) => question.id)).size !== orderQuestions.length) {
  failures.push("Ordering question IDs are not unique.");
}

for (const question of orderQuestions) {
  const order = question.valueOrder;
  if (!isValueOrderQuestion(question)) {
    failures.push(`${question.id} does not satisfy the private ordering contract.`);
    continue;
  }
  if (
    !["value-order-item", "value-order-cooldown"].includes(question.kind) ||
    !["item-price", "ability-cooldown"].includes(order.family) ||
    order.direction !== "ascending" ||
    order.cards.length !== 4 ||
    order.values.length !== 4 ||
    new Set(order.cards.map((card) => card.key)).size !== 4 ||
    new Set(order.values.map((entry) => entry.value)).size !== 4
  ) {
    failures.push(`${question.id} has malformed or ambiguous cards.`);
    continue;
  }

  const valueByKey = new Map(order.values.map((entry) => [entry.key, entry]));
  const expectedOrder = [...order.cards]
    .sort((left, right) => valueByKey.get(left.key).value - valueByKey.get(right.key).value)
    .map((card) => card.key);
  if (expectedOrder.join(",") !== order.correctOrder.join(",")) {
    failures.push(`${question.id} has the wrong ascending order.`);
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
    return {
      answerKey,
      answerIndex: answerKey ? valueOrderAnswerIndex(question, answerKey) : null,
    };
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

  for (const sourceId of order.audit.derivedFrom) {
    const source = sourceById.get(sourceId);
    const sourceKey = source?.kind === "item-cost" ? source.id.replace(/^item-cost:/, "") : source?.id.split(":")[1];
    const derived = valueByKey.get(sourceKey);
    if (
      !source ||
      !derived ||
      derived.value !== numericAnswer(source) ||
      derived.label !== source.answers[source.correctIndex] ||
      source.patch !== question.patch
    ) {
      failures.push(`${question.id} drifted from audited source ${sourceId}.`);
    }
  }
}

if (failures.length) throw new Error(failures.join("\n"));

const familyCounts = Object.fromEntries(
  ["item-price", "ability-cooldown"].map((family) => [
    family,
    orderQuestions.filter((question) => question.valueOrder.family === family).length,
  ]),
);
console.log(
  `Validated ${orderQuestions.length} tie-free ordering rounds against current audited values: ${JSON.stringify(familyCounts)}.`,
);
