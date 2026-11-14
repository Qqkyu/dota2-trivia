// Proper titles used by the existing Flashback deck and site UI stay in English.
const PROPER_TITLES = [
  "Heroes of Newerth",
  "Heroes of the Storm",
  "The Dark Rift",
  "The New Journey",
  "The Greeviling",
  "The Outlanders",
  "Wrath of the Mo'rokai",
  "The International",
  "The Underhollow",
  "The Play",
  "Queue Arcade",
  "Dota 2",
];

/** Ignore whole proper names, but still check the instructions around them. */
export function createRussianCopyInspector(names) {
  const escapedNames = [...names, ...PROPER_TITLES]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const namePattern = new RegExp(
    escapedNames.length ? String.raw`(?<![\p{L}\p{N}_])(?:${escapedNames.join("|")})(?![\p{L}\p{N}_])` : "(?!)",
    "giu",
  );
  const english = /\b(?:the|and|with|which|what|this|that|your|from|before|after|hero|heroes|item|round|answer)\b/i;
  return (text) =>
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => {
        const rest = line.replace(namePattern, " ");
        return english.test(rest) && !/[а-яё]{3}/i.test(rest);
      });
}
