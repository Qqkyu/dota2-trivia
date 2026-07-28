#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SOUNDCHECK_AUDIT, SOUNDCHECK_DEFINITIONS, soundcheckAudioUrl, soundcheckSource } from "./soundcheck-audit.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const questions = JSON.parse(await readFile(join(root, "src", "data", "soundcheck-questions.json"), "utf8"));
const metadata = JSON.parse(await readFile(join(root, "src", "data", "trivia-meta.generated.json"), "utf8"));
const failures = [];
const ids = new Set();
const audioUrls = new Set();
const answerSets = new Set();
const answerPositionCounts = [0, 0, 0, 0];
const familyCounts = { ability: 0, item: 0 };
const learningCounts = { ability: 0, item: 0 };
const veteranCounts = { ability: 0, item: 0 };

function assetKey(image, family) {
  const directory = family === "ability" ? "abilities" : "items";
  return image?.match(new RegExp(`/${directory}/([^/?]+)\\.png(?:[?#].*)?$`))?.[1];
}

if (!Array.isArray(questions) || questions.length !== SOUNDCHECK_DEFINITIONS.length) {
  failures.push(
    `Soundcheck must contain every reviewed definition (${SOUNDCHECK_DEFINITIONS.length}; found ${questions.length ?? 0}).`,
  );
}
if (metadata.patch !== SOUNDCHECK_AUDIT.patch) {
  failures.push(`Soundcheck audit ${SOUNDCHECK_AUDIT.patch} does not match trivia patch ${metadata.patch}.`);
}

for (const [index, definition] of SOUNDCHECK_DEFINITIONS.entries()) {
  const id = `soundcheck-${definition.family}:${definition.subject}`;
  const question = questions.find((candidate) => candidate.id === id);
  if (!question) {
    failures.push(`${id}: reviewed sound is missing from the generated deck.`);
    continue;
  }
  const source = soundcheckSource(definition);
  const expectedKind = `soundcheck-${definition.family}`;
  const expectedCategory = definition.family === "ability" ? "Abilities" : "Items";
  const expectedKeys = [definition.subject, ...definition.distractors].sort();

  if (ids.has(id)) failures.push(`${id}: duplicate question.`);
  ids.add(id);
  if (question.kind !== expectedKind || question.category !== expectedCategory) {
    failures.push(`${id}: family, kind, and category do not match.`);
  }
  if (question.patch !== metadata.patch || question.difficulty !== definition.difficulty) {
    failures.push(`${id}: patch or difficulty drifted from the audit.`);
  }
  if (question.image !== undefined) failures.push(`${id}: the answer must stay hidden behind audio.`);
  if (question.prompt !== `Match the ${definition.family} sound.`) {
    failures.push(`${id}: prompt is no longer short and language-light.`);
  }
  if (question.source?.label !== source.label || question.source?.url !== source.url) {
    failures.push(`${id}: source event is missing or stale.`);
  }
  if (question.audio?.src !== soundcheckAudioUrl(definition) || audioUrls.has(question.audio?.src)) {
    failures.push(`${id}: audio is missing, duplicated, or no longer matches the audited event.`);
  }
  audioUrls.add(question.audio?.src);
  if (
    question.soundcheck?.family !== definition.family ||
    question.soundcheck?.event !== definition.event ||
    question.soundcheck?.eventFile !== definition.eventFile ||
    question.soundcheck?.duration !== definition.duration ||
    question.soundcheck?.audit?.reviewedAt !== SOUNDCHECK_AUDIT.reviewedAt ||
    question.soundcheck?.audit?.clientBuild !== SOUNDCHECK_AUDIT.clientBuild
  ) {
    failures.push(`${id}: sound-event audit metadata is missing or stale.`);
  }
  if (definition.duration < 0.5 || definition.duration > 7) {
    failures.push(`${id}: clip duration is unsuitable for a rapid round.`);
  }

  if (
    !Array.isArray(question.answers) ||
    question.answers.length !== 4 ||
    new Set(question.answers).size !== 4 ||
    !Array.isArray(question.answerImages) ||
    question.answerImages.length !== 4 ||
    question.answerImageKind !== definition.family
  ) {
    failures.push(`${id}: four same-type visual answers are required.`);
    continue;
  }
  const answerKeys = question.answerImages.map((image) => assetKey(image, definition.family));
  if (answerKeys.some((key) => !key) || JSON.stringify([...answerKeys].sort()) !== JSON.stringify(expectedKeys)) {
    failures.push(`${id}: answer artwork drifted from the reviewed option set.`);
  }
  if (
    !Number.isInteger(question.correctIndex) ||
    question.correctIndex < 0 ||
    question.correctIndex > 3 ||
    answerKeys[question.correctIndex] !== definition.subject
  ) {
    failures.push(`${id}: correctIndex does not point to the audited sound source.`);
  } else {
    answerPositionCounts[question.correctIndex] += 1;
    if (!question.explanation?.includes(question.answers[question.correctIndex])) {
      failures.push(`${id}: explanation does not name the sound source.`);
    }
  }
  if (question.correctIndex !== index % 4) failures.push(`${id}: answer-position balancing drifted.`);

  const answerSet = [...answerKeys].sort().join("|");
  if (answerSets.has(answerSet)) failures.push(`${id}: duplicate four-option sound matchup.`);
  answerSets.add(answerSet);
  familyCounts[definition.family] += 1;
  if (definition.difficulty === 1) learningCounts[definition.family] += 1;
  if (definition.difficulty >= 2) veteranCounts[definition.family] += 1;
}

for (const question of questions) {
  if (!ids.has(question.id)) failures.push(`${question.id}: generated question has no reviewed sound definition.`);
}
for (const family of ["ability", "item"]) {
  if (familyCounts[family] !== 12 || learningCounts[family] !== 4 || veteranCounts[family] !== 8) {
    failures.push(
      `${family}: expected 12 sounds with 4 Learning and 8 Veteran rounds (${familyCounts[family]}, ${learningCounts[family]}, ${veteranCounts[family]}).`,
    );
  }
}
if (answerPositionCounts.some((count) => count !== SOUNDCHECK_DEFINITIONS.length / 4)) {
  failures.push(`Soundcheck answer positions are unbalanced: ${JSON.stringify(answerPositionCounts)}.`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${questions.length} Soundcheck rounds (${JSON.stringify(familyCounts)}; answer slots ${JSON.stringify(answerPositionCounts)}).`,
  );
}
