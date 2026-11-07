/**
 * Builds the Russian text of the question catalog.
 *
 * The catalog repeats a few sentence patterns with different names and numbers, so
 * `src/data/i18n/ru.units.json` stores one translation per pattern (`templates`) and one per
 * hand-written line (`prose`). This script applies them and writes
 * `src/data/i18n/questions.ru.json`, a sparse overlay keyed by question ID.
 *
 *   node scripts/build-question-locale.mjs            build; fails on a missing unit
 *   node scripts/build-question-locale.mjs --check    fail if the overlay is out of date
 *   node scripts/build-question-locale.mjs --missing=<file>  list the units still to translate
 *
 * After a data sync, `--missing` lists only the lines that are new.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const UNITS_PATH = "src/data/i18n/ru.units.json";
const OVERLAY_PATH = "src/data/i18n/questions.ru.json";
const CATALOGS = [
  "questions.generated",
  "flashback-questions",
  "aghanim-questions",
  "shopkeeper-questions",
  "soundcheck-questions",
  "value-order-questions",
];

const argument = (name) => process.argv.find((entry) => entry.startsWith(`--${name}=`))?.split("=")[1];
const flag = (name) => process.argv.includes(`--${name}`);
const read = (path) => JSON.parse(readFileSync(path, "utf8"));

export function loadQuestions() {
  return CATALOGS.flatMap((name) => {
    const data = read(`src/data/${name}.json`);
    return Array.isArray(data) ? data : data.questions;
  });
}

/** Names stay in English in the Russian client, so they are slots, never translated. */
export function catalogNames(questions, known = []) {
  const names = new Set(known);
  const add = (value) => {
    if (typeof value === "string" && value.length > 1) names.add(value);
  };
  for (const hero of read("src/data/hero-picker.json").groups.flatMap((group) => group.heroes)) add(hero.name);
  for (const item of read("src/data/shopkeeper-catalog.json").groups.flatMap((group) => group.items)) add(item.name);
  for (const question of questions) {
    add(question.aghanim?.abilityName);
    for (const card of question.valueOrder?.cards ?? []) add(card.name);
    for (const item of question.shopkeeper?.promptItems ?? []) add(item.name);
    for (const group of question.shopkeeper?.answerGroups ?? []) for (const item of group) add(item.name);
    for (const reference of question.source?.references ?? []) add(reference.label);
    if (["spell-owner", "mana-cost", "cooldown", "ability-damage"].includes(question.kind)) {
      for (const part of question.eyebrow.split(" · ")) add(part);
    }
  }
  return [...names]
    .filter((name) => /\p{L}{2}/u.test(name) && name !== "Duel" && !/\d{4}|Valve|patch/i.test(name))
    .sort((a, b) => b.length - a.length);
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function nameMatcher(names) {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}]|,\\d)`, "gu");
}

// A patch number ("7.41f", "patch 7.33") and a year stay as written.
const NUMBER = /(?<![\p{L}\d.,])(?<!patch )(?<!Patch )\d[\d,.]*(?<![.,])(?=[sg]\b|[^\p{L}\d]|$)/gu;

/** 1,234.5 in English is 1 234,5 in Russian. */
function russianNumber(value) {
  if (/^(?:19|20)\d\d$/.test(value)) return value;
  return value.replace(/,/g, " ").replace(/\./g, ",");
}

const QUOTED = /“([^”]+)”/g;

/** One line as a pattern: quoted lines, longer known lines, names and numbers become slots. */
export function slotify(text, { matcher, longLines }) {
  const slots = {};
  let index = 0;
  const slot = (value, kind) => {
    const name = `${kind}${index++}`;
    slots[name] = value;
    return `{${name}}`;
  };
  let template = text.replace(QUOTED, (_, inner) => `“${slot(inner, "q")}”`);
  for (const line of longLines) {
    if (template.includes(line)) template = template.split(line).join(slot(line, "p"));
  }
  const protect = template.split(/(\{[a-z]\d+\})/);
  template = protect
    .map((part, position) => {
      if (position % 2 === 1) return part;
      return part.replace(matcher, (name) => slot(name, "n")).replace(NUMBER, (value) => slot(value, "x"));
    })
    .join("");
  return { template, slots };
}

const onlySlots = (template) => template.replace(/\{[a-z]\d+\}/g, "").replace(/[\s·/,:()→+-]/g, "") === "";

function fieldsOf(question) {
  const prose = question.kind.startsWith("flashback");
  const fields = [];
  const push = (path, text, isProse = prose) => {
    if (typeof text === "string" && text.trim()) fields.push({ path, text, prose: isProse });
  };
  push("eyebrow", question.eyebrow);
  push("prompt", question.prompt);
  push("explanation", question.explanation, prose);
  push("hint", question.hint, true);
  push("detail", question.detail, ["hero-quote", "hero-voice"].includes(question.kind));
  (question.quoteHints ?? []).forEach((hint, index) => push(`quoteHints.${index}`, hint, false));
  (question.answers ?? []).forEach((answer, index) => {
    if (!/^[a-z-]+-v\d+:/.test(answer)) push(`answers.${index}`, answer);
  });
  push("image.alt", question.image?.alt);
  push("aghanim.effect", question.aghanim?.effect, true);
  for (const card of question.flashback?.cards ?? []) {
    push(`flashback.cards.${card.key}.name`, card.name);
    push(`flashback.cards.${card.key}.context`, card.context);
  }
  push("flashback.revealMedia.alt", question.flashback?.revealMedia?.alt);
  push("flashback.revealMedia.caption", question.flashback?.revealMedia?.caption);
  for (const card of question.valueOrder?.cards ?? [])
    push(`valueOrder.cards.${card.key}.context`, card.context, false);
  for (const value of question.valueOrder?.values ?? [])
    push(`valueOrder.values.${value.key}.label`, value.label, false);
  return fields;
}

function translator(units, options) {
  const missing = { prose: new Map(), templates: new Map() };
  const line = (text) => {
    const known = units.prose[text];
    if (known !== undefined) return known;
    missing.prose.set(text, (missing.prose.get(text) ?? 0) + 1);
    return null;
  };
  const translate = ({ text, prose }) => {
    if (prose) return line(text);
    if (units.prose[text] !== undefined) return units.prose[text];
    const { template, slots } = slotify(text, options);
    if (onlySlots(template)) return text.replace(NUMBER, russianNumber);
    const pattern = units.templates[template];
    if (pattern === undefined) {
      missing.templates.set(template, { count: (missing.templates.get(template)?.count ?? 0) + 1, example: text });
      for (const [name, value] of Object.entries(slots)) if (/^[qp]/.test(name)) line(value);
      return null;
    }
    let failed = false;
    const filled = pattern.replace(/\{([a-z])(\d+)\}/g, (whole, kind, number) => {
      const value = slots[`${kind}${number}`];
      if (value === undefined) throw new Error(`Unknown slot ${whole} in: ${pattern}`);
      if (kind === "n") return value;
      if (kind === "x") return russianNumber(value);
      const inner = line(value);
      if (inner === null) failed = true;
      return inner ?? value;
    });
    return failed ? null : filled;
  };
  return { translate, missing };
}

function setPath(target, path, value) {
  const parts = path.split(".");
  let node = target;
  parts.slice(0, -1).forEach((part) => {
    node[part] ??= {};
    node = node[part];
  });
  node[parts.at(-1)] = value;
}

export function buildOverlay(questions, units) {
  const names = catalogNames(questions, units.names);
  const longLines = [
    ...new Set(questions.flatMap((question) => [question.hint, question.aghanim?.effect].filter(Boolean))),
  ].sort((a, b) => b.length - a.length);
  const { translate, missing } = translator(units, { matcher: nameMatcher(names), longLines });
  const overlay = {};
  for (const question of questions) {
    const entry = {};
    for (const field of fieldsOf(question)) {
      const translated = translate(field);
      if (translated !== null && translated !== field.text) setPath(entry, field.path, translated);
    }
    if (Object.keys(entry).length) overlay[question.id] = entry;
  }
  return { overlay, missing };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const questions = loadQuestions();
  const units = existsSync(UNITS_PATH) ? read(UNITS_PATH) : { templates: {}, prose: {} };
  const { overlay, missing } = buildOverlay(questions, units);
  const missingCount = missing.prose.size + missing.templates.size;
  const listPath = argument("missing");
  if (listPath) {
    writeFileSync(
      listPath,
      `${JSON.stringify(
        {
          prose: [...missing.prose.keys()],
          templates: [...missing.templates].map(([template, { count, example }]) => ({ template, count, example })),
        },
        null,
        1,
      )}\n`,
    );
    console.log(`Listed ${missing.prose.size} lines and ${missing.templates.size} patterns in ${listPath}.`);
    process.exit(0);
  }
  if (missingCount) {
    console.error(`Missing ${missing.prose.size} lines and ${missing.templates.size} patterns. Use --missing=<file>.`);
    process.exit(1);
  }
  const text = `${JSON.stringify(overlay)}\n`;
  if (flag("check")) {
    if (!existsSync(OVERLAY_PATH) || readFileSync(OVERLAY_PATH, "utf8") !== text) {
      console.error(`${OVERLAY_PATH} is out of date. Run node scripts/build-question-locale.mjs.`);
      process.exit(1);
    }
    console.log(`Validated Russian question text for ${Object.keys(overlay).length} questions.`);
  } else {
    writeFileSync(OVERLAY_PATH, text);
    console.log(`Wrote Russian question text for ${Object.keys(overlay).length} questions.`);
  }
}
