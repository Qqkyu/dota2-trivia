const GENERIC_HINT = "No additional mechanical clue is available for this ability.";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function answerLeakTerms(answer) {
  const words = answer.match(/\p{L}+/gu) ?? [];
  return [...new Set([answer, ...words.filter((word) => word.length >= 4)])].sort(
    (left, right) => right.length - left.length,
  );
}

function termPattern(term) {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?:['’]s)?(?![\\p{L}\\p{N}])`, "giu");
}

export function containsAnswerLeak(text, answer) {
  return answerLeakTerms(answer).some((term) => termPattern(term).test(text));
}

export function buildSpellHint(description, ownerName, abilityName) {
  let hint = String(description ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s*DISPEL TYPE:.*$/i, "")
    .trim();

  if (!hint) return GENERIC_HINT;

  hint = hint.replace(termPattern(abilityName), "this ability");

  for (const term of answerLeakTerms(ownerName)) {
    hint = hint.replace(termPattern(term), (match) => (/['’]s$/i.test(match) ? "the caster's" : "the caster"));
  }

  hint = hint.split(/(?<=[.!?])\s+/)[0]?.trim() ?? "";
  hint = hint.replace(/\s+/g, " ").replace(/^[a-z]/, (letter) => letter.toUpperCase());

  if (hint.length > 170) {
    const shortened = hint.slice(0, 167);
    hint = `${shortened.slice(0, shortened.lastIndexOf(" "))}…`;
  }

  return hint && !containsAnswerLeak(hint, ownerName) ? hint : GENERIC_HINT;
}
