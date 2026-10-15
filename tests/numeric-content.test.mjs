import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { publicQuestionForRound } from "../src/lib/public-question.mjs";
import { applyAbilityConstantAudit } from "../scripts/client-constant-audit.mjs";
import {
  DAMAGE_QUESTION_FACTS,
  damageQuestionExplanation,
  damageQuestionPrompt,
} from "../scripts/damage-question-facts.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const facts = read("./fixtures/numeric-facts-7.41f.json");
const kinds = new Set([
  "cooldown",
  "mana-cost",
  "ability-damage",
  "hero-move-speed",
  "hero-stat-duel",
  "item-cost",
  "item-price-duel",
]);
const questions = read("../src/data/questions.generated.json").filter((question) => kinds.has(question.kind));
const orderQuestions = read("../src/data/value-order-questions.json");
const byId = new Map(questions.map((question) => [question.id, question]));
const heroByName = new Map(Object.values(facts.heroes).map((hero) => [hero.name, hero]));
const itemByName = new Map(Object.values(facts.items).map((item) => [item.name, item]));
const number = (text) => Number(text.replace(/[^\d.]/g, ""));
const compact = (values) => (values.every((value) => value === values[0]) ? [values[0]] : values);
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function explanationValues(question) {
  const match =
    question.kind === "ability-damage"
      ? question.explanation.match(/: ([\d\s/.%]+)/)
      : question.explanation.match(/(?:mana cost|cooldown) is ([\d\s/.s]+)/);
  expect(match, question.id).not.toBeNull();
  return match[1].split("/").map(number);
}

function orderValue(family, key) {
  if (family === "item-price") return facts.items[key].cost;
  if (family === "hero-move-speed") return facts.heroes[key].movementSpeed;
  if (family === "hero-attack-range") return facts.heroes[key].attackRange;
  const ability = facts.abilities[key];
  return { "ability-cooldown": ability.cooldowns, "ability-mana": ability.manaCosts, "ability-damage": ability.damage }[
    family
  ].at(-1);
}

