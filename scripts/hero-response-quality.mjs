function responseWords(value) {
  return (
    String(value ?? "")
      .toLocaleLowerCase("en-US")
      .match(/[a-z]+(?:['’-][a-z]+)*/g) ?? []
  );
}

function isVocalization(word) {
  return /^(?:h[aeo]{2,}h*|(?:ha|he|ho){2,}h*|h[aeo]h+|a+h+|a+gh+|u+gh+|u+h+|h+m+|gr+r+|a+w{2,})$/i.test(word);
}

// Rejected in the 2026-10-06 source and audio reviews. Audio reasons include
// unusable opening cuts and a large full-clip loudness outlier.
const REJECTED_RESPONSES = Object.freeze({
  quote: Object.freeze({
    lich_kill_06: "Disruptor also speaks this exact line.",
    snip_kill_12: "Only repeated laughter.",
    tech_firstblood_03: "Near-duplicate of the retained first-blood exchange.",
  }),
  echo: Object.freeze({
    timb_attack_03: "Only one repeated word.",
    jak_kill_06: "The first 240 ms has -88.78 dB RMS and no usable opening clue.",
    appa_kill_06: "The first 240 ms has -77.68 dB RMS and no usable opening clue.",
    troll_kill_06: "The full clip is 13.18 LUFS below the reviewed catalog median.",
  }),
});

export function responseSelectionAllowed(response, purpose) {
  const exclusions = REJECTED_RESPONSES[purpose];
  if (!exclusions || !response?.name || Object.hasOwn(exclusions, response.name)) return false;
  // Keep the measured replacement on future syncs. If its source disappears,
  // generation must fail the normal per-hero coverage check instead of using
  // an unreviewed alternative. Text quotes retain their existing selection.
  if (purpose === "echo" && (response.hero_id === 95 || response.heroKey === "npc_dota_hero_troll_warlord")) {
    return response.name === "troll_respawn_10";
  }
  return true;
}

/** Count spoken words, not repeated laugh syllables or one repeated word. */
export function isSubstantialResponseText(value, minimumCharacters, minimumWords) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const words = responseWords(text).filter((word) => !isVocalization(word));
  return (
    text.length >= minimumCharacters &&
    text.length <= 110 &&
    words.length >= minimumWords &&
    new Set(words).size >= 3 &&
    !/[<>{}]/.test(text)
  );
}

/** Ignore small transcript variants when selecting another clue for one hero. */
export function responseTextsAreNearDuplicates(left, right) {
  const normalize = (value) =>
    responseWords(value)
      .filter((word) => !isVocalization(word))
      .join(" ");
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  const limit = Math.floor(Math.max(a.length, b.length) * 0.15);
  if (Math.abs(a.length - b.length) > limit) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length] <= limit;
}

function normalizedText(value) {
  return String(value ?? "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Index every downloaded response, including responses not selected for play. */
export function buildResponseTextOwners(responses) {
  const owners = new Map();
  for (const response of responses) {
    if (!Number.isInteger(response.hero_id) || response.hero_id <= 0) continue;
    const text = normalizedText(response.text || response.text_simple);
    if (!text) continue;
    if (!owners.has(text)) owners.set(text, new Set());
    owners.get(text).add(response.hero_id);
  }
  return owners;
}

export function quoteResponseIsUnambiguous(response, owners) {
  const matchingHeroes = owners.get(normalizedText(response.text || response.text_simple));
  return matchingHeroes?.size === 1 && matchingHeroes.has(response.hero_id);
}
