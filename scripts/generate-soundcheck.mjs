#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SOUNDCHECK_ASSET_ROOT,
  SOUNDCHECK_AUDIT,
  SOUNDCHECK_DEFINITIONS,
  soundcheckAudioUrl,
  soundcheckSource,
} from "./soundcheck-audit.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = join(root, "src", "data", "soundcheck-questions.json");
const metadata = JSON.parse(await readFile(join(root, "src", "data", "trivia-meta.generated.json"), "utf8"));
const ASSET_ROOT = "https://cdn.cloudflare.steamstatic.com";

if (metadata.patch !== SOUNDCHECK_AUDIT.patch) {
  throw new Error(
    `Soundcheck audit targets ${SOUNDCHECK_AUDIT.patch}, but trivia metadata targets ${metadata.patch}. Re-audit the sounds before generating a new patch.`,
  );
}

const [abilitiesResponse, itemsResponse] = await Promise.all([
  fetch("https://api.opendota.com/api/constants/abilities"),
  fetch("https://api.opendota.com/api/constants/items"),
]);
if (!abilitiesResponse.ok || !itemsResponse.ok) {
  throw new Error(`Could not load OpenDota constants (${abilitiesResponse.status}, ${itemsResponse.status}).`);
}
const [abilities, items] = await Promise.all([abilitiesResponse.json(), itemsResponse.json()]);

function assetUrl(path) {
  if (typeof path !== "string" || !path.startsWith("/apps/dota2/images/")) {
    throw new Error(`Invalid Dota asset path: ${String(path)}`);
  }
  return `${ASSET_ROOT}${path.split("?")[0]}`;
}

function eventBody(contents, event) {
  const escapedEvent = event.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const assignment = new RegExp(`^[\\t ]*${escapedEvent}[\\t ]*=`, "m").exec(contents);
  if (!assignment) return null;

  const openingBrace = contents.indexOf("{", assignment.index + assignment[0].length);
  if (openingBrace < 0) return null;

  let depth = 0;
  for (let index = openingBrace; index < contents.length; index += 1) {
    if (contents[index] === "{") depth += 1;
    if (contents[index] !== "}") continue;
    depth -= 1;
    if (depth === 0) return contents.slice(openingBrace + 1, index);
  }
  return null;
}

const eventFiles = [...new Set(SOUNDCHECK_DEFINITIONS.map((definition) => definition.eventFile))];
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
  SOUNDCHECK_DEFINITIONS.map(async (definition) => {
    const body = eventBody(eventFileContents.get(definition.eventFile) ?? "", definition.event);
    const sourceVsnd = definition.audioPath.replace(/\.wav$/, ".vsnd");
    const eventSounds = [...(body?.matchAll(/"([^"]+\.vsnd)"/g) ?? [])].map((match) => match[1]);
    const eventDuration = Number(body?.match(/vsnd_duration\s*=\s*([0-9.]+)/)?.[1]);
    if (!body || !eventSounds.includes(sourceVsnd)) {
      throw new Error(
        `${definition.family}:${definition.subject} no longer maps ${definition.event} to ${sourceVsnd} (found ${eventSounds.join(", ") || "no sound"}).`,
      );
    }
    if (!Number.isFinite(eventDuration) || Math.abs(eventDuration - definition.duration) > 0.000001) {
      throw new Error(
        `${definition.family}:${definition.subject} duration drifted from ${definition.duration} to ${String(eventDuration)}.`,
      );
    }

    const response = await fetch(soundcheckAudioUrl(definition), { method: "HEAD" });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/")) {
      throw new Error(`${definition.family}:${definition.subject} has no browser-ready audited audio.`);
    }
  }),
);

const questions = SOUNDCHECK_DEFINITIONS.map((definition, index) => {
  const records = definition.family === "ability" ? abilities : items;
  const answerKeys = [...definition.distractors];
  answerKeys.splice(index % 4, 0, definition.subject);
  const answerRecords = answerKeys.map((key) => {
    const record = records[key];
    if (!record?.dname || !record.img) throw new Error(`Missing ${definition.family} ${key}.`);
    return record;
  });
  const correctIndex = answerKeys.indexOf(definition.subject);
  const answerKind = definition.family === "ability" ? "ability" : "item";
  const subjectName = answerRecords[correctIndex].dname;

  return {
    id: `soundcheck-${definition.family}:${definition.subject}`,
    kind: `soundcheck-${definition.family}`,
    category: definition.family === "ability" ? "Abilities" : "Items",
    difficulty: definition.difficulty,
    eyebrow: `Soundcheck · ${definition.family === "ability" ? "Ability sound" : "Item activation"}`,
    prompt: `Match the ${definition.family} sound.`,
    answers: answerRecords.map((record) => record.dname),
    answerImages: answerRecords.map((record) => assetUrl(record.img)),
    answerImageKind: answerKind,
    correctIndex,
    explanation: `That was the ${definition.family === "ability" ? "gameplay" : "activation"} sound for ${subjectName}.`,
    audio: {
      src: soundcheckAudioUrl(definition),
    },
    soundcheck: {
      family: definition.family,
      event: definition.event,
      eventFile: definition.eventFile,
      duration: definition.duration,
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
