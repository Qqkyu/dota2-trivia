import { describe, expect, it } from "vitest";
import { formatMessage, formatNumber } from "../src/i18n/format.mjs";
import { localeFromAcceptLanguage, resolveLocale } from "../src/i18n/locales.mjs";

describe("language choice", () => {
  it("takes the browser's first language that the site has", () => {
    expect(localeFromAcceptLanguage("ru-RU,ru;q=0.9,en;q=0.8")).toBe("ru");
    expect(localeFromAcceptLanguage("en-US,en;q=0.9,ru;q=0.8")).toBe("en");
    expect(localeFromAcceptLanguage("uk,ru;q=0.9,en;q=0.8")).toBe("ru");
    expect(localeFromAcceptLanguage("pl,en;q=0.8")).toBe("en");
    expect(localeFromAcceptLanguage("en;q=0.5,ru;q=0.9")).toBe("ru");
    expect(localeFromAcceptLanguage("ru;q=0,en")).toBe("en");
    expect(localeFromAcceptLanguage("")).toBe("en");
    expect(localeFromAcceptLanguage(null)).toBe("en");
  });

  it("lets a chosen language win, and ignores an unknown cookie", () => {
    expect(resolveLocale("en", "ru")).toBe("en");
    expect(resolveLocale("ru", "en")).toBe("ru");
    expect(resolveLocale("xx", "ru")).toBe("ru");
  });
});

describe("messages", () => {
  it("fills slots and leaves an unknown slot visible", () => {
    expect(formatMessage("en", "{a} of {b}", { a: 1, b: 2 })).toBe("1 of 2");
    expect(formatMessage("en", "{a} of {b}", { a: 1 })).toBe("1 of {b}");
  });

  it("uses the Russian plural forms", () => {
    const rounds = { one: "{count} раунд", few: "{count} раунда", many: "{count} раундов", other: "{count} раунда" };
    expect(formatMessage("ru", rounds, { count: 1 })).toBe("1 раунд");
    expect(formatMessage("ru", rounds, { count: 3 })).toBe("3 раунда");
    expect(formatMessage("ru", rounds, { count: 5 })).toBe("5 раундов");
    expect(formatMessage("ru", rounds, { count: 21 })).toBe("21 раунд");
    expect(formatMessage("en", { one: "{count} round", other: "{count} rounds" }, { count: 2 })).toBe("2 rounds");
  });

  it("writes numbers the way each language does", () => {
    expect(formatNumber("en", 1234)).toBe("1,234");
    expect(formatNumber("ru", 1234).replace(/\s/g, " ")).toBe("1 234");
  });
});
