#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SOUNDCHECK_AUDIT,
  SOUNDCHECK_DEFINITIONS,
  soundcheckAudioUrl,
  soundcheckClips,
  soundcheckSharedAudioAlternatives,
  soundcheckSource,
} from "./soundcheck-audit.mjs";
import {
  ECHO_HUNT_REVEAL_STAGES,
  SOUNDCHECK_FINAL_REVEAL_SECONDS,
  SOUNDCHECK_REVEAL_STAGES,
  SOUNDCHECK_SEQUENCE_GAP_SECONDS,
  echoHuntCutDuration,
  soundcheckCutDuration,
  soundcheckRevealStage,
} from "../src/lib/soundcheck.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const questions = JSON.parse(await readFile(join(root, "src", "data", "soundcheck-questions.json"), "utf8"));
const shopkeeperCatalog = JSON.parse(await readFile(join(root, "src", "data", "shopkeeper-catalog.json"), "utf8"));
const metadata = JSON.parse(await readFile(join(root, "src", "data", "trivia-meta.generated.json"), "utf8"));
const arcadeComponent = await readFile(join(root, "src", "components", "queue-arcade.tsx"), "utf8");
const failures = [];
const shopItemKeys = new Set(shopkeeperCatalog.groups.flatMap((group) => group.items.map((item) => item.key)));
const ids = new Set();
const audioUrls = new Set();
const answerSets = new Set();
const answerPositionCounts = [0, 0, 0, 0];
const familyCounts = { ability: 0, item: 0 };
const learningCounts = { ability: 0, item: 0 };
const veteranCounts = { ability: 0, item: 0 };
const formatCounts = {
  ability: { single: 0, sequence: 0 },
  item: { single: 0, sequence: 0 },
};
const difficultyCounts = {
  ability: [0, 0, 0],
  item: [0, 0, 0],
};
let progressiveClipCount = 0;

function assetKey(image, family) {
  const directory = family === "ability" ? "abilities" : "items";
  return image?.match(new RegExp(`/${directory}/([^/?]+)\\.png(?:[?#].*)?$`))?.[1];
}

