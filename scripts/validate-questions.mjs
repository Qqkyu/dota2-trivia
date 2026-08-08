#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ABILITY_CONSTANT_OVERRIDES,
  CLIENT_CONSTANT_AUDIT,
  HERO_CONSTANT_OVERRIDES,
  ITEM_CONSTANT_OVERRIDES,
} from "./client-constant-audit.mjs";
import { DAMAGE_QUESTION_FACTS, damageQuestionPrompt } from "./damage-question-facts.mjs";
import { isPlayableClassicTriviaQuestion, RETIRED_CLASSIC_TRIVIA_KINDS } from "../src/lib/classic-trivia-quality.mjs";
import { isPlayableShopkeeperQuestion } from "../src/lib/shopkeeper-quality.mjs";
import {
  NON_TRIVIA_COOLDOWN_KEYS,
  NON_TRIVIA_DETECTIVE_KEYS,
  NON_TRIVIA_SPELL_OWNER_KEYS,
} from "./question-quality-audit.mjs";
import { buildSpellHint, containsAnswerLeak, containsFullNameLeak } from "./spell-hints.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const questions = JSON.parse(await readFile(join(root, "src", "data", "questions.generated.json"), "utf8"));
const metadata = JSON.parse(await readFile(join(root, "src", "data", "trivia-meta.generated.json"), "utf8"));

const failures = [];
const ids = new Set();
const contentSignatures = new Map();
const imageUrls = new Set();
const audioUrls = new Set();
const isVoiceVocalization = (word) =>
  /^(?:a+h+|h+a+h*|h+e+h+|h+o+h*|h+u+h+|(?:ha){2,}h?|(?:ah){2,}a?|(?:he){2,}h?|(?:eh){2,}e?|(?:ho){2,}h?|(?:oh){2,}o?|hm+|hmm+|e+h+|o+h+|u+gh+|gr+r+|ar+gh+)$/i.test(
    word,
  );
const allowedKinds = new Set([
  "spell-owner",
  "mana-cost",
  "cooldown",
  "ability-damage",
  "hero-primary-attribute",
  "hero-move-speed",
  "item-cost",
  "recipe-component",
  "hero-stat-duel",
  "hero-intruder",
  "ability-detective",
  "recipe-upgrade",
  "item-price-duel",
  "fogged-hero",
  "hero-voice",
  "hero-quote",
]);
const artworkOptionalKinds = new Set(["hero-stat-duel", "hero-intruder", "item-price-duel", "hero-quote"]);
const liveClientKinds = new Set([
  "spell-owner",
  "ability-detective",
  "mana-cost",
  "cooldown",
  "ability-damage",
  "hero-primary-attribute",
  "hero-move-speed",
  "hero-stat-duel",
  "hero-intruder",
  "item-cost",
  "recipe-component",
  "recipe-upgrade",
  "item-price-duel",
]);

function numericCorrectAnswer(question) {
  return Number(String(question.answers[question.correctIndex]).replace(/[^\d.-]/g, ""));
}

function artworkKey(url, family) {
  return url?.match(new RegExp(`/${family}/([^/?]+)\\.png`))?.[1];
}

if (!Array.isArray(questions) || questions.length < 100) {
  failures.push("The generated deck must contain at least 100 questions.");
}

