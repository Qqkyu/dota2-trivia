import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { answerFeedbackKind, DOTA_FEEDBACK_SOUNDS, dotaFeedbackSoundForKind } from "../src/lib/feedback-sounds.mjs";

const failures = [];
const wrongSound = DOTA_FEEDBACK_SOUNDS.wrong;
const soundPath = fileURLToPath(new URL(`../public${wrongSound.src}`, import.meta.url));
const componentPath = fileURLToPath(new URL("../src/components/queue-arcade.tsx", import.meta.url));

const sound = await readFile(soundPath);
const component = await readFile(componentPath, "utf8");

if (sound.subarray(0, 4).toString("ascii") !== "RIFF" || sound.subarray(8, 12).toString("ascii") !== "WAVE") {
  failures.push("The wrong-answer feedback asset is not a valid RIFF/WAVE file.");
}

const digest = createHash("sha256").update(sound).digest("hex");
if (digest !== wrongSound.sha256) {
  failures.push(`The wrong-answer feedback asset hash changed: expected ${wrongSound.sha256}, received ${digest}.`);
}

if (answerFeedbackKind(true) !== "correct" || answerFeedbackKind(false) !== "wrong") {
  failures.push("Answer results no longer map to the expected feedback kinds.");
}

for (const kind of ["lock", "correct", "start"]) {
  if (dotaFeedbackSoundForKind(kind) !== null) {
    failures.push(`${kind} unexpectedly triggers the Dota failure cue.`);
  }
}

if (dotaFeedbackSoundForKind("wrong") !== wrongSound) {
  failures.push("Wrong answers no longer resolve to the Dota failure cue.");
}

const feedbackCalls = component.match(/playSound\(answerFeedbackKind\(isCorrect\)\)/g) ?? [];
if (feedbackCalls.length !== 1 || component.includes('playSound("wrong")')) {
  failures.push("Round feedback must be emitted once from the finalized answer result, never from transitions.");
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(
  `Validated the Dota wrong-answer cue (${wrongSound.event}, ${wrongSound.durationSeconds}s, ${sound.length} bytes) and result-only trigger.`,
);