function expectedSequencePairs(definition, correctIndex) {
  const secondSubject = definition.sequence?.subject;
  const alternatives = definition.distractors.filter((key) => key !== secondSubject);
  const correctPair = [definition.subject, secondSubject];
  const pairs = [
    [definition.subject, alternatives[0]],
    [alternatives[1], secondSubject],
    [secondSubject, definition.subject],
  ];
  pairs.splice(correctIndex, 0, correctPair);
  return pairs;
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
  const clips = soundcheckClips(definition);
  const isSequence = clips.length === 2;
  const expectedFormat = isSequence ? "sequence" : "single";
  const expectedKind = `soundcheck-${definition.family}`;
  const expectedCategory = definition.family === "ability" ? "Abilities" : "Items";
  const expectedChoiceScope =
    definition.difficulty === 1
      ? "recognizable"
      : isSequence
        ? "ordered-pair"
        : definition.family === "ability"
          ? "same-hero"
          : "active-items";
  const expectedKeys = [definition.subject, ...definition.distractors].sort();
  const expectedClipMetadata = clips.map(({ subject, event, eventFile, duration }) => ({
    subject,
    event,
    eventFile,
    duration,
  }));
  const expectedAudioUrls = clips.map(soundcheckAudioUrl);
  for (const clip of clips) {
    const ambiguousChoices = soundcheckSharedAudioAlternatives(clip.subject, [
      definition.subject,
      ...definition.distractors,
    ]);
    if (ambiguousChoices.length) {
      failures.push(`${id}: ${clip.subject} shares its cue with option ${ambiguousChoices.join(", ")}.`);
    }
    const cuts = Array.from({ length: SOUNDCHECK_REVEAL_STAGES }, (_, stage) =>
      soundcheckCutDuration(clip.duration, stage + 1),
    );
    progressiveClipCount += 1;
    if (
      cuts[0] <= 0 ||
      cuts[0] >= cuts[1] ||
      cuts[1] >= cuts[2] ||
      cuts[2] !== clip.duration ||
      cuts[0] > 0.12 ||
      cuts[1] > 0.27 ||
      cuts[0] / clip.duration > 0.101 ||
      cuts[1] / clip.duration > 0.201
    ) {
      failures.push(`${id}: audited clip ${clip.event} has an invalid progressive cut ${JSON.stringify(cuts)}.`);
    }
  }
  const finalPassDuration =
    clips.reduce((total, clip) => total + soundcheckCutDuration(clip.duration, 3), 0) +
    (isSequence ? SOUNDCHECK_SEQUENCE_GAP_SECONDS : 0);
  if (finalPassDuration > SOUNDCHECK_FINAL_REVEAL_SECONDS) {
    failures.push(`${id}: final progressive pass cannot finish before the shared deadline (${finalPassDuration}s).`);
  }

  if (ids.has(id)) failures.push(`${id}: duplicate question.`);
  ids.add(id);
  if (question.kind !== expectedKind || question.category !== expectedCategory) {
    failures.push(`${id}: family, kind, and category do not match.`);
  }
  if (question.varietyKey !== `${expectedKind}:${expectedFormat}`) {
    failures.push(`${id}: family/format scheduling key is missing or stale.`);
  }
  if (question.patch !== metadata.patch || question.difficulty !== definition.difficulty) {
    failures.push(`${id}: patch or difficulty drifted from the audit.`);
  }
  if (question.image !== undefined) failures.push(`${id}: the answer must stay hidden behind audio.`);
  if (question.prompt !== (isSequence ? "Match both sounds." : "Match the sound.")) {
    failures.push(`${id}: prompt is no longer short and language-light.`);
  }
  if (question.source?.label !== source.label || question.source?.url !== source.url) {
    failures.push(`${id}: source event is missing or stale.`);
  }
  if (
    question.audio?.src !== expectedAudioUrls[0] ||
    JSON.stringify(question.audio?.clips) !== JSON.stringify(expectedAudioUrls) ||
    audioUrls.has(question.audio?.src)
  ) {
    failures.push(`${id}: audio is missing, duplicated, or no longer matches the audited event.`);
  }
  audioUrls.add(question.audio?.src);
  if (
    question.soundcheck?.family !== definition.family ||
    question.soundcheck?.format !== expectedFormat ||
    question.soundcheck?.choiceScope !== expectedChoiceScope ||
    JSON.stringify(question.soundcheck?.clips) !== JSON.stringify(expectedClipMetadata) ||
    question.soundcheck?.audit?.reviewedAt !== SOUNDCHECK_AUDIT.reviewedAt ||
    question.soundcheck?.audit?.clientBuild !== SOUNDCHECK_AUDIT.clientBuild
  ) {
    failures.push(`${id}: sound-event audit metadata is missing or stale.`);
  }
  if (
    clips.some((clip) => clip.duration < 0.5 || clip.duration > 7) ||
    clips.reduce((total, clip) => total + clip.duration, 0) > 7
  ) {
    failures.push(`${id}: clip duration is unsuitable for a rapid sequence round.`);
  }

  if (
    !Array.isArray(question.answers) ||
    question.answers.length !== 4 ||
    new Set(question.answers).size !== 4 ||
    question.answerImageKind !== definition.family
  ) {
    failures.push(`${id}: four same-type visual answers are required.`);
    continue;
  }

  let answerSet;
  if (isSequence) {
    const answerPairs = question.answerImagePairs?.map((pair) =>
      pair.map((image) => assetKey(image, definition.family)),
    );
    const expectedPairs = expectedSequencePairs(definition, index % 4);
    if (
      question.answerImages !== undefined ||
      !Array.isArray(answerPairs) ||
      answerPairs.length !== 4 ||
      answerPairs.some((pair) => pair.length !== 2 || pair.some((key) => !key)) ||
      JSON.stringify(answerPairs) !== JSON.stringify(expectedPairs)
    ) {
      failures.push(`${id}: ordered answer artwork drifted from the reviewed pair set.`);
      continue;
    }
    const usedKeys = [...new Set(answerPairs.flat())].sort();
    if (JSON.stringify(usedKeys) !== JSON.stringify(expectedKeys)) {
      failures.push(`${id}: ordered answers do not use exactly the four reviewed choices.`);
    }
    if (
      !Number.isInteger(question.correctIndex) ||
      question.correctIndex < 0 ||
      question.correctIndex > 3 ||
      JSON.stringify(answerPairs[question.correctIndex]) !==
        JSON.stringify([definition.subject, definition.sequence.subject])
    ) {
      failures.push(`${id}: correctIndex does not point to the audited sound sequence.`);
    }
    answerSet = `sequence:${answerPairs
      .map((pair) => pair.join(">"))
      .sort()
      .join("|")}`;
  } else {
    if (
      question.answerImagePairs !== undefined ||
      !Array.isArray(question.answerImages) ||
      question.answerImages.length !== 4
    ) {
      failures.push(`${id}: a single-sound round requires four individual answer images.`);
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
    }
    if (definition.family === "item" && !shopItemKeys.has(definition.subject)) {
      failures.push(`${id}: the single-item sound source is missing from the Dota shop picker.`);
    }
    answerSet = `single:${[...answerKeys].sort().join("|")}`;
  }
  if (Number.isInteger(question.correctIndex) && question.correctIndex >= 0 && question.correctIndex <= 3) {
    answerPositionCounts[question.correctIndex] += 1;
    const answerNames = question.answers[question.correctIndex].split(" → ");
    if (answerNames.some((answer) => !question.explanation?.includes(answer))) {
      failures.push(`${id}: explanation does not name every sound source.`);
    }
  }
  if (question.correctIndex !== index % 4) failures.push(`${id}: answer-position balancing drifted.`);

  if (answerSets.has(answerSet)) failures.push(`${id}: duplicate four-option sound matchup.`);
  answerSets.add(answerSet);
  familyCounts[definition.family] += 1;
  formatCounts[definition.family][expectedFormat] += 1;
  difficultyCounts[definition.family][definition.difficulty - 1] += 1;
  if (definition.difficulty === 1) learningCounts[definition.family] += 1;
  if (definition.difficulty >= 2) veteranCounts[definition.family] += 1;
}

