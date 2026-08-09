#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { crowdPercentage, keyedCrowdSplitRows, prioritizedKeyCounts } from "../src/lib/crowd-split.mjs";
import { valueOrderAnswerKey } from "../src/lib/value-order.mjs";

const failures = [];
const fixture = [
  { answerKey: "axe", count: 8 },
  { answerKey: "bane", count: 6 },
  { answerKey: "chen", count: 4 },
  { answerKey: "doom", count: 3 },
  { answerKey: "enigma", count: 2 },
  { answerKey: "furion", count: 1 },
];
const split = keyedCrowdSplitRows(fixture, 25, {
  correctKey: "furion",
  selectedKey: "missing-player-pick",
  maxChoices: 4,
});

if (
  crowdPercentage(8, 25) !== 32 ||
  crowdPercentage(0, 0) !== 0 ||
  split.rows.length !== 4 ||
  !split.rows.some((row) => row.answerKey === "furion" && row.count === 1) ||
  !split.rows.some((row) => row.answerKey === "missing-player-pick" && row.count === 0) ||
  split.otherCount !== 10 ||
  split.rows.reduce((sum, row) => sum + row.count, split.otherCount) !== 25
) {
  failures.push(`Ranked grid split lost a required pick or vote: ${JSON.stringify(split)}.`);
}

const duplicate = keyedCrowdSplitRows(
  [
    { answerKey: "axe", count: 2 },
    { answerKey: "axe", count: 3 },
  ],
  5,
  { correctKey: "axe" },
);
if (duplicate.rows.length !== 1 || duplicate.rows[0].count !== 5 || duplicate.otherCount !== 0) {
  failures.push("Duplicate keyed counts were not combined safely.");
}

const delivered = prioritizedKeyCounts(fixture, ["enigma", "furion"], 4);
if (
  delivered.length !== 4 ||
  !delivered.some((entry) => entry.answerKey === "axe" && entry.count === 8) ||
  !delivered.some((entry) => entry.answerKey === "enigma" && entry.count === 2) ||
  !delivered.some((entry) => entry.answerKey === "furion" && entry.count === 1)
) {
  failures.push(`The capped API payload lost a required answer: ${JSON.stringify(delivered)}.`);
}

const [heroCatalog, itemCatalog] = await Promise.all(
  ["hero-picker.json", "shopkeeper-catalog.json"].map(async (file) =>
    JSON.parse(await readFile(path.join(process.cwd(), "src", "data", file), "utf8")),
  ),
);
const fullCatalogFixtures = [
  {
    label: "heroes",
    keyCounts: heroCatalog.groups.flatMap((group) => group.heroes).map((hero) => ({ answerKey: hero.key, count: 1 })),
  },
  {
    label: "items",
    keyCounts: itemCatalog.groups.flatMap((group) => group.items).map((item) => ({ answerKey: item.key, count: 1 })),
  },
];

for (const { label, keyCounts } of fullCatalogFixtures) {
  const total = keyCounts.length;
  const correctKey = keyCounts.at(-1)?.answerKey;
  const selectedKey = keyCounts.at(-2)?.answerKey;
  const apiPayload = prioritizedKeyCounts(keyCounts, [correctKey, selectedKey], 12);
  const directUiSplit = keyedCrowdSplitRows(keyCounts, total, { correctKey, selectedKey, maxChoices: 4 });
  const cappedUiSplit = keyedCrowdSplitRows(apiPayload, total, { correctKey, selectedKey, maxChoices: 4 });

  for (const [source, result] of [
    ["full", directUiSplit],
    ["API-capped", cappedUiSplit],
  ]) {
    if (
      result.rows.length !== 4 ||
      result.otherCount !== total - 4 ||
      result.rows.reduce((sum, row) => sum + row.count, result.otherCount) !== total ||
      !result.rows.some((row) => row.answerKey === correctKey) ||
      !result.rows.some((row) => row.answerKey === selectedKey)
    ) {
      failures.push(`${label} ${source} stress split was not bounded to four named picks plus Other.`);
    }
  }

  if (
    total < 100 ||
    apiPayload.length !== 12 ||
    !apiPayload.some((entry) => entry.answerKey === correctKey) ||
    !apiPayload.some((entry) => entry.answerKey === selectedKey)
  ) {
    failures.push(`${label} stress payload was not capped safely.`);
  }
}

const orderKeys = ["blink", "force_staff", "blade_mail", "armlet"];
const orderPermutations = orderKeys.flatMap((first) =>
  orderKeys
    .filter((key) => key !== first)
    .flatMap((second) =>
      orderKeys
        .filter((key) => key !== first && key !== second)
        .flatMap((third) => {
          const fourth = orderKeys.find((key) => ![first, second, third].includes(key));
          return fourth ? [[first, second, third, fourth]] : [];
        }),
    ),
);
const orderCounts = orderPermutations.map((keys, index) => ({
  answerKey: valueOrderAnswerKey(keys),
  count: orderPermutations.length - index,
}));
const correctOrder = orderCounts.at(-1)?.answerKey;
const playerOrder = orderCounts.at(-2)?.answerKey;
const orderTotal = orderCounts.reduce((sum, entry) => sum + entry.count, 0);
const orderPayload = prioritizedKeyCounts(orderCounts, [correctOrder, playerOrder], 12);
const orderSplit = keyedCrowdSplitRows(orderPayload, orderTotal, {
  correctKey: correctOrder,
  selectedKey: playerOrder,
  maxChoices: 4,
});
if (
  orderPermutations.length !== 24 ||
  orderPayload.length !== 12 ||
  orderSplit.rows.length !== 4 ||
  !orderSplit.rows.some((row) => row.answerKey === correctOrder) ||
  !orderSplit.rows.some((row) => row.answerKey === playerOrder) ||
  orderSplit.rows.reduce((sum, row) => sum + row.count, orderSplit.otherCount) !== orderTotal
) {
  failures.push("The 24 possible card orders did not collapse into four named crowd rows plus Other.");
}

if (failures.length) throw new Error(failures.join("\n"));
console.log("Validated four-choice, full-catalog, and 24-permutation ordering crowd split calculations.");
