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

/** Numbers as the language writes them: 1 234 in Russian, 1,234 in English. */
export function formatNumber(locale, value) {
  return new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US").format(value);
}
