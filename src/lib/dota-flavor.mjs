export function accuracyRate(correct, answered) {
  if (!answered) return 0;
  return Math.round((correct / answered) * 100);
}

/** Live reveal line. First Blood is the session's first correct; then the kill-streak announcer. */
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

/** Kill-feed sentence from dota_english.txt, with the colored phrase split out. */
export function streakBannerParts(callout, playerName) {
  const name = typeof playerName === "string" ? playerName.trim() : "";
  const subject = name || "You";
  const be = name ? "is" : "are";

  switch (callout) {
    case "First Blood":
      return { before: `${subject} drew `, accent: "first blood", after: "" };
    case "Killing Spree":
      return { before: `${subject} ${be} on a `, accent: "killing spree", after: "" };
    case "Dominating":
      return { before: `${subject} ${be} `, accent: "dominating", after: "" };
    case "Mega Kill":
      return { before: `${subject} ${be} on a `, accent: "mega kill", after: " streak" };
    case "Unstoppable":
      return { before: `${subject} ${be} `, accent: "unstoppable", after: "" };
    case "Wicked Sick":
      return { before: `${subject} ${be} `, accent: "wicked sick", after: "" };
    case "Monster Kill":
      return { before: `${subject} ${be} on a `, accent: "monster kill", after: " streak" };
    case "Godlike":
      return { before: `${subject} ${be} `, accent: "GODLIKE", after: "" };
    case "Beyond Godlike":
      return { before: `${subject} ${be} beyond `, accent: "GODLIKE, someone kill them!!", after: "" };
    default:
      return { before: "", accent: callout, after: "" };
  }
}
