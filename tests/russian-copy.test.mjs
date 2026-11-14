import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRussianCopyInspector } from "../scripts/lib/russian-copy.mjs";

const englishLeft = createRussianCopyInspector(["Storm Spirit", "Abyssal Blade"]);

describe("Russian UI copy check", () => {
  it("keeps official game titles in English", () => {
    expect(englishLeft("Heroes of Newerth\nHeroes of the Storm\nHEROES OF THE STORM")).toEqual([]);
  });

  it("still rejects English instructions containing those titles", () => {
    expect(englishLeft("Choose your answer\nHeroes of the Storm is your answer")).toEqual([
      "Choose your answer",
      "Heroes of the Storm is your answer",
    ]);
  });

  it("preserves unit-name and Russian-text handling", () => {
    expect(englishLeft("Storm Spirit\nAbyssal Blade\nВыбери ответ\nAnswer locked")).toEqual(["Answer locked"]);
  });

  it("does not remove short unit names from inside a proper title", () => {
    const withIo = createRussianCopyInspector(["Io"]);
    expect(withIo("The International 2015\nThe International 1")).toEqual([]);
  });

  it("keeps the existing update and event titles", () => {
    expect(
      englishLeft("The Dark Rift\nThe New Journey\nThe Greeviling\nThe Outlanders\nWrath of the Mo'rokai"),
    ).toEqual([]);
  });

  it("accepts a short Russian phrase around a proper title", () => {
    expect(englishLeft("Не The International")).toEqual([]);
  });

  it("does not exempt English instructions that start with a proper title", () => {
    expect(englishLeft("The International is your answer\nThe New Journey is the answer")).toEqual([
      "The International is your answer",
      "The New Journey is the answer",
    ]);
  });

  it("accepts the proper names throughout the localized Flashback deck", () => {
    const read = (name) => JSON.parse(readFileSync(new URL(`../src/data/${name}`, import.meta.url), "utf8"));
    const deck = read("flashback-questions.json");
    const russian = read("i18n/questions.ru.json");
    const inspect = createRussianCopyInspector(read("i18n/ru.units.json").names);
    for (const question of deck) {
      const text = russian[question.id] ?? {};
      const cards = (question.flashback?.cards ?? []).flatMap((card) => {
        const translated = text.flashback?.cards?.[card.key] ?? {};
        return [translated.name ?? card.name, translated.context ?? card.context];
      });
      const lines = [
        text.prompt ?? question.prompt,
        text.eyebrow ?? question.eyebrow,
        ...question.answers.map((answer, index) => text.answers?.[index] ?? answer),
        text.explanation ?? question.explanation,
        ...cards,
      ].filter(Boolean);
      expect(inspect(lines.join("\n")), question.id).toEqual([]);
    }
  });
});
