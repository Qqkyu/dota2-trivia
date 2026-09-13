import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { answerFeedbackKind, DOTA_FEEDBACK_SOUNDS, dotaFeedbackSoundForKind } from "../src/lib/feedback-sounds.mjs";
import { wavChannels } from "./lib/native-audio-output.mjs";

const failures = [];
const expectedKinds = ["lock", "correct", "wrong", "start"];
const expectedEvents = {
  lock: "ui_generic_button_click",
  correct: "General.Coins",
  wrong: "General.InvalidTarget_Invulnerable",
  start: "ui.matchmaking_find",
};
const expectedGains = {
  lock: [0.8],
  correct: [1],
  wrong: [1],
  start: [0.6, 1],
};
const seenSources = new Set();
let clipCount = 0;

if (JSON.stringify(Object.keys(DOTA_FEEDBACK_SOUNDS)) !== JSON.stringify(expectedKinds)) {
  failures.push("Every runtime UI cue must have one explicit Dota sound definition.");
}

for (const [kind, definition] of Object.entries(DOTA_FEEDBACK_SOUNDS)) {
  if (
    definition.event !== expectedEvents[kind] ||
    JSON.stringify(definition.clips.map((clip) => clip.gain)) !== JSON.stringify(expectedGains[kind])
  ) {
    failures.push(`${kind} no longer mirrors its reviewed Dota event and gain structure.`);
  }

  if (dotaFeedbackSoundForKind(kind) !== definition) {
    failures.push(`${kind} no longer resolves to its Dota UI cue.`);
  }

  for (const clip of definition.clips) {
    clipCount += 1;
    if (seenSources.has(clip.src)) failures.push(`${clip.src} is reused by multiple UI cue definitions.`);
    seenSources.add(clip.src);

    const soundPath = fileURLToPath(new URL(`../public${clip.src}`, import.meta.url));
    const sound = await readFile(soundPath);
    if (sound.subarray(0, 4).toString("ascii") !== "RIFF" || sound.subarray(8, 12).toString("ascii") !== "WAVE") {
      failures.push(`The ${kind} feedback asset ${clip.src} is not a valid RIFF/WAVE file.`);
    }

    const digest = createHash("sha256").update(sound).digest("hex");
    if (digest !== clip.sha256) {
      failures.push(`The ${kind} feedback asset hash changed: expected ${clip.sha256}, received ${digest}.`);
    }
  }
}

if (clipCount !== 5 || dotaFeedbackSoundForKind("not-a-cue") !== null) {
  failures.push("The reviewed four-event, five-clip Dota UI sound set changed unexpectedly.");
}

if (answerFeedbackKind(true) !== "correct" || answerFeedbackKind(false) !== "wrong") {
  failures.push("Answer results no longer map to the expected feedback kinds.");
}

const originalClick = await readFile(
  new URL("../public/assets/dota2/sounds/panorama_generic_button_click_01.wav", import.meta.url),
);
if (
  createHash("sha256").update(originalClick).digest("hex") !==
  "10abf2f53e7b3f9af78b843cac79eaef053c463663a5f099dcd5c538b2d62fe0"
) {
  failures.push("The original pick sound used as the native-output reference changed.");
}
const originalChannels = wavChannels(originalClick);
const paddedChannels = wavChannels(
  await readFile(new URL(`../public${DOTA_FEEDBACK_SOUNDS.lock.clips[0].src}`, import.meta.url)),
);
for (const [channel, original] of originalChannels.entries()) {
  const padded = paddedChannels[channel];
  if (
    !padded ||
    padded.length !== original.length + 882 ||
    padded.slice(0, 882).some((value) => value !== 0) ||
    original.some((value, index) => value !== padded[index + 882])
  ) {
    failures.push("The runtime pick must preserve every original sample after exactly 20 ms of silence.");
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(
  "Validated four Dota UI events, five runtime WAVs, and the lossless pick lead-in. Native output is checked by pnpm check:sounds.",
);