for (const [index, question] of questions.entries()) {
  const label = question?.id ?? `question ${index}`;

  if (!question?.id || ids.has(question.id)) failures.push(`${label}: missing or duplicate id.`);
  ids.add(question.id);
  const contentSignature = JSON.stringify([
    question.kind,
    question.prompt,
    question.detail ?? "",
    [...(question.answers ?? [])].sort(),
  ]);
  const previousSignature = contentSignatures.get(contentSignature);
  if (previousSignature) failures.push(`${label}: duplicates the playable content in ${previousSignature}.`);
  contentSignatures.set(contentSignature, label);
  if (!allowedKinds.has(question.kind)) failures.push(`${label}: missing or unknown question kind.`);

  if (!Array.isArray(question.answers) || question.answers.length !== 4) {
    failures.push(`${label}: must have exactly four answers.`);
    continue;
  }

  if (new Set(question.answers).size !== 4) failures.push(`${label}: answers must be unique.`);
  if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex > 3) {
    failures.push(`${label}: invalid correctIndex.`);
  }
  if (!question.answers[question.correctIndex]) failures.push(`${label}: correct answer is empty.`);
  if (![1, 2, 3].includes(question.difficulty)) failures.push(`${label}: hidden difficulty must be 1, 2, or 3.`);
  if ((question.prompt?.trim().split(/\s+/).filter(Boolean).length ?? 99) > 12) {
    failures.push(`${label}: prompt is too slow to scan on the shared clock.`);
  }
  if (question.answers.some((answer) => answer.trim().split(/\s+/).filter(Boolean).length > 5)) {
    failures.push(`${label}: an answer is too slow to scan on the shared clock.`);
  }
  if (!artworkOptionalKinds.has(question.kind) && !/^https:\/\//.test(question.image?.src ?? "")) {
    failures.push(`${label}: image URL is invalid.`);
  }
  if (question.image && !/^https:\/\//.test(question.image.src ?? "")) failures.push(`${label}: image URL is invalid.`);
  if (question.image?.src) imageUrls.add(question.image.src);
  if (
    question.answerImages &&
    (question.answerImages.length !== 4 || question.answerImages.some((image) => !/^https:\/\//.test(image ?? "")))
  ) {
    failures.push(`${label}: answer images must contain four valid HTTPS URLs.`);
  }
  if (question.answerImages && !["ability", "hero", "item"].includes(question.answerImageKind)) {
    failures.push(`${label}: visual answers must declare their artwork kind.`);
  }
  for (const image of question.answerImages ?? []) imageUrls.add(image);
  if (
    [
      "spell-owner",
      "recipe-component",
      "ability-detective",
      "recipe-upgrade",
      "hero-stat-duel",
      "hero-intruder",
      "item-price-duel",
      "hero-voice",
      "hero-quote",
    ].includes(question.kind) &&
    !question.answerImages
  ) {
    failures.push(`${label}: visual arcade rounds require answer images.`);
  }
  if (question.kind === "spell-owner") {
    const correctAnswer = question.answers[question.correctIndex];
    if (!question.hint?.trim()) failures.push(`${label}: Spell Link requires an answer-safe hint.`);
    const explanationPrefix = `${question.eyebrow} belongs to ${correctAnswer}.`;
    const fullDescription = question.explanation?.startsWith(explanationPrefix)
      ? question.explanation.slice(explanationPrefix.length)
      : question.explanation?.split(". ").slice(1).join(". ");
    const expectedHint = buildSpellHint(fullDescription, correctAnswer, question.eyebrow, {
      fullDescription: true,
    });
    if (question.hint !== expectedHint) {
      failures.push(`${label}: Spell Link must expose the complete answer-safe ability description.`);
    }
    if (question.hint && containsAnswerLeak(question.hint, correctAnswer)) {
      failures.push(`${label}: Spell Link hint leaks the correct hero (${correctAnswer}).`);
    }
    if (question.hint && containsFullNameLeak(question.hint, question.eyebrow)) {
      failures.push(`${label}: the opening Spell Link description leaks ${question.eyebrow}.`);
    }
  }
  if (
    question.kind === "ability-detective" &&
    containsAnswerLeak(question.detail ?? "", question.answers[question.correctIndex])
  ) {
    failures.push(`${label}: Ability Detective clue leaks the correct ability.`);
  }
  if (question.kind === "ability-detective") {
    const clueWords = question.detail?.trim().split(/\s+/).filter(Boolean) ?? [];
    if (clueWords.length > 22) failures.push(`${label}: Ability Detective clue is too slow to scan.`);
    if (
      /\b(?:a|an|the) this ability\b|Primary the caster|\bthe caster (?:gain|trigger)\b/i.test(question.detail ?? "")
    ) {
      failures.push(`${label}: Ability Detective clue contains broken redaction grammar.`);
    }
  }
  const clueText = question.hint ?? question.detail ?? "";
  if (
    ["spell-owner", "ability-detective"].includes(question.kind) &&
    (/\b(?:a|an|the) (?:this ability|the caster)\b|Primary the caster|\bthe caster (?:gain|trigger|this ability)\b/i.test(
      clueText,
    ) ||
      /[.!?]\s+(?:the caster|this ability)\b/.test(clueText))
  ) {
    failures.push(`${label}: clue contains broken redaction grammar.`);
  }
  if (question.kind === "hero-voice") {
    if (!/^https:\/\//.test(question.audio?.src ?? ""))
      failures.push(`${label}: Echo Hunt requires a valid audio URL.`);
    if (question.audio?.src) audioUrls.add(question.audio.src);
    if (/(?:^|[_:-])(laugh|chuckle|giggle)(?:[_:-]|$)/i.test(question.id)) {
      failures.push(`${label}: Echo Hunt must use a proper spoken line, not a laugh.`);
    }
  } else if (question.audio) {
    failures.push(`${label}: unexpected audio payload.`);
  }
  if (question.kind === "hero-quote") {
    const quoteWords = question.detail?.match(/[a-z]+(?:['’-][a-z]+)*/gi) ?? [];
    const vocalizations = quoteWords.filter(isVoiceVocalization);
    const correctAnswer = question.answers[question.correctIndex];
    if ((question.detail?.length ?? 0) < 28 || quoteWords.length < 5) {
      failures.push(`${label}: Quote Hunt requires a substantial spoken line.`);
    }
    if (vocalizations.some((word) => word.length >= 4) || vocalizations.length >= 2) {
      failures.push(`${label}: Quote Hunt must use a proper line without laugh-heavy vocalizations.`);
    }
    if (containsAnswerLeak(question.detail ?? "", correctAnswer)) {
      failures.push(`${label}: Quote Hunt line leaks the correct hero.`);
    }
    if (/(?:^|[_:-])(laugh|chuckle|giggle)(?:[_:-]|$)/i.test(question.id)) {
      failures.push(`${label}: Quote Hunt must never use a laugh or vocalization.`);
    }
    if (
      !Array.isArray(question.quoteHints) ||
      question.quoteHints.length !== 2 ||
      !/^(?:Strength|Agility|Intelligence|Universal) hero$/.test(question.quoteHints[0] ?? "") ||
      !/^(?:Melee|Ranged) · (?:Carry|Support|Nuker|Disabler|Jungler|Durable|Escape|Pusher|Initiator)$/.test(
        question.quoteHints[1] ?? "",
      )
    ) {
      failures.push(`${label}: Quote Hunt needs two compact live-client identity clues.`);
    }
    if (question.quoteHints?.some((hint) => containsAnswerLeak(hint, correctAnswer))) {
      failures.push(`${label}: a Quote Hunt identity clue leaks ${correctAnswer}.`);
    }
  }
  if (!/^https:\/\//.test(question.source?.url ?? "")) failures.push(`${label}: source URL is invalid.`);
  if (
    liveClientKinds.has(question.kind) &&
    question.source?.label !== `Dota 2 live-client audit · build ${CLIENT_CONSTANT_AUDIT.clientBuild}`
  ) {
    failures.push(`${label}: current-client answer audit is missing from the source stamp.`);
  }
  if (question.patch !== metadata.patch) failures.push(`${label}: patch does not match metadata.`);
}

const spellLinkQuestions = questions.filter((question) => question.kind === "spell-owner");
const playableSpellLinkQuestions = spellLinkQuestions.filter(
  (question) =>
    (question.hint?.trim().length ?? 0) >= 18 && !question.hint?.startsWith("No additional mechanical clue"),
);
const foggedQuestions = questions.filter((question) => question.kind === "fogged-hero");
const voiceQuestions = questions.filter((question) => question.kind === "hero-voice");
const quoteQuestions = questions.filter((question) => question.kind === "hero-quote");
const damageQuestions = questions.filter((question) => question.kind === "ability-damage");
const playableGeneratedQuestions = questions.filter(
  (question) =>
    isPlayableClassicTriviaQuestion(question) &&
    (question.kind !== "spell-owner" ||
      ((question.hint?.trim().length ?? 0) >= 18 && !question.hint?.startsWith("No additional mechanical clue"))) &&
    isPlayableShopkeeperQuestion(question),
);
const retiredGeneratedQuestions = questions.filter((question) => !isPlayableClassicTriviaQuestion(question));
const otherExcludedQuestionCount =
  questions.length - playableGeneratedQuestions.length - retiredGeneratedQuestions.length;
const spellLinkHeroes = playableSpellLinkQuestions.map((question) => question.answers[question.correctIndex]);
if (playableSpellLinkQuestions.length < 120 || new Set(spellLinkHeroes).size !== playableSpellLinkQuestions.length) {
  failures.push(
    `Spell Link needs one strong clue per hero before repeating subjects (found ${playableSpellLinkQuestions.length} clues for ${new Set(spellLinkHeroes).size} heroes).`,
  );
}
if (playableSpellLinkQuestions.some((question) => question.difficulty !== 2)) {
  failures.push("Spell Link must keep one consistent hidden scoring tier now that player-facing levels are retired.");
}
if (foggedQuestions.length < 36) failures.push(`Fogged Vision needs at least 36 playable heroes.`);
if (voiceQuestions.length < 32) failures.push(`Echo Hunt needs at least 32 verified hero clips.`);
if (quoteQuestions.length < 32) failures.push(`Quote Hunt needs at least 32 proper hero lines.`);
const quoteDetails = new Map();
for (const question of quoteQuestions) {
  const signature = question.detail
    ?.toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const duplicate = signature ? quoteDetails.get(signature) : undefined;
  if (duplicate) failures.push(`${question.id}: duplicates the Quote Hunt line from ${duplicate}.`);
  if (signature) quoteDetails.set(signature, question.id);
}
for (const kind of RETIRED_CLASSIC_TRIVIA_KINDS) {
  if (isPlayableClassicTriviaQuestion({ kind })) {
    failures.push(`${kind}: retired Classic Trivia template passed the playable-quality gate.`);
  }
}
if (!isPlayableClassicTriviaQuestion({ kind: "mana-cost" })) {
  failures.push("The Classic Trivia quality gate rejected a retained knowledge template.");
}
if (playableGeneratedQuestions.some((question) => RETIRED_CLASSIC_TRIVIA_KINDS.has(question.kind))) {
  failures.push("A retired Classic Trivia template remains in the playable generated pool.");
}

const auditedDamageKeys = new Set(Object.keys(DAMAGE_QUESTION_FACTS));
if (damageQuestions.length !== auditedDamageKeys.size) {
  failures.push(
    `Damage trivia must contain exactly the ${auditedDamageKeys.size} explicitly audited mechanics (found ${damageQuestions.length}).`,
  );
}
for (const question of damageQuestions) {
  const abilityKey = question.id.match(/^damage:(.+):\d+$/)?.[1];
  const fact = abilityKey ? DAMAGE_QUESTION_FACTS[abilityKey] : undefined;
  if (!fact) {
    failures.push(`${question.id}: damage mechanic is not in the explicit semantic audit.`);
    continue;
  }
  if (!fact.attributeKey?.trim()) {
    failures.push(`${question.id}: audited damage mechanic does not pin an exact client attribute.`);
  }

  auditedDamageKeys.delete(abilityKey);
  const abilityName = question.eyebrow?.split(" · ").at(-1);
  const hasLevels = !question.id.endsWith(":1");
  const expectedPrompt = damageQuestionPrompt(abilityName, fact, hasLevels);
  if (question.prompt !== expectedPrompt) {
    failures.push(`${question.id}: damage prompt does not identify the audited mechanic.`);
  }
  if (!/^(?:How|What)\b.+\?$/.test(question.prompt)) {
    failures.push(`${question.id}: damage prompt is not a complete English question.`);
  }
  if (question.prompt.includes(":")) {
    failures.push(`${question.id}: damage prompt still uses fragment-style punctuation.`);
  }
  if (question.prompt.trim().split(/\s+/).length > 12) {
    failures.push(`${question.id}: damage prompt is too slow to scan.`);
  }
  if (fact.note && !question.explanation.endsWith(fact.note)) {
    failures.push(`${question.id}: damage explanation is missing its audited context.`);
  }
  const suffix = fact.suffix ?? "";
  if (question.answers.some((answer) => !answer.endsWith(suffix))) {
    failures.push(`${question.id}: answer unit does not match the audited mechanic.`);
  }
}
for (const missingKey of auditedDamageKeys) {
  failures.push(`damage:${missingKey}: audited damage mechanic is missing from the deck.`);
}

for (const question of questions) {
  const abilityMatch = question.id.match(/^(mana|cooldown|damage):(.+):(\d+)$/);
  if (abilityMatch) {
    const [, family, abilityKey, level] = abilityMatch;
    const override = ABILITY_CONSTANT_OVERRIDES[abilityKey];
    const auditedValues =
      family === "mana"
        ? override?.mana
        : family === "cooldown"
          ? override?.cooldown
          : override?.attributes?.[DAMAGE_QUESTION_FACTS[abilityKey]?.attributeKey];
    if (auditedValues) {
      const expected = auditedValues[Number(level) - 1] ?? (auditedValues.length === 1 ? auditedValues[0] : undefined);
      if (numericCorrectAnswer(question) !== expected) {
        failures.push(`${question.id}: answer does not use the current-client override (${expected}).`);
      }
    }
  }

  const describedAbilityKey = question.id.match(/^(?:ability-owner|ability-detective):(.+)$/)?.[1];
  const auditedDescription = describedAbilityKey
    ? ABILITY_CONSTANT_OVERRIDES[describedAbilityKey]?.description
    : undefined;
  if (auditedDescription && !question.explanation.includes(auditedDescription)) {
    failures.push(`${question.id}: reveal does not use the current-client description override.`);
  }

  if (question.kind === "hero-move-speed") {
    const heroKey = `npc_dota_hero_${artworkKey(question.image?.src, "heroes")}`;
    const expected = HERO_CONSTANT_OVERRIDES[heroKey]?.move_speed;
    if (expected !== undefined && numericCorrectAnswer(question) !== expected) {
      failures.push(`${question.id}: answer does not use the current-client movement speed (${expected}).`);
    }
  }

  if (question.kind === "hero-stat-duel") {
    for (const [index, artwork] of (question.answerImages ?? []).entries()) {
      const heroKey = `npc_dota_hero_${artworkKey(artwork, "heroes")}`;
      const override = HERO_CONSTANT_OVERRIDES[heroKey];
      const expected = question.id.startsWith("hero-stat:move-speed:")
        ? override?.move_speed
        : question.id.startsWith("hero-stat:attack-range:")
          ? override?.attack_range
          : override?.attack_rate;
      if (expected === undefined) continue;
      const suffix = question.id.startsWith("hero-stat:base-attack-time:") ? "s" : "";
      if (!question.explanation.includes(`${question.answers[index]} ${expected}${suffix}`)) {
        failures.push(`${question.id}: reveal does not use ${question.answers[index]}'s current-client value.`);
      }
    }
  }

  if (question.kind === "item-cost") {
    const itemKey = artworkKey(question.image?.src, "items");
    const expected = ITEM_CONSTANT_OVERRIDES[itemKey]?.cost;
    if (expected !== undefined && numericCorrectAnswer(question) !== expected) {
      failures.push(`${question.id}: answer does not use the current-client price (${expected}).`);
    }
  }

  if (question.kind === "item-price-duel") {
    for (const [index, artwork] of (question.answerImages ?? []).entries()) {
      const expected = ITEM_CONSTANT_OVERRIDES[artworkKey(artwork, "items")]?.cost;
      if (expected === undefined) continue;
      if (!question.explanation.includes(`${question.answers[index]} ${expected.toLocaleString("en-US")}g`)) {
        failures.push(`${question.id}: reveal does not use ${question.answers[index]}'s current-client price.`);
      }
    }
  }
}

for (const abilityKey of NON_TRIVIA_COOLDOWN_KEYS) {
  if (questions.some((question) => question.id.startsWith(`cooldown:${abilityKey}:`))) {
    failures.push(`cooldown:${abilityKey}: internal helper-control cooldown leaked into trivia.`);
  }
}
for (const abilityKey of NON_TRIVIA_DETECTIVE_KEYS) {
  if (questions.some((question) => question.id === `ability-detective:${abilityKey}`)) {
    failures.push(`ability-detective:${abilityKey}: source description gives away the same-hero answer.`);
  }
}
for (const abilityKey of NON_TRIVIA_SPELL_OWNER_KEYS) {
  if (questions.some((question) => question.id === `ability-owner:${abilityKey}`)) {
    failures.push(`ability-owner:${abilityKey}: official icon directly reveals its owning hero.`);
  }
}

if (metadata.questionCount !== questions.length) {
  failures.push(`Metadata says ${metadata.questionCount} questions, but the deck has ${questions.length}.`);
}
if (
  metadata.clientConstantAudit?.patch !== CLIENT_CONSTANT_AUDIT.patch ||
  metadata.clientConstantAudit?.clientBuild !== CLIENT_CONSTANT_AUDIT.clientBuild ||
  metadata.clientConstantAudit?.steamBuildId !== CLIENT_CONSTANT_AUDIT.steamBuildId ||
  metadata.clientConstantAudit?.reviewedAt !== CLIENT_CONSTANT_AUDIT.reviewedAt
) {
  failures.push("Metadata does not match the current live-client constants audit.");
}
if (!metadata.contentVersion?.startsWith(`${metadata.patch}-`)) {
  failures.push("The content version must namespace deck changes beneath the gameplay patch.");
}
for (const kind of allowedKinds) {
  const actual = questions.filter((question) => question.kind === kind).length;
  if ((metadata.kindCounts?.[kind] ?? 0) !== actual) {
    failures.push(`${kind}: metadata count does not match the generated deck.`);
  }
  if (actual >= 8) {
    const answerSlots = [0, 1, 2, 3].map(
      (slot) => questions.filter((question) => question.kind === kind && question.correctIndex === slot).length,
    );
    if (Math.max(...answerSlots) - Math.min(...answerSlots) > 1) {
      failures.push(`${kind}: correct answers are biased across A–D (${answerSlots.join(" / ")}).`);
    }
  }
}
if (metadata.assetValidation?.checkedAt !== metadata.snapshotDate) {
  failures.push("The generated deck must record an artwork check for its snapshot date.");
}
if (metadata.assetValidation?.verifiedAssetCount !== imageUrls.size) {
  failures.push(
    `Metadata says ${metadata.assetValidation?.verifiedAssetCount ?? 0} images were verified, but the deck uses ${imageUrls.size}.`,
  );
}
if (metadata.assetValidation?.verifiedAudioCount !== audioUrls.size) {
  failures.push(
    `Metadata says ${metadata.assetValidation?.verifiedAudioCount ?? 0} audio clips were verified, but the deck uses ${audioUrls.size}.`,
  );
}
for (const rejectedId of metadata.assetValidation?.rejectedQuestionIds ?? []) {
  if (ids.has(rejectedId)) failures.push(`${rejectedId}: rejected artwork remains in the playable deck.`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${questions.length} source questions (${playableGeneratedQuestions.length} live; ${retiredGeneratedQuestions.length} low-signal templates retired; ${otherExcludedQuestionCount} excluded by other quality gates) across ${Object.keys(metadata.categoryCounts).length} categories for patch ${metadata.patch}.`,
  );
}