const expectedEchoCuts = new Map([
  [1, [0.1, 0.22, 1]],
  [2.5, [0.175, 0.425, 2.5]],
  [5, [0.24, 0.56, 5]],
]);

const expectedSoundcheckCuts = new Map([
  [1, [0.055, 0.11, 1]],
  [2.5, [0.12, 0.27, 2.5]],
  [5, [0.12, 0.27, 5]],
]);

for (const [duration, expectedCuts] of expectedSoundcheckCuts) {
  const cuts = Array.from({ length: SOUNDCHECK_REVEAL_STAGES }, (_, stage) =>
    soundcheckCutDuration(duration, stage + 1),
  );
  if (cuts.some((cut, index) => Math.abs(cut - expectedCuts[index]) > 0.000_001)) {
    failures.push(`Soundcheck ${duration}s effect has an invalid progressive cut ${JSON.stringify(cuts)}.`);
  }
}

if (
  soundcheckRevealStage(10_001, 15_000) !== 1 ||
  soundcheckRevealStage(10_000, 15_000) !== 2 ||
  soundcheckRevealStage(7_001, 15_000) !== 2 ||
  soundcheckRevealStage(7_000, 15_000) !== 3
) {
  failures.push("Soundcheck reveal timing no longer reserves seven seconds for the complete final pass.");
}

for (const [duration, expectedCuts] of expectedEchoCuts) {
  const cuts = Array.from({ length: ECHO_HUNT_REVEAL_STAGES }, (_, stage) => echoHuntCutDuration(duration, stage + 1));
  if (
    cuts[0] <= 0 ||
    cuts[0] >= cuts[1] ||
    cuts[1] >= cuts[2] ||
    cuts.some((cut, index) => Math.abs(cut - expectedCuts[index]) > 0.000_001)
  ) {
    failures.push(`Echo Hunt ${duration}s line has an invalid progressive cut ${JSON.stringify(cuts)}.`);
  }
}

if (
  arcadeComponent.includes('data-testid="voice-line-play"') ||
  arcadeComponent.includes("playRoundAudio(true") ||
  !arcadeComponent.includes('data-testid={isSoundcheckRound ? "soundcheck-autoplay" : "echo-autoplay"}') ||
  !arcadeComponent.includes('currentQuestion.prompt : "Whose voice is this?"') ||
  arcadeComponent.includes("Whose voice crossed the river?")
) {
  failures.push(
    "Echo Hunt must use direct copy and autoplay exactly one cut per reveal stage without a replay control.",
  );
}

for (const redundantInstruction of [
  "The last cut plays both in full.",
  "The last cut plays the full sound.",
  "Clues unlock with time",
  "Replay as often as the timer allows.",
]) {
  if (arcadeComponent.includes(redundantInstruction)) {
    failures.push(`Redundant in-round instruction returned: ${redundantInstruction}`);
  }
}

for (const question of questions) {
  if (!ids.has(question.id)) failures.push(`${question.id}: generated question has no reviewed sound definition.`);
}
for (const family of ["ability", "item"]) {
  if (
    familyCounts[family] !== 32 ||
    learningCounts[family] !== 12 ||
    veteranCounts[family] !== 20 ||
    formatCounts[family].single !== 26 ||
    formatCounts[family].sequence !== 6 ||
    JSON.stringify(difficultyCounts[family]) !== JSON.stringify([12, 14, 6])
  ) {
    failures.push(
      `${family}: expected 26 single and 6 sequence rounds split 12 approachable, 14 tricky, and 6 brutal (${familyCounts[family]}, ${JSON.stringify(formatCounts[family])}, ${JSON.stringify(difficultyCounts[family])}).`,
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
    `Validated ${questions.length} Soundcheck rounds and ${progressiveClipCount} three-stage clip profiles (${JSON.stringify(familyCounts)}; formats ${JSON.stringify(formatCounts)}; difficulty ${JSON.stringify(difficultyCounts)}; answer slots ${JSON.stringify(answerPositionCounts)}).`,
  );
}
