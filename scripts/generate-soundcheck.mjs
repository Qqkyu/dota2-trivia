#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SOUNDCHECK_ASSET_ROOT,
  SOUNDCHECK_AUDIT,
  SOUNDCHECK_DEFINITIONS,
  soundcheckAudioUrl,
  soundcheckClips,
  soundcheckEventDetails,
  soundcheckPcmPreviewAudit,
  soundcheckSharedAudioAlternatives,
  soundcheckSource,
} from "./soundcheck-audit.mjs";
import { soundcheckClipTiming } from "../src/lib/soundcheck.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = join(root, "src", "data", "soundcheck-questions.json");
const metadata = JSON.parse(await readFile(join(root, "src", "data", "trivia-meta.generated.json"), "utf8"));
const ASSET_ROOT = "https://cdn.cloudflare.steamstatic.com";

if (metadata.patch !== SOUNDCHECK_AUDIT.patch) {
  throw new Error(
    `Soundcheck audit targets ${SOUNDCHECK_AUDIT.patch}, but trivia metadata targets ${metadata.patch}. Re-audit the sounds before generating a new patch.`,
  );
}

const [abilitiesResponse, itemsResponse, heroAbilitiesResponse] = await Promise.all([
  fetch("https://api.opendota.com/api/constants/abilities"),
  fetch("https://api.opendota.com/api/constants/items"),
  fetch("https://api.opendota.com/api/constants/hero_abilities"),
]);
if (!abilitiesResponse.ok || !itemsResponse.ok || !heroAbilitiesResponse.ok) {
  throw new Error(
    `Could not load OpenDota constants (${abilitiesResponse.status}, ${itemsResponse.status}, ${heroAbilitiesResponse.status}).`,
  );
}
const [abilities, items, heroAbilities] = await Promise.all([
  abilitiesResponse.json(),
  itemsResponse.json(),
  heroAbilitiesResponse.json(),
]);
const abilityOwners = new Map();
for (const [hero, data] of Object.entries(heroAbilities)) {
  for (const ability of data.abilities ?? []) {
    const owners = abilityOwners.get(ability) ?? [];
    owners.push(hero);
    abilityOwners.set(ability, owners);
  }
}

function assetUrl(path) {
  if (typeof path !== "string" || !path.startsWith("/apps/dota2/images/")) {
    throw new Error(`Invalid Dota asset path: ${String(path)}`);
  }
  return `${ASSET_ROOT}${path.split("?")[0]}`;
}

function hasActiveBehavior(record) {
  const behaviors = Array.isArray(record?.behavior) ? record.behavior : [record?.behavior];
  return behaviors.some((behavior) => typeof behavior === "string" && behavior !== "Passive" && behavior !== "Hidden");
}

const auditedClips = SOUNDCHECK_DEFINITIONS.flatMap((definition) =>
  soundcheckClips(definition).map((clip) => ({ definition, clip })),
);
const eventFiles = [...new Set(auditedClips.map(({ clip }) => clip.eventFile))];
const eventFileContents = new Map(
  await Promise.all(
    eventFiles.map(async (eventFile) => {
      const response = await fetch(`${SOUNDCHECK_ASSET_ROOT}/${eventFile}`);
      if (!response.ok) throw new Error(`Could not load audited sound events ${eventFile}: HTTP ${response.status}.`);
      return [eventFile, await response.text()];
    }),
  ),
);

await Promise.all(
  auditedClips.map(async ({ definition, clip }) => {
    const event = soundcheckEventDetails(eventFileContents.get(clip.eventFile) ?? "", clip.event);
    const sourceVsnd = clip.audioPath.replace(/\.wav$/, ".vsnd");
    const eventSounds = event?.audioPaths ?? [];
    const eventDuration = event?.duration;
    soundcheckClipTiming(clip);
    if (!event || !eventSounds.includes(sourceVsnd)) {
      throw new Error(
        `${definition.family}:${clip.subject} no longer maps ${clip.event} to ${sourceVsnd} (found ${eventSounds.join(", ") || "no sound"}).`,
      );
    }
    if (!Number.isFinite(eventDuration) || Math.abs(eventDuration - clip.duration) > 0.000001) {
      throw new Error(
        `${definition.family}:${clip.subject} duration drifted from ${clip.duration} to ${String(eventDuration)}.`,
      );
    }
  }),
);

