import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { answerFeedbackKind, DOTA_FEEDBACK_SOUNDS, dotaFeedbackSoundForKind } from "../src/lib/feedback-sounds.mjs";

const failures = [];
const componentPath = fileURLToPath(new URL("../src/components/queue-arcade.tsx", import.meta.url));
const component = await readFile(componentPath, "utf8");
const expectedKinds = ["lock", "correct", "wrong", "start"];
const expectedEvents = {
  lock: "ui_generic_button_click",
  correct: "Legacy challenge_success",
  wrong: "General.InvalidTarget_Invulnerable",
  start: "ui.matchmaking_find",
};
const expectedGains = {
  lock: [0.8],
  correct: [0.22],
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

const resultCalls = component.match(/playSound\(answerFeedbackKind\(isCorrect\)\)/g) ?? [];
const startCalls = component.match(/playSound\("start"\)/g) ?? [];
const lockCalls = component.match(/playSound\("lock"\)/g) ?? [];
if (
  resultCalls.length !== 1 ||
  startCalls.length !== 1 ||
  lockCalls.length !== 2 ||
  component.includes('playSound("correct")') ||
  component.includes('playSound("wrong")')
) {
  failures.push("UI cues are no longer confined to their reviewed start, lock, and finalized-result triggers.");
}

if (/AudioContext|createOscillator|createGain/.test(component)) {
  failures.push("A synthesized Web Audio cue remains in the arcade runtime.");
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Validated four Dota UI events, five original WAVs, exact event gains, and zero synthesized runtime cues.");
