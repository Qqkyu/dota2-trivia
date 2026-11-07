const RUSSIAN_LAYOUT = "йцукенгшщзхъфывапролджэячсмитьбю";
const LATIN_LAYOUT = "qwertyuiop[]asdfghjkl;'zxcvbnm,.";
const LATIN_KEY = new Map([...RUSSIAN_LAYOUT].map((letter, index) => [letter, LATIN_LAYOUT[index]]));

/** "згвпу" typed on a Russian layout is "pudge". */
export function latinFromRussianLayout(text) {
  return [...text].map((letter) => LATIN_KEY.get(letter) ?? letter).join("");
}

export const hasCyrillic = (text) => /[а-яё]/.test(text);

/** Cyrillic letters that differ only by ё must still match. */
export const foldCyrillic = (text) => text.replaceAll("ё", "е");

/**
 * Does a search typed in Cyrillic reach this entry? Either the letters are real Russian
 * spelling (an alias), or the keyboard was on the Russian layout (the Latin name).
 *
 * @param {string} query lowercase and trimmed
 * @param {readonly string[] | undefined} aliases
 * @param {(latinQuery: string) => boolean} matchesLatin
 */
export function cyrillicQueryMatches(query, aliases, matchesLatin) {
  if (!hasCyrillic(query)) return false;
  const folded = foldCyrillic(query);
  return (
    Boolean(aliases?.some((alias) => foldCyrillic(alias).startsWith(folded))) ||
    matchesLatin(latinFromRussianLayout(query))
  );
}