const uniqueAudioClips = new Map(auditedClips.map(({ clip }) => [soundcheckAudioUrl(clip), clip]));
const browserAudioResults = await Promise.all(
  [...uniqueAudioClips.entries()].map(async ([url, clip]) => {
    const response = await fetch(url);
    if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/")) {
      return { error: `${clip.subject} has no browser-ready audited audio (${response.status} ${url}).` };
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 128) return { error: `${clip.subject} returned an empty browser audio asset (${url}).` };
    const preview = soundcheckPcmPreviewAudit(bytes, clip);
    if (Math.abs(preview.duration - clip.duration) > 0.02 || preview.stages.some((stage) => stage.rms < 0.0001)) {
      return { error: `${clip.subject} has a silent preview or a source-duration mismatch (${url}).` };
    }
    return { digest: createHash("sha256").update(bytes).digest("hex"), url };
  }),
);
const browserAudioFailures = browserAudioResults.flatMap((result) => (result.error ? [result.error] : []));
if (browserAudioFailures.length) throw new Error(browserAudioFailures.join("\n"));
const browserAudioDigests = new Map(browserAudioResults.map((result) => [result.url, result.digest]));
const digestOwners = new Map();
for (const { clip } of auditedClips) {
  const digest = browserAudioDigests.get(soundcheckAudioUrl(clip));
  const owners = digestOwners.get(digest) ?? new Set();
  owners.add(clip.subject);
  digestOwners.set(digest, owners);
}
for (const [digest, owners] of digestOwners) {
  if (owners.size > 1) {
    throw new Error(`Different answers share the same browser audio (${digest}: ${[...owners].join(", ")}).`);
  }
}

