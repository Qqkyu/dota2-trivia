import { describe, expect, it } from "vitest";
import heroCatalog from "../src/data/hero-picker.json" with { type: "json" };
import itemCatalog from "../src/data/shopkeeper-catalog.json" with { type: "json" };
import { crowdPercentage, keyedCrowdSplitRows, prioritizedKeyCounts } from "../src/lib/crowd-split.mjs";
import flashbackQuestions from "../src/data/flashback-questions.json" with { type: "json" };
import valueOrderQuestions from "../src/data/value-order-questions.json" with { type: "json" };
import { orderCardsForAnswerKey, valueOrderAnswerKey } from "../src/lib/value-order.mjs";

const fixture = [
  { answerKey: "axe", count: 8 },
  { answerKey: "bane", count: 6 },
  { answerKey: "chen", count: 4 },
  { answerKey: "doom", count: 3 },
  { answerKey: "enigma", count: 2 },
  { answerKey: "furion", count: 1 },
];

describe("orderCardsForAnswerKey", () => {
  const orderRounds = [...flashbackQuestions, ...valueOrderQuestions].filter(
    (question) => question.flashback?.correctOrder ?? question.valueOrder?.correctOrder,
  );

  it("names the picked order in Flashback and Order Up rounds", () => {
    expect(orderRounds.some((question) => question.flashback)).toBe(true);
    expect(orderRounds.some((question) => question.valueOrder)).toBe(true);
    for (const question of orderRounds) {
      const order = question.flashback?.correctOrder ?? question.valueOrder.correctOrder;
      const cards = orderCardsForAnswerKey(question, valueOrderAnswerKey(order));
      expect(cards?.map((card) => card.key)).toEqual(order);
    }
  });

  it("does not guess when a card is not in the round", () => {
    const [question] = orderRounds;
    const order = question.flashback?.correctOrder ?? question.valueOrder.correctOrder;
    expect(orderCardsForAnswerKey(question, valueOrderAnswerKey([...order.slice(0, 3), "missing_card"]))).toBeNull();
  });
});

describe("crowdPercentage", () => {
  it("rounds to whole percents and survives an empty room", () => {
    expect(crowdPercentage(8, 25)).toBe(32);
    expect(crowdPercentage(0, 0)).toBe(0);
  });
});

describe("keyedCrowdSplitRows", () => {
  it("keeps the correct answer and the player's pick visible even with zero votes", () => {
    const split = keyedCrowdSplitRows(fixture, 25, {
      correctKey: "furion",
      selectedKey: "missing-player-pick",
      maxChoices: 4,
    });
    expect(split.rows).toHaveLength(4);
    expect(split.rows).toContainEqual({ answerKey: "furion", count: 1 });
    expect(split.rows).toContainEqual({ answerKey: "missing-player-pick", count: 0 });
    expect(split.otherCount).toBe(10);
    expect(split.rows.reduce((sum, row) => sum + row.count, split.otherCount)).toBe(25);
  });

  it("merges duplicate keys", () => {
    const duplicate = keyedCrowdSplitRows(
      [
        { answerKey: "axe", count: 2 },
        { answerKey: "axe", count: 3 },
      ],
      5,
      { correctKey: "axe" },
    );
    expect(duplicate.rows).toEqual([{ answerKey: "axe", count: 5 }]);
    expect(duplicate.otherCount).toBe(0);
  });
});

describe("prioritizedKeyCounts", () => {
  it("caps the payload without dropping required keys", () => {
    const delivered = prioritizedKeyCounts(fixture, ["enigma", "furion"], 4);
    expect(delivered).toHaveLength(4);
    expect(delivered).toContainEqual({ answerKey: "axe", count: 8 });
    expect(delivered).toContainEqual({ answerKey: "enigma", count: 2 });
    expect(delivered).toContainEqual({ answerKey: "furion", count: 1 });
  });
});

describe("full-catalog stress", () => {
  const fixtures = [
    ["heroes", heroCatalog.groups.flatMap((group) => group.heroes).map((hero) => ({ answerKey: hero.key, count: 1 }))],
    ["items", itemCatalog.groups.flatMap((group) => group.items).map((item) => ({ answerKey: item.key, count: 1 }))],
  ];

  it.each(fixtures)("collapses every %s vote into four named rows plus Other", (label, keyCounts) => {
    const total = keyCounts.length;
    expect(total).toBeGreaterThanOrEqual(100);
    const correctKey = keyCounts.at(-1)?.answerKey;
    const selectedKey = keyCounts.at(-2)?.answerKey;
    const apiPayload = prioritizedKeyCounts(keyCounts, [correctKey, selectedKey], 12);
    expect(apiPayload).toHaveLength(12);
    expect(apiPayload.map((entry) => entry.answerKey)).toEqual(expect.arrayContaining([correctKey, selectedKey]));

    for (const source of [keyCounts, apiPayload]) {
      const split = keyedCrowdSplitRows(source, total, { correctKey, selectedKey, maxChoices: 4 });
      expect(split.rows).toHaveLength(4);
      expect(split.otherCount).toBe(total - 4);
      expect(split.rows.reduce((sum, row) => sum + row.count, split.otherCount)).toBe(total);
      expect(split.rows.map((row) => row.answerKey)).toEqual(expect.arrayContaining([correctKey, selectedKey]));
    }
  });

  it("collapses all 24 card orders into four rows plus Other", () => {
    const orderKeys = ["blink", "force_staff", "blade_mail", "armlet"];
    const permutations = orderKeys.flatMap((first) =>
      orderKeys
        .filter((key) => key !== first)
        .flatMap((second) =>
          orderKeys
            .filter((key) => key !== first && key !== second)
            .map((third) => [first, second, third, orderKeys.find((key) => ![first, second, third].includes(key))]),
        ),
    );
    expect(permutations).toHaveLength(24);
    const counts = permutations.map((keys, index) => ({ answerKey: valueOrderAnswerKey(keys), count: 24 - index }));
    const correctOrder = counts.at(-1).answerKey;
    const playerOrder = counts.at(-2).answerKey;
    const total = counts.reduce((sum, entry) => sum + entry.count, 0);
    const payload = prioritizedKeyCounts(counts, [correctOrder, playerOrder], 12);
    const split = keyedCrowdSplitRows(payload, total, {
      correctKey: correctOrder,
      selectedKey: playerOrder,
      maxChoices: 4,
    });
    expect(payload).toHaveLength(12);
    expect(split.rows).toHaveLength(4);
    expect(split.rows.map((row) => row.answerKey)).toEqual(expect.arrayContaining([correctOrder, playerOrder]));
    expect(split.rows.reduce((sum, row) => sum + row.count, split.otherCount)).toBe(total);
  });
});
