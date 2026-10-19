#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CLIENT_CONSTANT_AUDIT } from "./client-constant-audit.mjs";
import { reportMissingClientSource } from "./client-audit-requirement.mjs";
import { buildHeroQuoteHints } from "./hero-quote-hints.mjs";
import { parseValveKeyValues } from "./valve-keyvalues.mjs";
import { heroDisplayName } from "./hero-display-names.mjs";
import { HERO_PICKER_QUESTION_KINDS, heroCorrectAnswerKey, isHeroPickerQuestion } from "../src/lib/hero-picker.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [catalog, questions, aghanimQuestions, voteRoute, serializer] = await Promise.all([
  readFile(join(root, "src", "data", "hero-picker.json"), "utf8").then(JSON.parse),
  readFile(join(root, "src", "data", "questions.generated.json"), "utf8").then(JSON.parse),
  readFile(join(root, "src", "data", "aghanim-questions.json"), "utf8").then(JSON.parse),
  readFile(join(root, "src", "app", "api", "votes", "route.ts"), "utf8"),
  readFile(join(root, "src", "lib", "public-question.mjs"), "utf8"),
]);
const failures = [];
const expectedGroups = [
  ["strength", "Strength", 36, "DOTA_ATTRIBUTE_STRENGTH"],
  ["agility", "Agility", 35, "DOTA_ATTRIBUTE_AGILITY"],
  ["intelligence", "Intelligence", 34, "DOTA_ATTRIBUTE_INTELLECT"],
  ["universal", "Universal", 22, "DOTA_ATTRIBUTE_ALL"],
];

if (
  catalog.patch !== CLIENT_CONSTANT_AUDIT.patch ||
  catalog.clientBuild !== CLIENT_CONSTANT_AUDIT.clientBuild ||
  catalog.source !== "scripts/npc/npc_heroes.txt" ||
  catalog.columns !== 11
) {
  failures.push(`The hero picker is no longer stamped with the audited ${CLIENT_CONSTANT_AUDIT.patch} client layout.`);
}

if (
  JSON.stringify(catalog.groups?.map(({ key, label, heroes }) => [key, label, heroes.length])) !==
  JSON.stringify(expectedGroups.map(([key, label, count]) => [key, label, count]))
) {
  failures.push("The four Dota attribute quadrants or their live hero counts changed.");
}

const heroes = catalog.groups?.flatMap((group) => group.heroes ?? []) ?? [];
const heroKeys = new Set(heroes.map((hero) => hero.key));
if (heroes.length !== 127 || heroKeys.size !== heroes.length) {
  failures.push(`The picker needs 127 unique enabled heroes (found ${heroes.length}/${heroKeys.size}).`);
}

for (const group of catalog.groups ?? []) {
  const names = group.heroes.map((hero) => hero.name);
  const sortedNames = [...names].sort((left, right) => left.localeCompare(right, "en-US"));
  if (JSON.stringify(names) !== JSON.stringify(sortedNames)) {
    failures.push(`${group.label} no longer follows Dota's alphabetical grid order.`);
  }
  for (const hero of group.heroes) {
    const slug = hero.key?.replace(/^npc_dota_hero_/, "");
    if (
      !hero.key?.startsWith("npc_dota_hero_") ||
      typeof hero.name !== "string" ||
      !hero.name ||
      hero.image !== `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${slug}.png`
    ) {
      failures.push(`${hero.key ?? "unknown"}: invalid hero picker entry.`);
    }
  }
}

const identityQuestions = [...questions, ...aghanimQuestions].filter(isHeroPickerQuestion);
for (const kind of HERO_PICKER_QUESTION_KINDS) {
  if (!identityQuestions.some((question) => question.kind === kind)) {
    failures.push(`${kind}: no identity round exercises the hero picker.`);
  }
}
for (const question of identityQuestions) {
  const answerKey = heroCorrectAnswerKey(question);
  if (!answerKey || !heroKeys.has(answerKey)) {
    failures.push(`${question.id}: correct hero does not resolve into the audited picker.`);
  }
}
// The two identity clues come from backfill-quote-hints.mjs. Check them even
// without the live client files, so a lone sync run cannot ship without them.
for (const question of questions.filter((candidate) => candidate.kind === "hero-quote")) {
  const hints = question.quoteHints;
  if (!Array.isArray(hints) || hints.length !== 2 || hints.some((hint) => typeof hint !== "string" || !hint.trim())) {
    failures.push(
      `${question.id}: Quote Hunt identity clues are missing. Run pnpm sync-data, not the sync script alone.`,
    );
  }
}

const clientRootArgument = process.argv.find((argument) => argument.startsWith("--client-root="));
const clientRoot = resolve(
  clientRootArgument?.slice("--client-root=".length) ??
    process.env.DOTA_CLIENT_AUDIT_ROOT ??
    `/tmp/queue-arcade-live${CLIENT_CONSTANT_AUDIT.clientBuild}`,
);
try {
  const definitions = parseValveKeyValues(
    await readFile(join(clientRoot, "core", "scripts", "npc", "npc_heroes.txt"), "utf8"),
  ).DOTAHeroes;
  for (const [groupIndex, [, , , attribute]] of expectedGroups.entries()) {
    const liveKeys = Object.entries(definitions)
      .filter(([key, definition]) => key !== "npc_dota_hero_base" && definition?.Enabled === "1")
      .filter(([, definition]) => definition.AttributePrimary === attribute)
      .map(([key, definition]) => ({
        key,
        name: heroDisplayName(key, definition.workshop_guide_name),
      }))
      .sort((left, right) => left.name.localeCompare(right.name, "en-US"))
      .map(({ key }) => key);
    const catalogKeys = catalog.groups[groupIndex].heroes.map((hero) => hero.key);
    if (JSON.stringify(liveKeys) !== JSON.stringify(catalogKeys)) {
      failures.push(`${catalog.groups[groupIndex].label}: picker positions drifted from the audited client.`);
    }
  }
  for (const question of questions.filter((candidate) => candidate.kind === "hero-quote")) {
    const answerKey = heroCorrectAnswerKey(question);
    const expectedHints = buildHeroQuoteHints(answerKey, definitions);
    if (JSON.stringify(question.quoteHints) !== JSON.stringify(expectedHints)) {
      failures.push(`${question.id}: Quote Hunt identity clues drifted from the audited client.`);
    }
  }
} catch (error) {
  reportMissingClientSource(error, "Hero picker roster");
}

if (!voteRoute.includes("keyedAnswerIndex(question, answerKey)") || !serializer.includes('answerMode: "hero-grid"')) {
  failures.push("The opaque hero-key vote path was removed.");
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Validated 127 live heroes, Dota attribute quadrants, alphabetical positions, and opaque hero-key votes.");
