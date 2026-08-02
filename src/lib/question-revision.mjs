import { createHash } from "node:crypto";

const NON_PLAYABLE_FIELDS = new Set([
  "audit",
  "category",
  "clientBuild",
  "difficulty",
  "explanation",
  "game",
  "patch",
  "reviewedAt",
  "source",
  "varietyKey",
]);

const PLAYABLE_PRESENTATION_REVISIONS = Object.freeze({
  "fogged-hero": "fog-veteran-curve-1",
  "shopkeeper-real-recipe": "real-recipe-builder-1",
  "shopkeeper-upgrade-path": "open-shop-1",
});

/** @param {{ kind?: string } | null | undefined} question */
export function questionPresentationRevision(question) {
  return PLAYABLE_PRESENTATION_REVISIONS[question?.kind] ?? null;
}

/** @param {unknown} value */
function stablePlayableValue(value) {
  if (Array.isArray(value)) return value.map(stablePlayableValue);
  if (typeof value === "string" && /^https:\/\/cdn(?:\.cloudflare)?\.steamstatic\.com\//.test(value)) {
    try {
      const url = new URL(value);
      url.searchParams.delete("t");
      return url.toString();
    } catch {
      return value;
    }
  }
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, entry]) => !NON_PLAYABLE_FIELDS.has(key) && entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stablePlayableValue(entry)]),
  );
}

/**
 * Stable identity for the part of a question a player can actually experience.
 * Release labels, audits, explanations, and seed difficulty may change without
 * throwing away useful answer history. A changed prompt, option, asset, clue,
 * or marked answer produces a fresh calibration revision.
 *
 * @param {object} question
 */
export function questionCalibrationRevision(question) {
  const playableValue = stablePlayableValue(question);
  const presentationRevision = questionPresentationRevision(question);
  const serialized = JSON.stringify(presentationRevision ? { ...playableValue, presentationRevision } : playableValue);
  const digest = createHash("sha256").update(serialized).digest("base64url").slice(0, 22);
  return `q1_${digest}`;
}
