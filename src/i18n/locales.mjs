export const LOCALES = Object.freeze(["en", "ru"]);
export const DEFAULT_LOCALE = "en";
/** A language the player chose. Kept for a year; it holds nothing but the language code. */
export const LOCALE_COOKIE = "queue_arcade_lang";
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** @param {unknown} value */
export function isLocale(value) {
  return typeof value === "string" && LOCALES.includes(value);
}

/**
 * The first language in Accept-Language that the site has, in the browser's order.
 *
 * @param {string | null | undefined} header
 */
export function localeFromAcceptLanguage(header) {
  if (typeof header !== "string") return DEFAULT_LOCALE;
  const ranked = header
    .slice(0, 400)
    .split(",")
    .map((part, index) => {
      const [tag, ...parameters] = part.trim().split(";");
      const quality = parameters.map((entry) => /^\s*q=([\d.]+)\s*$/.exec(entry)?.[1]).find(Boolean);
      return { language: tag.trim().toLowerCase().split("-")[0], quality: quality ? Number(quality) : 1, index };
    })
    .filter((entry) => entry.quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index);
  return ranked.find((entry) => isLocale(entry.language))?.language ?? DEFAULT_LOCALE;
}

/**
 * A chosen language wins over the browser's.
 *
 * @param {string | null | undefined} cookieValue
 * @param {string | null | undefined} acceptLanguage
 */
export function resolveLocale(cookieValue, acceptLanguage) {
  return isLocale(cookieValue) ? cookieValue : localeFromAcceptLanguage(acceptLanguage);
}
