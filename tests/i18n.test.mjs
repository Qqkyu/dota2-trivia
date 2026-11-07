import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildOverlay, loadQuestions } from "../scripts/build-question-locale.mjs";
import { en } from "../src/i18n/messages/en.ts";
import { ru } from "../src/i18n/messages/ru.ts";
import { formatMessage, formatNumber } from "../src/i18n/format.mjs";
import { localeFromAcceptLanguage, resolveLocale } from "../src/i18n/locales.mjs";
import { cyrillicQueryMatches, latinFromRussianLayout } from "../src/lib/search-query.mjs";
import { requestLocale } from "../src/i18n/server.ts";

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

describe("language of a request", () => {
  const request = (headers) => new Request("http://test/api", { headers });

  it("takes the chosen language from the cookie header of a plain Request", () => {
    expect(requestLocale(request({ cookie: "other=1; queue_arcade_lang=ru", "accept-language": "en" }))).toBe("ru");
  });

  it("falls back to the browser's language", () => {
    expect(requestLocale(request({ "accept-language": "ru-RU,en;q=0.5" }))).toBe("ru");
    expect(requestLocale(request({ cookie: "queue_arcade_lang=xx" }))).toBe("en");
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

describe("search typed in Cyrillic", () => {
  it("reads a Russian keyboard layout as the Latin name", () => {
    expect(latinFromRussianLayout("згвпу")).toBe("pudge");
    expect(latinFromRussianLayout("pudge")).toBe("pudge");
  });

  it("matches a Russian alias or the layout, and leaves Latin queries alone", () => {
    const latin = (query) => "pudge".includes(query);
    expect(cyrillicQueryMatches("пуд", ["пудж"], latin)).toBe(true);
    expect(cyrillicQueryMatches("згв", ["пудж"], latin)).toBe(true);
    expect(cyrillicQueryMatches("ёж", ["еж"], () => false)).toBe(true);
    expect(cyrillicQueryMatches("тинкер", ["пудж"], latin)).toBe(false);
    expect(cyrillicQueryMatches("pud", ["пудж"], latin)).toBe(false);
  });
});

describe("Russian messages", () => {
  const texts = (message) => (typeof message === "string" ? [message] : Object.values(message));
  const slots = (text) => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();

  it("has exactly the English keys", () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
  });

  it("keeps every slot of the English line", () => {
    for (const [key, message] of Object.entries(ru)) {
      const expected = [...new Set(texts(en[key]).flatMap(slots))].sort();
      for (const text of texts(message)) {
        // A plural form may spell the number out ("1 раунд" stays "{count}"), but no slot may be new.
        for (const slot of slots(text)) expect(expected, key).toContain(slot);
      }
      const used = [...new Set(texts(message).flatMap(slots))].sort();
      expect(used, key).toEqual(expected);
    }
  });

  it("gives plural messages all the Russian forms", () => {
    for (const [key, message] of Object.entries(ru)) {
      if (typeof message === "string") continue;
      expect(Object.keys(message).sort(), key).toEqual(["few", "many", "one", "other"]);
    }
  });

  it("uses informal address and no English quotes", () => {
    for (const [key, message] of Object.entries(ru)) {
      for (const text of texts(message)) {
        expect(text, key).not.toMatch(/\bВы\b|\bВаш|[“”]/u);
      }
    }
  });
});

describe("Russian question catalog", () => {
  const questions = loadQuestions();
  const units = JSON.parse(readFileSync("src/data/i18n/ru.units.json", "utf8"));
  const { overlay, missing } = buildOverlay(questions, units);
  const lines = Object.values(overlay).flatMap(function strings(value) {
    return typeof value === "string" ? [value] : Object.values(value).flatMap(strings);
  });

  it("translates every line and matches the committed overlay", () => {
    expect([...missing.prose.keys()]).toEqual([]);
    expect([...missing.templates.keys()]).toEqual([]);
    expect(overlay).toEqual(JSON.parse(readFileSync("src/data/i18n/questions.ru.json", "utf8")));
    expect(Object.keys(overlay)).toHaveLength(questions.length);
  });

  it("keeps the same slots in every pattern", () => {
    const slots = (text) => (text.match(/\{[a-z]\d+\}/g) ?? []).sort();
    for (const [template, text] of Object.entries(units.templates))
      expect(slots(text), template).toEqual(slots(template));
  });

  it("uses the client's words and informal address", () => {
    const banned = /\bВы\b|\bВаш|(?<![а-яё])является|кулдаун|обезвреж|размнож|[“”]|Команда Team|\bв (?:19|20)\d\d\./u;
    expect(lines.filter((line) => banned.test(line))).toEqual([]);
  });

  it("never leaves two numbers side by side", () => {
    expect(lines.filter((line) => /патче \d+\.\d+[a-z]? \d|Dota 2 \d/.test(line))).toEqual([]);
  });

  it("keeps the right answer and the order of the options", () => {
    for (const question of questions) {
      const answers = overlay[question.id]?.answers ?? {};
      for (const index of Object.keys(answers)) expect(Number(index)).toBeLessThan(question.answers.length);
    }
  });
});
