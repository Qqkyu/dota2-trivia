import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { recipeAnswerKeyForItems, recipeBuilderAnswerIndex } from "../src/lib/item-picker.mjs";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const [questions, catalog, facts] = await Promise.all([
  readJson("../src/data/shopkeeper-questions.json"),
  readJson("../src/data/shopkeeper-catalog.json"),
  readJson("./fixtures/shopkeeper-valve-7.41f.json"),
]);
const items = catalog.groups.flatMap((group) => group.items);
const sameRecipe = (left, right) => [...left].sort().join("+") === [...right].sort().join("+");
const recipesFor = (key) => facts.items[key]?.recipes ?? [];
const matchesRecipe = (key, components) => recipesFor(key).some((recipe) => sameRecipe(recipe, components));
const expand = (references) => references.flatMap((item) => Array(item.count).fill(item.key));

function allIngredients(key, seen = new Set()) {
  if (seen.has(key)) return new Set();
  const next = new Set(seen).add(key);
  return new Set([
    key,
    ...recipesFor(key).flatMap((recipe) => recipe.flatMap((part) => [...allIngredients(part, next)])),
  ]);
}

function checkReference(reference) {
  expect(reference.name).toBe(facts.items[reference.key]?.name);
  expect(reference.image).toContain(`/items/${reference.key}.png`);
  expect(Number.isSafeInteger(reference.count) && reference.count > 0).toBe(true);
}

