export const SHOPKEEPER_KINDS = new Set([
  "shopkeeper-build-result",
  "shopkeeper-real-recipe",
  "shopkeeper-shared-part",
  "shopkeeper-upgrade-path",
]);

const FORMAT_BY_KIND = {
  "shopkeeper-build-result": "build-result",
  "shopkeeper-real-recipe": "real-recipe",
  "shopkeeper-shared-part": "shared-part",
  "shopkeeper-upgrade-path": "upgrade-path",
};

const CONNECTOR_WORDS = new Set(["and", "for", "from", "into", "item", "recipe", "the", "with"]);

function stableHash(input) {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function itemNameTokens(value) {
  return String(value ?? "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !CONNECTOR_WORDS.has(word));
}

export function itemNamesOverlap(left, right) {
  const leftTokens = new Set(itemNameTokens(left));
  return itemNameTokens(right).some((token) => leftTokens.has(token));
}

export function eligibleShopkeeperComponents(item, itemsByKey) {
  const distinctComponents = [...new Set(item.components ?? [])]
    .map((key) => ({ ...itemsByKey[key], key }))
    .filter(
      (component) =>
        component.key &&
        component.dname &&
        component.img &&
        Number.isFinite(component.cost) &&
        component.cost > 0 &&
        !component.key.startsWith("recipe_") &&
        !/\brecipe\b/i.test(component.dname),
    );

  if (distinctComponents.length < 2) return [];
  return distinctComponents.filter((component) => !itemNamesOverlap(item.dname, component.dname));
}

export function selectShopkeeperDistractors(candidates, correct, excludedKeys, salt) {
  const excluded = new Set(excludedKeys);
  return candidates
    .filter(
      (candidate) =>
        candidate.key !== correct.key &&
        !excluded.has(candidate.key) &&
        candidate.dname &&
        candidate.image &&
        Number.isFinite(candidate.cost) &&
        candidate.cost > 0 &&
        !candidate.key.startsWith("recipe_") &&
        !/\brecipe\b/i.test(candidate.dname),
    )
    .sort((left, right) => {
      const leftDistance = Math.abs(Math.log(left.cost / correct.cost));
      const rightDistance = Math.abs(Math.log(right.cost / correct.cost));
      return (
        leftDistance - rightDistance ||
        stableHash(`${salt}:${left.key}`) - stableHash(`${salt}:${right.key}`) ||
        left.key.localeCompare(right.key)
      );
    })
    .slice(0, 3);
}

export function areShopkeeperPricesBalanced(items, correct) {
  return (
    items.length === 4 &&
    Number.isFinite(correct?.cost) &&
    correct.cost > 0 &&
    items.every(
      (item) =>
        Number.isFinite(item?.cost) &&
        item.cost > 0 &&
        item.cost / correct.cost >= 0.74 &&
        item.cost / correct.cost <= 1.36,
    )
  );
}

function sameMultiset(left = [], right = []) {
  if (left.length !== right.length) return false;
  return [...left].sort().join("\0") === [...right].sort().join("\0");
}

function multisetDifference(left = [], right = []) {
  const counts = new Map();
  for (const key of left) counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const key of right) counts.set(key, (counts.get(key) ?? 0) - 1);
  return [...counts.values()].reduce((total, count) => total + Math.abs(count), 0);
}

function expandedPromptKeys(items = []) {
  return items.flatMap((item) => Array.from({ length: item.count ?? 1 }, () => item.key));
}

function validItemReference(item) {
  return (
    typeof item?.key === "string" &&
    item.key.length > 0 &&
    typeof item?.name === "string" &&
    item.name.length > 0 &&
    /^https:\/\//.test(item?.image ?? "") &&
    Number.isInteger(item?.count) &&
    item.count >= 1 &&
    item.count <= 4
  );
}

export function shopkeeperQuestionIssues(question) {
  if (question?.kind === "recipe-component") return ["retired single-component format"];
  if (!SHOPKEEPER_KINDS.has(question?.kind)) return [];

  const issues = [];
  const audit = question.shopkeeper;
  const expectedFormat = FORMAT_BY_KIND[question.kind];
  if (!audit || audit.format !== expectedFormat) issues.push("format metadata mismatch");
  if (!audit?.clientBuild) issues.push("missing client build audit");
  if (!Array.isArray(audit?.promptItems) || !audit.promptItems.every(validItemReference)) {
    issues.push("invalid prompt item tray");
  }
  if (!Array.isArray(question.answers) || question.answers.length !== 4 || new Set(question.answers).size !== 4) {
    issues.push("invalid answer shelf");
  }
  if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex > 3) {
    issues.push("invalid correct answer slot");
  }

  if (expectedFormat === "build-result") {
    const promptKeys = expandedPromptKeys(audit?.promptItems);
    const promptSet = new Set(promptKeys);
    if (promptKeys.length < 2 || promptKeys.length > 4) issues.push("build tray must contain two to four components");
    if (!sameMultiset(promptKeys, audit?.recipeComponentKeys)) issues.push("build tray drifted from recipe");
    if (audit?.answerItemKeys?.[question.correctIndex] !== audit?.targetItemKey)
      issues.push("wrong build result marked correct");
    for (const [index, recipe] of (audit?.answerRecipeKeys ?? []).entries()) {
      if (index !== question.correctIndex && !recipe.some((key) => promptSet.has(key))) {
        issues.push(`build option ${index + 1} has no recipe overlap`);
      }
    }
    if ((audit?.answerItemKeys ?? []).some((key) => promptSet.has(key))) {
      issues.push("a shown component is offered as the finished result");
    }
  }

  if (expectedFormat === "real-recipe") {
    const recipes = audit?.answerRecipeKeys ?? [];
    const groups = audit?.answerGroups ?? [];
    if (recipes.length !== 4 || groups.length !== 4) issues.push("real recipe needs four complete trays");
    if (!sameMultiset(recipes[question.correctIndex], audit?.recipeComponentKeys)) {
      issues.push("correct recipe tray drifted from client recipe");
    }
    for (const [index, recipe] of recipes.entries()) {
      if (!sameMultiset(expandedPromptKeys(groups[index]), recipe)) issues.push(`recipe ${index + 1} artwork drift`);
      if (index !== question.correctIndex && multisetDifference(recipe, audit?.recipeComponentKeys) !== 2) {
        issues.push(`recipe ${index + 1} does not swap exactly one component`);
      }
    }
    if (new Set(recipes.map((recipe) => [...recipe].sort().join("+"))).size !== 4) {
      issues.push("duplicate recipe tray");
    }
  }

  if (expectedFormat === "shared-part") {
    const recipes = audit?.targetRecipeKeys ?? [];
    const shared = recipes.length === 2 ? [...new Set(recipes[0].filter((key) => recipes[1].includes(key)))] : [];
    if (audit?.promptItems?.length !== 2 || audit?.targetItemKeys?.length !== 2)
      issues.push("shared part needs two items");
    if (shared.length !== 1 || shared[0] !== audit?.sharedComponentKey) issues.push("shared component is ambiguous");
    if (audit?.answerItemKeys?.[question.correctIndex] !== audit?.sharedComponentKey) {
      issues.push("wrong shared component marked correct");
    }
    const recipeUnion = new Set(recipes.flat());
    if ((audit?.answerItemKeys ?? []).some((key) => !recipeUnion.has(key))) {
      issues.push("shared-part distractor is absent from both recipes");
    }
    if ((audit?.answerItemKeys ?? []).some((key, index) => index !== question.correctIndex && shared.includes(key))) {
      issues.push("shared component appears more than once");
    }
  }

  if (expectedFormat === "upgrade-path") {
    const sourceKey = audit?.sourceItemKey;
    const correctRecipe = audit?.answerRecipeKeys?.[question.correctIndex] ?? [];
    if (audit?.promptItems?.length !== 1 || audit.promptItems[0]?.key !== sourceKey)
      issues.push("upgrade source artwork drift");
    if (audit?.answerItemKeys?.[question.correctIndex] !== audit?.targetItemKey)
      issues.push("wrong upgrade marked correct");
    if (!correctRecipe.includes(sourceKey)) issues.push("upgrade is not a direct recipe path");
    for (const [index, ingredients] of (audit?.answerIngredientKeys ?? []).entries()) {
      const containsSource = ingredients.includes(sourceKey);
      if (containsSource !== (index === question.correctIndex)) issues.push(`upgrade option ${index + 1} is ambiguous`);
    }
    const answerCosts = audit?.answerCosts ?? [];
    const correctCost = answerCosts[question.correctIndex];
    if (
      answerCosts.length !== 4 ||
      !Number.isFinite(correctCost) ||
      answerCosts.some((cost) => !Number.isFinite(cost) || cost / correctCost < 0.72 || cost / correctCost > 1.4)
    ) {
      issues.push("upgrade choices are not cost peers");
    }
  }

  if (expectedFormat !== "real-recipe") {
    if (audit?.answerItemKeys?.length !== 4 || new Set(audit.answerItemKeys).size !== 4) {
      issues.push("answer item keys are missing or duplicated");
    }
    if (question.answerImages?.length !== 4) issues.push("answer item artwork is missing");
  }

  return [...new Set(issues)];
}

export function isPlayableShopkeeperQuestion(question) {
  return shopkeeperQuestionIssues(question).length === 0;
}
