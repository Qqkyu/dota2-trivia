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

function termPattern(term, allowPlural = false) {
  const simplePlural = allowPlural && !term.toLowerCase().endsWith("s") ? "s?" : "";
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}${simplePlural}(?:['’]s?)?(?![\\p{L}\\p{N}])`, "giu");
}

export function containsAnswerLeak(text, answer) {
  return answerLeakTerms(answer).some((term) => termPattern(term, term === answer).test(text));
}

export function buildSpellHint(description, ownerName, abilityName, { redactAbility = true } = {}) {
  let hint = String(description ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s*DISPEL TYPE:.*$/i, "")
    .trim();

  if (!hint) return GENERIC_HINT;

  if (redactAbility) hint = hint.replace(termPattern(abilityName, true), "this ability");

  for (const term of answerLeakTerms(ownerName)) {
    hint = hint.replace(termPattern(term, term === ownerName), (match) => {
      if (/['’]s?$/i.test(match)) return "the caster's";
      if (!term.toLowerCase().endsWith("s") && match.toLowerCase().endsWith("s")) {
        return "copies of the caster";
      }
      return "the caster";
    });
  }

  hint = hint.split(/(?<=[.!?])\s+/)[0]?.trim() ?? "";
  hint = hint
    .replace(/\b(?:a|an|the) this ability\b/gi, "this ability")
    .replace(/\b(?:a|an|the) the caster\b/gi, "the caster")
    .replace(/\banother the caster\b/gi, "another copy")
    .replace(/\bcreates this ability over\b/gi, "creates an effect over")
    .replace(/\bSummons this ability of\b/gi, "Summons a mass of")
    .replace(/\bthe caster this ability the body\b/gi, "the caster enters the body")
    .replace(/^Primary the caster\b/i, "The primary hero")
    .replace(/\bthe caster gain\b/gi, "the caster gains")
    .replace(/\bthe caster trigger\b/gi, "the caster triggers")
    .replace(/\s+/g, " ")
    .replace(/^[a-z]/, (letter) => letter.toUpperCase());

  const words = hint.split(/\s+/);
  if (hint.length > 145 || words.length > 22) {
    let shortened = words.slice(0, 22).join(" ").slice(0, 142);
    const clauseEnd = shortened.lastIndexOf(",");
    if (clauseEnd >= 55) shortened = shortened.slice(0, clauseEnd);
    else shortened = shortened.slice(0, shortened.lastIndexOf(" "));
    hint = `${shortened.replace(/[,:;]+$/, "")}…`;
  }

  return hint && !containsAnswerLeak(hint, ownerName) ? hint : GENERIC_HINT;
}
