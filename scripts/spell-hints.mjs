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

/**
 * An ability name also leaks through its inflections: "Nightmared targets",
 * "the distance glimpsed", "once burrowed", "two doppelgangers". Match the
 * bare name plus a short verb/plural suffix so all of them get redacted.
 */
function abilityPattern(abilityName) {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])(${escapeRegExp(abilityName)})(s|ed|d|ing)?(?:['’]s?)?(?![\\p{L}\\p{N}])`,
    "giu",
  );
}

export function containsAbilityLeak(text, abilityName) {
  return abilityPattern(abilityName).test(text);
}

/** Keep whole sentences while the clue stays readable on a 15-second clock. */
export function trimToSentenceBudget(text, maxWords) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = [];
  let used = 0;
  for (const sentence of sentences) {
    const count = sentence.split(/\s+/).filter(Boolean).length;
    if (kept.length && used + count > maxWords) break;
    kept.push(sentence);
    used += count;
  }
  return kept.join(" ");
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
  { redactAbility = true, fullDescription = false, maxWords = 22, maxCharacters = 145, fullMaxWords = 60 } = {},
) {
  let hint = String(description ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s*DISPEL TYPE:.*$/i, "")
    .trim();

  if (!hint) return GENERIC_HINT;

  if (redactAbility) {
    hint = hint.replace(abilityPattern(abilityName), (match, name, suffix = "") => {
      const lower = String(suffix).toLowerCase();
      if (lower === "s") return "copies";
      if (lower === "ed" || lower === "d") return "affected";
      if (lower === "ing") return "using this ability";
      return "this ability";
    });
  }

  for (const term of answerLeakTerms(ownerName)) {
    hint = hint.replace(termPattern(term, term === ownerName), (match) => {
      if (/['’]s?$/i.test(match)) return "the caster's";
      if (!term.toLowerCase().endsWith("s") && match.toLowerCase().endsWith("s")) {
        return "copies of the caster";
      }
      return "the caster";
    });
  }

  if (!fullDescription) hint = hint.split(/(?<=[.!?])\s+/)[0]?.trim() ?? "";
  else hint = trimToSentenceBudget(hint, fullMaxWords);
  hint = hint
    .replace(/\b(?:a|an|the) this ability\b/gi, "this ability")
    .replace(/\b(?:a|an|the) the caster\b/gi, "the caster")
    .replace(/\banother the caster\b/gi, "another copy")
    .replace(/\bcreates this ability over\b/gi, "creates an effect over")
    .replace(/\bSummons this ability of\b/gi, "Summons a mass of")
    .replace(/\bthe caster this ability the body\b/gi, "the caster enters the body")
    .replace(/\bUsing Activate this ability\b/gi, "Using its activation sub-ability")
    .replace(/\bActive this ability instances\b/gi, "Active instances of this ability")
    .replace(
      /\bthis ability deals damage per second in an area around this ability is active\b/gi,
      "this ability deals damage per second around the caster while active",
    )
    .replace(/\bwill this ability to\b/gi, "will teleport to")
    .replace(/\bthe caster stomp\b/gi, "the caster's stomp")
    .replace(/^Primary the caster\b/i, "The primary hero")
    .replace(/\bthe caster gain\b/gi, "the caster gains")
    .replace(/\bthe caster trigger\b/gi, "the caster triggers")
    .replace(/\s+/g, " ")
    .replace(
      /(^|[.!?]\s+)(the caster|this ability)\b/gi,
      (_, lead, subject) => `${lead}${subject[0].toUpperCase()}${subject.slice(1)}`,
    )
    .replace(/^[a-z]/, (letter) => letter.toUpperCase());

  const words = hint.split(/\s+/);
  if (!fullDescription && (hint.length > maxCharacters || words.length > maxWords)) {
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
