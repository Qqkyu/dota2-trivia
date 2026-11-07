const pluralRules = new Map();

function pluralCategory(locale, count) {
  if (!pluralRules.has(locale)) pluralRules.set(locale, new Intl.PluralRules(locale));
  return pluralRules.get(locale).select(count);
}

/**
 * Text for one message. A message is a string with `{name}` slots, or an object of plural
 * forms (`one`, `few`, `many`, `other`) chosen by `vars.count`.
 *
 * @param {string} locale
 * @param {string | Record<string, string>} message
 * @param {Record<string, string | number>} [vars]
 */
export function formatMessage(locale, message, vars = {}) {
  const template =
    typeof message === "string"
      ? message
      : (message[pluralCategory(locale, Number(vars.count ?? 0))] ?? message.other ?? "");
  return template.replace(/\{(\w+)\}/g, (slot, name) => (name in vars ? String(vars[name]) : slot));
}

/**
 * Cuts a message at its `[marked]` words, so a sentence with an inline element stays one message
 * and a translation can move the marked words.
 *
 * @param {string} text
 */
export function splitAccent(text) {
  const start = text.indexOf("[");
  const end = text.indexOf("]", start);
  if (start < 0 || end < 0) return { before: text, accent: "", after: "" };
  return { before: text.slice(0, start), accent: text.slice(start + 1, end), after: text.slice(end + 1) };
}

/** Numbers as the language writes them: 1 234 in Russian, 1,234 in English. */
export function formatNumber(locale, value) {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US").format(value);
}