const questions = SOUNDCHECK_DEFINITIONS.map((definition, index) => {
  const records = definition.family === "ability" ? abilities : items;
  const choiceKeys = [definition.subject, ...definition.distractors];
  const choiceRecords = choiceKeys.map((key) => {
    const record = records[key];
    if (!record?.dname || !record.img) throw new Error(`Missing ${definition.family} ${key}.`);
    return record;
  });
  if (definition.difficulty >= 2 && definition.family === "ability") {
    const owners = choiceKeys.map((key) => abilityOwners.get(key));
    const ownerKeys = new Set(owners.flat());
    if (
      owners.some((owner) => owner?.length !== 1) ||
      ownerKeys.size !== 1 ||
      choiceRecords.some((record) => !hasActiveBehavior(record))
    ) {
      throw new Error(
        `${definition.subject}: higher-tier ability choices must all be active abilities from one hero (${choiceKeys.join(", ")}).`,
      );
    }
  }
  if (
    definition.difficulty >= 2 &&
    definition.family === "item" &&
    choiceRecords.some((record) => !hasActiveBehavior(record))
  ) {
    const inactiveItems = choiceKeys.filter((_, answerIndex) => !hasActiveBehavior(choiceRecords[answerIndex]));
    throw new Error(
      `${definition.subject}: every higher-tier item choice must have an active behavior (${inactiveItems.join(", ")} does not).`,
    );
  }

  const clips = soundcheckClips(definition);
  for (const clip of clips) {
    const ambiguousChoices = soundcheckSharedAudioAlternatives(clip.subject, choiceKeys);
    if (ambiguousChoices.length) {
      throw new Error(
        `${definition.subject}: ${clip.subject} shares its audited cue with ${ambiguousChoices.join(", ")}.`,
      );
    }
  }
  const isSequence = clips.length === 2;
  if (isSequence !== (definition.difficulty === 3)) {
    throw new Error(`${definition.subject}: only brutal Soundcheck rounds may contain an ordered sequence.`);
  }

  const recordByKey = new Map(choiceKeys.map((key, answerIndex) => [key, choiceRecords[answerIndex]]));
  let answers;
  let answerImages;
  let answerImagePairs;
  let correctIndex;

  if (isSequence) {
    const secondSubject = clips[1].subject;
    const alternatives = definition.distractors.filter((key) => key !== secondSubject);
    if (!definition.distractors.includes(secondSubject) || alternatives.length !== 2) {
      throw new Error(`${definition.subject}: the second sound must be one of exactly three reviewed distractors.`);
    }
    const correctPair = [definition.subject, secondSubject];
    const answerPairs = [
      [definition.subject, alternatives[0]],
      [alternatives[1], secondSubject],
      [secondSubject, definition.subject],
    ];
    correctIndex = index % 4;
    answerPairs.splice(correctIndex, 0, correctPair);
    answers = answerPairs.map((pair) => pair.map((key) => recordByKey.get(key).dname).join(" → "));
    answerImagePairs = answerPairs.map((pair) => pair.map((key) => assetUrl(recordByKey.get(key).img)));
  } else {
    const answerKeys = [...definition.distractors];
    answerKeys.splice(index % 4, 0, definition.subject);
    const answerRecords = answerKeys.map((key) => recordByKey.get(key));
    answers = answerRecords.map((record) => record.dname);
    answerImages = answerRecords.map((record) => assetUrl(record.img));
    correctIndex = answerKeys.indexOf(definition.subject);
  }

  const answerKind = definition.family === "ability" ? "ability" : "item";
  const subjectName = recordByKey.get(definition.subject).dname;
  const secondSubjectName = isSequence ? recordByKey.get(clips[1].subject).dname : null;

  return {
    id: `soundcheck-${definition.family}:${definition.subject}`,
    kind: `soundcheck-${definition.family}`,
    varietyKey: `soundcheck-${definition.family}:${isSequence ? "sequence" : "single"}`,
    category: definition.family === "ability" ? "Abilities" : "Items",
    difficulty: definition.difficulty,
    eyebrow: isSequence
      ? "Soundcheck · Ordered pair"
      : `Soundcheck · ${definition.family === "ability" ? "Ability sound" : "Item sound"}`,
    prompt: isSequence ? "Match both sounds." : "Match the sound.",
    answers,
    ...(answerImages ? { answerImages } : {}),
    ...(answerImagePairs ? { answerImagePairs } : {}),
    answerImageKind: answerKind,
    correctIndex,
    explanation: isSequence
      ? `The sequence was ${subjectName}, then ${secondSubjectName}.`
      : `That was the gameplay sound for ${subjectName}.`,
    audio: {
      src: soundcheckAudioUrl(clips[0]),
      clips: clips.map(soundcheckAudioUrl),
    },
    soundcheck: {
      family: definition.family,
      format: isSequence ? "sequence" : "single",
      choiceScope:
        definition.difficulty === 1
          ? "recognizable"
          : isSequence
            ? "ordered-pair"
            : definition.family === "ability"
              ? "same-hero"
              : "active-items",
      clips: clips.map((clip) => ({
        subject: clip.subject,
        event: clip.event,
        eventFile: clip.eventFile,
        duration: clip.duration,
        ...(clip.startSeconds !== undefined ? { startSeconds: clip.startSeconds } : {}),
        audioSha256: browserAudioDigests.get(soundcheckAudioUrl(clip)),
      })),
      audit: {
        reviewedAt: SOUNDCHECK_AUDIT.reviewedAt,
        clientBuild: SOUNDCHECK_AUDIT.clientBuild,
      },
    },
    source: soundcheckSource(definition),
    patch: metadata.patch,
  };
});

await writeFile(outputPath, `${JSON.stringify(questions, null, 2)}\n`);
console.log(
  `Generated ${questions.length} audited Soundcheck questions for ${metadata.patch} (client build ${SOUNDCHECK_AUDIT.clientBuild}).`,
);
