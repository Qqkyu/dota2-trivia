import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { applyAbilityTextOverrides, loadAbilityTextOverrides } from "../scripts/ability-text-overrides.mjs";
import { applySpellLinkOverride, loadSpellLinkOverrides } from "../scripts/spell-link-overrides.mjs";

const questions = JSON.parse(await readFile(new URL("../src/data/questions.generated.json", import.meta.url), "utf8"));
const overrides = await loadSpellLinkOverrides("7.41f");

describe("reviewed Spell Link descriptions", () => {
  it("preserves all 37 reviewed descriptions when upstream returns different nonempty text", () => {
    const reviewedIds = Object.keys(overrides.records);
    expect(reviewedIds).toHaveLength(37);
    for (const id of reviewedIds) {
      const current = questions.find((question) => question.id === id);
      expect(current, id).toBeDefined();
      const upstream = { ...current, hint: "An unreviewed clue.", explanation: "Unreviewed upstream text." };
      const result = applySpellLinkOverride(upstream, overrides, "7.41f");
      expect(result.explanation, id).toBe(current.explanation);
      expect(result.hint, id).toBe(current.hint);
      expect(result.source, id).toEqual(overrides.records[id].source);
      expect(result.answers, id).toBe(upstream.answers);
      expect(result.correctIndex, id).toBe(upstream.correctIndex);
      expect(result.image, id).toBe(upstream.image);
      expect(result.id, id).toBe(upstream.id);
      expect(upstream.explanation, id).toBe("Unreviewed upstream text.");
    }
  });

  it("does not change other games or select different abilities", () => {
    const untouched = questions.filter((question) => !overrides.records[question.id]);
    for (const question of untouched) {
      expect(applySpellLinkOverride(question, overrides, "7.41f")).toBe(question);
    }
    const updated = questions.map((question) => applySpellLinkOverride(question, overrides, "7.41f"));
    expect(updated.map((question) => question.id)).toEqual(questions.map((question) => question.id));
  });

  it("rejects stale patch reviews and changed hero or ability identities", async () => {
    const question = questions.find((entry) => entry.id === "ability-owner:muerta_the_calling");
    await expect(loadSpellLinkOverrides("7.42")).rejects.toThrow("Review spell-link-overrides.json");
    expect(() => applySpellLinkOverride(question, overrides, "7.42")).toThrow("Review spell-link-overrides.json");
    expect(() => applySpellLinkOverride({ ...question, patch: "7.42" }, overrides, "7.41f")).toThrow(
      "Review spell-link-overrides.json",
    );
    expect(() => applySpellLinkOverride({ ...question, eyebrow: "A different ability" }, overrides, "7.41f")).toThrow(
      "no longer matches",
    );
    const answers = [...question.answers];
    answers[question.correctIndex] = "A different hero";
    expect(() => applySpellLinkOverride({ ...question, answers }, overrides, "7.41f")).toThrow("no longer matches");
  });

  it("keeps the independently checked Calling mechanics in both fallback and reviewed text", async () => {
    const abilities = { muerta_the_calling: { desc: "" } };
    applyAbilityTextOverrides(abilities, await loadAbilityTextOverrides());
    const fallback = abilities.muerta_the_calling.desc;
    const reviewed = overrides.records["ability-owner:muerta_the_calling"].description;
    for (const description of [fallback, reviewed]) {
      expect(description).toMatch(/area.*movement speed/i);
      expect(description).toMatch(/revenant.*silenc/i);
      expect(description).not.toMatch(/attack.*slow|attack speed/i);
    }
  });
});