describe("Shopkeeper facts from Valve's independent public data feeds", () => {
  it("covers every catalog entry and all stored questions", () => {
    expect(items).toHaveLength(182);
    expect(Object.keys(facts.items).sort()).toEqual(items.map((item) => item.key).sort());
    expect(questions).toHaveLength(102);
    expect(new Set(questions.map((question) => question.id)).size).toBe(102);
    expect(catalog.patch).toBe(facts.patch);
  });

  it.each(items.map((item) => [item.key, item]))("verifies the name and gold cost of %s", (_key, item) => {
    const official = facts.items[item.key];
    expect(item.name).toBe(official.name);
    expect(item.cost).toBe(official.cost);
    expect(Number.isSafeInteger(item.cost) && item.cost >= 0).toBe(true);
    expect(item.image).toContain(`/items/${item.key}.png`);
    expect(item.key).not.toMatch(/^recipe_/);
  });

  it.each(questions.map((question) => [question.id, question]))(
    "verifies every claim and valid answer in %s",
    (_id, question) => {
      const data = question.shopkeeper;
      expect(question.patch).toBe(facts.patch);
      expect(question.answers).toHaveLength(4);
      expect(new Set(question.answers).size).toBe(4);
      expect(question.correctIndex).toBeGreaterThanOrEqual(0);
      expect(question.correctIndex).toBeLessThan(4);
      data.promptItems.forEach(checkReference);
      data.answerGroups?.flat().forEach(checkReference);

      if (data.answerItemKeys) {
        expect(question.answers).toEqual(data.answerItemKeys.map((key) => facts.items[key].name));
        data.answerItemKeys.forEach((key, index) =>
          expect(question.answerImages[index]).toContain(`/items/${key}.png`),
        );
      }
      if (data.answerCosts) expect(data.answerCosts).toEqual(data.answerItemKeys.map((key) => facts.items[key].cost));
      if (data.answerItemKeys && data.answerRecipeKeys) {
        data.answerItemKeys.forEach((key, index) =>
          expect(matchesRecipe(key, data.answerRecipeKeys[index])).toBe(true),
        );
      }

      if (data.format === "build-result") {
        const components = expand(data.promptItems);
        expect(sameRecipe(components, data.recipeComponentKeys)).toBe(true);
        const allValidResults = Object.keys(facts.items).filter((key) => matchesRecipe(key, components));
        expect(allValidResults).toEqual([data.targetItemKey]);
        expect(data.answerItemKeys[question.correctIndex]).toBe(data.targetItemKey);
        expect(question.explanation).toContain(facts.items[data.targetItemKey].name);
        for (const reference of data.promptItems) {
          expect(question.explanation).toContain(
            `${reference.name}${reference.count > 1 ? ` ×${reference.count}` : ""}`,
          );
        }
      } else if (data.format === "real-recipe") {
        const official = facts.items[data.targetItemKey];
        expect(official.recipes).toHaveLength(1);
        expect(sameRecipe(data.recipeComponentKeys, official.recipes[0])).toBe(true);
        expect(data.recipeCost).toBe(official.recipeCost);
        expect(data.recipeCost).toBe(
          official.cost - data.recipeComponentKeys.reduce((sum, key) => sum + facts.items[key].cost, 0),
        );
        expect(question.prompt).toBe(`Build ${official.name}.`);
        expect(data.promptItems.map((item) => item.key)).toEqual([data.targetItemKey]);
        expect(question.image.src).toContain(`/items/${data.targetItemKey}.png`);
        expect(data.answerRecipeKeys.map((recipe) => matchesRecipe(data.targetItemKey, recipe))).toEqual(
          [0, 1, 2, 3].map((index) => index === question.correctIndex),
        );
        data.answerGroups.forEach((group, index) =>
          expect(sameRecipe(expand(group), data.answerRecipeKeys[index])).toBe(true),
        );
        expect(recipeBuilderAnswerIndex(question, recipeAnswerKeyForItems([...official.recipes[0]].reverse()))).toBe(
          question.correctIndex,
        );
        for (const component of official.recipes[0])
          expect(question.explanation).toContain(facts.items[component].name);
        if (official.recipeCost === 0) expect(question.explanation).toContain("No recipe scroll is needed.");
      } else if (data.format === "shared-part") {
        expect(question.prompt).toContain("directly");
        expect(data.promptItems.map((item) => item.key)).toEqual(data.targetItemKeys);
        const recipes = data.targetItemKeys.map((key, index) => {
          expect(matchesRecipe(key, data.targetRecipeKeys[index])).toBe(true);
          expect(question.explanation).toContain(facts.items[key].name);
          return recipesFor(key)[0];
        });
        const allShared = [...new Set(recipes[0].filter((key) => recipes[1].includes(key)))];
        expect(allShared).toEqual([data.sharedComponentKey]);
        expect(data.answerItemKeys[question.correctIndex]).toBe(data.sharedComponentKey);
        expect(question.explanation).toContain(facts.items[data.sharedComponentKey].name);
        expect(question.explanation).toContain("direct recipes");
      } else if (data.format === "upgrade-path") {
        const directUpgrades = Object.keys(facts.items).filter((key) =>
          recipesFor(key).some((recipe) => recipe.includes(data.sourceItemKey)),
        );
        const allUpgrades = Object.keys(facts.items).filter(
          (key) => key !== data.sourceItemKey && allIngredients(key).has(data.sourceItemKey),
        );
        expect(directUpgrades).toEqual([data.targetItemKey]);
        expect(allUpgrades).toEqual([data.targetItemKey]);
        expect(data.answerItemKeys[question.correctIndex]).toBe(data.targetItemKey);
        expect(data.promptItems.map((item) => item.key)).toEqual([data.sourceItemKey]);
        expect(question.prompt).toContain(facts.items[data.sourceItemKey].name);
        expect(question.explanation).toContain(facts.items[data.sourceItemKey].name);
        expect(question.explanation).toContain(facts.items[data.targetItemKey].name);
        expect(question.explanation).toContain("direct component");
        data.answerItemKeys.forEach((key, index) =>
          expect([...allIngredients(key)].sort()).toEqual(data.answerIngredientKeys[index]),
        );
      } else {
        throw new Error(`Unreviewed Shopkeeper format ${data.format}`);
      }
    },
  );
});
