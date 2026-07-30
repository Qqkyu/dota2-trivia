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

export function shopkeeperQuestionIssues(question) {
  if (question?.kind !== "recipe-component") return [];

  const issues = [];
  const correctAnswer = question.answers?.[question.correctIndex] ?? "";
  const audit = question.shopkeeper;

  if (/\brecipe\b/i.test(correctAnswer)) issues.push("recipe-name answer");
  if (itemNamesOverlap(question.eyebrow, correctAnswer)) issues.push("target/answer name overlap");
  if (!audit || audit.recipeComponentKeys?.length < 2) issues.push("one-part recipe");

  const answerCosts = audit?.answerCosts ?? [];
  const correctCost = answerCosts[question.correctIndex];
  if (
    answerCosts.length !== 4 ||
    !Number.isFinite(correctCost) ||
    correctCost <= 0 ||
    answerCosts.some(
      (cost) => !Number.isFinite(cost) || cost <= 0 || cost / correctCost < 0.74 || cost / correctCost > 1.36,
    )
  ) {
    issues.push("unbalanced component prices");
  }

  return issues;
}

export function isPlayableShopkeeperQuestion(question) {
  return shopkeeperQuestionIssues(question).length === 0;
}