describe("all numeric questions against independent Valve public data", () => {
  it("covers all 342 Classic and 80 Order Up records", () => {
    expect(questions).toHaveLength(342);
    expect(orderQuestions).toHaveLength(80);
    expect(facts.patchEvidence.latestPublished.patch_number).toBe("7.41f");
    expect(facts.patchEvidence.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each(questions.map((question) => [question.id, question]))(
    "checks every answer and explanation in %s",
    (_id, question) => {
      expect(question.patch).toBe(facts.patch);
      expect(new Set(question.answers).size).toBe(4);
      const [, key, level] = question.id.split(":");
      const correct = question.answers[question.correctIndex];
      if (["cooldown", "mana-cost", "ability-damage"].includes(question.kind)) {
        const ability = facts.abilities[key];
        expect(question.eyebrow.split(" · ")[1]).toBe(ability.name);
        const values =
          question.kind === "cooldown"
            ? ability.cooldowns
            : question.kind === "mana-cost"
              ? ability.manaCosts
              : ability.damage;
        const expected =
          question.kind === "mana-cost" ? values[Math.min(Number(level) - 1, values.length - 1)] : values.at(-1);
        expect(number(correct)).toBe(expected);
        expect(compact(explanationValues(question))).toEqual(compact(values));
        expect(question.answers.filter((answer) => number(answer) === expected)).toHaveLength(1);
      } else if (question.kind === "hero-move-speed") {
        expect(number(correct)).toBe(facts.heroes[key].movementSpeed);
        expect(question.eyebrow).toBe(facts.heroes[key].name);
        expect(question.explanation).toContain(`${facts.heroes[key].movementSpeed} base movement speed`);
      } else if (question.kind === "hero-stat-duel") {
        const field = {
          "move-speed": "movementSpeed",
          "attack-range": "attackRange",
          "base-attack-time": "attackRate",
        }[key];
        const values = question.answers.map((name) => heroByName.get(name)[field]);
        const winner = key === "base-attack-time" ? Math.min(...values) : Math.max(...values);
        expect(values[question.correctIndex]).toBe(winner);
        expect(values.filter((value) => value === winner)).toHaveLength(1);
        question.answers.forEach((name, index) =>
          expect(Number(question.explanation.match(new RegExp(`${escaped(name)}\\s+([\\d.]+)`))?.[1])).toBe(
            values[index],
          ),
        );
        if (key === "attack-range") expect(question.prompt).toContain("base attack range");
      } else if (question.kind === "item-cost") {
        expect(number(correct)).toBe(facts.items[key].cost);
        expect(question.eyebrow).toBe(facts.items[key].name);
        expect(question.explanation).toContain(`${facts.items[key].cost.toLocaleString("en-US")} gold`);
      } else {
        const values = question.answers.map((name) => itemByName.get(name).cost);
        expect(values[question.correctIndex]).toBe(Math.max(...values));
        expect(values.filter((value) => value === Math.max(...values))).toHaveLength(1);
        question.answers.forEach((name, index) =>
          expect(
            number(question.explanation.match(new RegExp(`${escaped(name)}\\s+([\\d,]+)g`))?.[1] ?? "missing"),
          ).toBe(values[index]),
        );
      }
      expect(question.detail).toBeTruthy();
      expect(question.source.label).toBe("Valve Dota 2 public data");
      expect(question.source.url).toMatch(/^https:\/\/www\.dota2\.com\/datafeed\/(hero|ability|item)data\?/);
      expect(question.source.references.length).toBeGreaterThan(0);
    },
  );

  it.each(orderQuestions.map((question) => [question.id, question]))(
    "checks every card and order in %s",
    (_id, question) => {
      const order = question.valueOrder;
      for (const entry of order.values) expect(entry.value).toBe(orderValue(order.family, entry.key));
      const expected = order.cards
        .map((card) => card.key)
        .sort((left, right) => orderValue(order.family, left) - orderValue(order.family, right));
      expect(order.correctOrder).toEqual(expected);
      expect(new Set(order.values.map((entry) => entry.value)).size).toBe(4);
      expect(question.detail).toBeTruthy();
      const publicQuestion = publicQuestionForRound(
        question,
        { id: "numeric-proof", phase: "answering", game: "order-up", answerDeadline: 15000, answerDuration: 15000 },
        1000,
      );
      expect(publicQuestion.detail).toBe(question.detail);
      expect(publicQuestion.reveal).toBeNull();
    },
  );

  it("states the reviewed spell conditions before the player answers", () => {
    const mirana = byId.get("damage:mirana_starfall:4");
    expect(mirana.prompt).toContain("primary-meteor damage");
    expect(mirana.explanation).toContain("80%");
    expect(byId.get("damage:snapfire_scatterblast:4").explanation).toContain("25% more");
    expect(byId.get("damage:axe_culling_blade:3").explanation).not.toContain("threshold");
    const invoke = byId.get("cooldown:invoker_invoke:1");
    expect(invoke.detail).toContain("before reductions from orb levels");
    expect(invoke.explanation).toContain("0.3 seconds");
    const invokeCard = orderQuestions
      .flatMap((question) => question.valueOrder.cards)
      .find((card) => card.key === "invoker_invoke");
    expect(invokeCard.context).toContain("before orb-level reductions");
    for (const question of questions.filter((entry) => entry.kind === "ability-damage")) {
      expect(question.detail).toContain("enemy heroes");
      expect(question.detail).toContain("facets");
    }
    for (const question of questions.filter(
      (entry) => entry.id === "item-cost:dagon" || entry.answers.includes("Dagon"),
    )) {
      expect(question.detail).toContain("Dagon means level 1");
    }
  });

  it("keeps the independently corrected facts when the generator sees stale upstream data", () => {
    for (const [key, field, stale] of [
      ["rubick_fade_bolt", "damage", [100, 175, 250, 325]],
      ["vengefulspirit_magic_missile", "magic_missile_damage", [85, 170, 255, 340]],
    ]) {
      const corrected = applyAbilityConstantAudit({ key, attrib: [{ key: field, header: "DAMAGE:", value: stale }] });
      expect(corrected.attrib[0].value).toEqual(facts.abilities[key].damage);
    }
    expect(damageQuestionPrompt("Starstorm", DAMAGE_QUESTION_FACTS.mirana_starfall, true)).toBe(
      "What is Starstorm's primary-meteor damage at max level?",
    );
    expect(
      damageQuestionExplanation(
        "Scatterblast",
        DAMAGE_QUESTION_FACTS.snapfire_scatterblast,
        facts.abilities.snapfire_scatterblast.damage,
      ),
    ).toContain("25% more damage");
  });
});
