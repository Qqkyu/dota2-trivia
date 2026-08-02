#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { heroCorrectAnswerKey } from "../src/lib/hero-picker.mjs";
import { CLIENT_CONSTANT_AUDIT } from "./client-constant-audit.mjs";
import { buildHeroQuoteHints } from "./hero-quote-hints.mjs";
import { parseValveKeyValues } from "./valve-keyvalues.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "src", "data", "questions.generated.json");
const clientRootArgument = process.argv.find((argument) => argument.startsWith("--client-root="));
const CLIENT_ROOT = resolve(
  clientRootArgument?.slice("--client-root=".length) ??
    process.env.DOTA_CLIENT_AUDIT_ROOT ??
    `/tmp/queue-arcade-live${CLIENT_CONSTANT_AUDIT.clientBuild}`,
);
const HEROES_PATH = join(CLIENT_ROOT, "core", "scripts", "npc", "npc_heroes.txt");

const [questions, heroText] = await Promise.all([
  readFile(OUTPUT, "utf8").then(JSON.parse),
  readFile(HEROES_PATH, "utf8"),
]);
const definitions = parseValveKeyValues(heroText).DOTAHeroes;
if (!definitions) throw new Error(`Dota hero definitions are missing from ${HEROES_PATH}.`);

let updated = 0;
const nextQuestions = questions.map((question) => {
  if (question.kind !== "hero-quote") return question;
  const heroKey = heroCorrectAnswerKey(question);
  if (!heroKey) throw new Error(`${question.id}: correct hero key cannot be resolved.`);
  updated += 1;
  return { ...question, quoteHints: buildHeroQuoteHints(heroKey, definitions) };
});

await writeFile(OUTPUT, await format(`${JSON.stringify(nextQuestions, null, 2)}\n`, { parser: "json" }));
console.log(`Added two live-client identity clues to ${updated} Quote Hunt questions.`);
