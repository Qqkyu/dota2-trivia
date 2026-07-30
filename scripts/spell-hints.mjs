const GENERIC_HINT = "No additional mechanical clue is available for this ability.";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function answerLeakTerms(answer) {
  const words = answer.match(/\p{L}+/gu) ?? [];
  const collapsed = words.length > 1 ? words.join("") : "";
  return [...new Set([answer, collapsed, ...words.filter((word) => word.length >= 4)].filter(Boolean))].sort(
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

export function containsFullNameLeak(text, name) {
  const words = name.match(/\p{L}+/gu) ?? [];
  const collapsed = words.length > 1 ? words.join("") : "";
  return [name, collapsed].filter(Boolean).some((term) => termPattern(term).test(text));
}

export function buildSpellHint(
  description,
  ownerName,
  abilityName,
  { redactAbility = true, maxWords = 22, maxCharacters = 145 } = {},
) {
  let hint = String(description ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s*DISPEL TYPE:.*$/i, "")
    .trim();

  if (!hint) return GENERIC_HINT;

  if (redactAbility) hint = hint.replace(termPattern(abilityName), "this ability");

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
    .replace(/\b(?:a|an|the)(?:\s+[\p{L}-]+){1,2}\s+this ability\b/giu, "this ability")
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
  if (hint.length > maxCharacters || words.length > maxWords) {
    let shortened = words
      .slice(0, maxWords)
      .join(" ")
      .slice(0, Math.max(1, maxCharacters - 3));
    const clauseEnd = shortened.lastIndexOf(",");
    if (clauseEnd >= 55) shortened = shortened.slice(0, clauseEnd);
    else shortened = shortened.slice(0, shortened.lastIndexOf(" "));
    hint = `${shortened.replace(/[,:;]+$/, "")}…`;
  }

  return hint && !containsAnswerLeak(hint, ownerName) ? hint : GENERIC_HINT;
}
