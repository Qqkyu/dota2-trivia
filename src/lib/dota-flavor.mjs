export function accuracyRate(correct, answered) {
  if (!answered) return 0;
  return Math.round((correct / answered) * 100);
}

/**
 * Live reveal line. First Blood is the session's first correct; then the kill-streak announcer.
 * The result is a stable id for logic and `data-callout`. `revealCalloutKey` gives the text a player reads.
 */
export function revealCallout({ correct, timedOut, firstBlood, streak }) {
  if (timedOut) return "Time expired";
  if (!correct) return "Incorrect";
  if (firstBlood) return "First Blood";
  if (streak >= 10) return "Beyond Godlike";
  if (streak >= 9) return "Godlike";
  if (streak >= 8) return "Monster Kill";
  if (streak >= 7) return "Wicked Sick";
  if (streak >= 6) return "Unstoppable";
  if (streak >= 5) return "Mega Kill";
  if (streak >= 4) return "Dominating";
  if (streak >= 3) return "Killing Spree";
  return "Correct";
}

const REVEAL_CALLOUT_KEYS = Object.freeze({
  "Time expired": "round.callout.timeExpired",
  Incorrect: "round.callout.incorrect",
  Correct: "round.callout.correct",
});

/**
 * The text of a result callout. Kill-streak ids have no text of their own: they read as the banner.
 *
 * @param {string} callout
 * @returns {import("../i18n/types").MessageKey}
 */
export function revealCalloutKey(callout) {
  return REVEAL_CALLOUT_KEYS[callout];
}

const STREAK_BANNER_KEYS = Object.freeze({
  "First Blood": "round.streak.firstBlood",
  "Killing Spree": "round.streak.killingSpree",
  Dominating: "round.streak.dominating",
  "Mega Kill": "round.streak.megaKill",
  Unstoppable: "round.streak.unstoppable",
  "Wicked Sick": "round.streak.wickedSick",
  "Monster Kill": "round.streak.monsterKill",
  Godlike: "round.streak.godlike",
  "Beyond Godlike": "round.streak.beyondGodlike",
});

/**
 * Kill-feed sentence from dota_english.txt, with the colored phrase split out.
 *
 * @param {string} callout
 * @param {unknown} playerName
 * @param {import("../i18n/translator").Translate} t
 */
export function streakBannerParts(callout, playerName, t) {
  const name = typeof playerName === "string" ? playerName.trim() : "";
  const key = STREAK_BANNER_KEYS[callout];
  if (!key) return { before: "", accent: callout, after: "" };

  // The name goes in after the cut, because a Steam name can hold any text.
  const [before = "", after = ""] = t(`${key}.${name ? "named" : "you"}`).split("{accent}");
  const withName = (part) => part.replace("{name}", () => name);
  return { before: withName(before), accent: t(`${key}.accent`), after: withName(after) };
}
