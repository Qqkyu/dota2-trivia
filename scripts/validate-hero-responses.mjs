#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { heroCorrectAnswerKey } from "../src/lib/hero-picker.mjs";
import { varietyShuffle } from "../src/lib/variety.mjs";
import { containsAnswerLeak } from "./spell-hints.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [questions, picker] = await Promise.all([
  readFile(join(root, "src", "data", "questions.generated.json"), "utf8").then(JSON.parse),
  readFile(join(root, "src", "data", "hero-picker.json"), "utf8").then(JSON.parse),
]);

const nonSpeakingHeroes = new Set([
  "npc_dota_hero_marci",
  "npc_dota_hero_phoenix",
  "npc_dota_hero_primal_beast",
  "npc_dota_hero_wisp",
]);
const limitedQuoteHeroes = new Map([["npc_dota_hero_kez", 1]]);
const pickerHeroes = picker.groups.flatMap((group) => group.heroes);
const speakingHeroes = pickerHeroes.filter((hero) => !nonSpeakingHeroes.has(hero.key));
const expectedSpeakingKeys = new Set(speakingHeroes.map((hero) => hero.key));
const echoQuestions = questions.filter((question) => question.kind === "hero-voice");
const quoteQuestions = questions.filter((question) => question.kind === "hero-quote");
const responseQuestions = [...echoQuestions, ...quoteQuestions];
const failures = [];

function normalizedLine(value) {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function echoTranscript(question) {
  return question.explanation?.match(/^“(.+)” is spoken by .+\.$/s)?.[1] ?? "";
}

function hasVocalization(value) {
  return /\b(?:ha(?:ha)+|he(?:he)+|heh+|nyaheh+|hehehaaha|hau+h+(?:-h+)?)\b|(?:\bha[!,.;\s-]*){2,}|(?:\bhe[!,.;\s-]*){2,}/i.test(
    value,
  );
}

function startsWithVocalization(value) {
  return /^(?:a+h+|a+gh+|u+gh+|h+m+|h+au+h+|gr+r+|heh+|ha(?:ha)+)(?:\b|[-,.!])/i.test(value);
}

function countsByHero(values) {
  const counts = new Map();
  for (const question of values) {
    const heroKey = heroCorrectAnswerKey(question);
    if (!heroKey) {
      failures.push(`${question.id}: correct hero cannot be resolved from its artwork.`);
      continue;
    }
    if (question.varietyKey !== heroKey) {
      failures.push(`${question.id}: varietyKey must identify the correct hero.`);
    }
    counts.set(heroKey, (counts.get(heroKey) ?? 0) + 1);
  }
  return counts;
}

const echoCounts = countsByHero(echoQuestions);
const quoteCounts = countsByHero(quoteQuestions);

for (const hero of speakingHeroes) {
  if (echoCounts.get(hero.key) !== 1) {
    failures.push(`${hero.name}: expected exactly one Echo Hunt clip, found ${echoCounts.get(hero.key) ?? 0}.`);
  }
  const expectedQuotes = limitedQuoteHeroes.get(hero.key) ?? 2;
  if (quoteCounts.get(hero.key) !== expectedQuotes) {
    failures.push(
      `${hero.name}: expected ${expectedQuotes} Quote Hunt lines, found ${quoteCounts.get(hero.key) ?? 0}.`,
    );
  }
}

for (const [heroKey] of [...echoCounts, ...quoteCounts]) {
  if (!expectedSpeakingKeys.has(heroKey))
    failures.push(`${heroKey}: unexpected response content for a non-speaking hero.`);
}

const audioUrls = echoQuestions.map((question) => question.audio?.src).filter(Boolean);
if (new Set(audioUrls).size !== echoQuestions.length) failures.push("Echo Hunt audio clips must be unique.");

const seenLines = new Map();
for (const question of responseQuestions) {
  const line = question.kind === "hero-voice" ? echoTranscript(question) : (question.detail ?? "");
  const words = line.match(/[a-z]+(?:['’-][a-z]+)*/gi) ?? [];
  const minimumCharacters = question.kind === "hero-voice" ? 18 : 28;
  const minimumWords = question.kind === "hero-voice" ? 3 : 5;
  if (line.length < minimumCharacters || words.length < minimumWords) {
    failures.push(`${question.id}: response line is too slight for ${question.eyebrow}.`);
  }
  if (hasVocalization(line) || (question.kind === "hero-voice" && startsWithVocalization(line))) {
    failures.push(`${question.id}: response starts with or contains a laugh-heavy vocalization.`);
  }
  const correctAnswer = question.answers[question.correctIndex];
  if (containsAnswerLeak(line, correctAnswer)) {
    failures.push(`${question.id}: response line reveals ${correctAnswer}.`);
  }
  const signature = normalizedLine(line);
  const duplicate = seenLines.get(signature);
  if (duplicate) failures.push(`${question.id}: repeats the line from ${duplicate}.`);
  if (signature) seenLines.set(signature, question.id);
}

for (const [heroKey] of expectedSpeakingKeys) {
  const heroLines = responseQuestions
    .filter((question) => question.varietyKey === heroKey)
    .map((question) =>
      normalizedLine(question.kind === "hero-voice" ? echoTranscript(question) : (question.detail ?? "")),
    );
  if (new Set(heroLines).size !== heroLines.length) failures.push(`${heroKey}: response variants must be distinct.`);
}

for (const [kind, values] of [
  ["Echo Hunt", echoQuestions],
  ["Quote Hunt", quoteQuestions],
]) {
  const scheduled = varietyShuffle(values, `hero-response-coverage:${kind}`);
  if (scheduled.some((question, index) => index > 0 && question.varietyKey === scheduled[index - 1].varietyKey)) {
    failures.push(`${kind}: the deterministic rotation placed the same hero back-to-back.`);
  }
  const openingHeroCount = new Set(scheduled.slice(0, speakingHeroes.length).map((question) => question.varietyKey))
    .size;
  if (openingHeroCount !== speakingHeroes.length) {
    failures.push(`${kind}: its first roster cycle does not cover every speaking hero exactly once.`);
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${echoQuestions.length} unique Echo clips and ${quoteQuestions.length} curated quotes across all ${speakingHeroes.length} speaking heroes; only Phoenix, Primal Beast, Io, and Marci are intentionally absent.`,
  );
}
