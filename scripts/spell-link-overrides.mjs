import { readFile } from "node:fs/promises";
import { buildSpellHint } from "./spell-hints.mjs";

export const SPELL_LINK_OVERRIDES_URL = new URL("../src/data/spell-link-overrides.json", import.meta.url);

function assertReviewedPatch(overrides, patch) {
  if (!patch || overrides.patch !== patch) {
    throw new Error(
      `Spell Link descriptions were reviewed for ${overrides.patch}. Review spell-link-overrides.json before generating ${patch ?? "an unspecified patch"}.`,
    );
  }
}

/** Load reviewed descriptions. A new patch requires a fresh content review. */
export async function loadSpellLinkOverrides(patch) {
  const overrides = JSON.parse(await readFile(SPELL_LINK_OVERRIDES_URL, "utf8"));
  assertReviewedPatch(overrides, patch);
  return overrides;
}

/**
 * Apply after question selection. Upstream text does not replace reviewed wording.
 * Keep the question ID, selected ability, answers, and artwork unchanged.
 */
export function applySpellLinkOverride(question, overrides, patch = question.patch) {
  if (question.kind !== "spell-owner") return question;
  assertReviewedPatch(overrides, patch);
  if (question.patch) assertReviewedPatch(overrides, question.patch);
  const reviewed = overrides.records[question.id];
  if (!reviewed) return question;
  const heroName = question.answers[question.correctIndex];
  if (question.eyebrow !== reviewed.abilityName || heroName !== reviewed.heroName) {
    throw new Error(`${question.id}: the ability or hero no longer matches its reviewed Spell Link description.`);
  }
  if (!reviewed.description?.trim() || !reviewed.source?.url || !reviewed.reviewedAt) {
    throw new Error(`${question.id}: the reviewed Spell Link description needs text, a source, and a review date.`);
  }
  return {
    ...question,
    explanation: `${reviewed.abilityName} belongs to ${reviewed.heroName}. ${reviewed.description}`,
    hint: buildSpellHint(reviewed.description, reviewed.heroName, reviewed.abilityName, { fullDescription: true }),
    source: { ...reviewed.source },
  };
}
