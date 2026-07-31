import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { answerFeedbackKind, DOTA_FEEDBACK_SOUNDS, dotaFeedbackSoundForKind } from "../src/lib/feedback-sounds.mjs";

const failures = [];
const correctSound = DOTA_FEEDBACK_SOUNDS.correct;
const wrongSound = DOTA_FEEDBACK_SOUNDS.wrong;
const componentPath = fileURLToPath(new URL("../src/components/queue-arcade.tsx", import.meta.url));

const component = await readFile(componentPath, "utf8");

for (const [kind, definition] of Object.entries(DOTA_FEEDBACK_SOUNDS)) {
  const soundPath = fileURLToPath(new URL(`../public${definition.src}`, import.meta.url));
  const sound = await readFile(soundPath);
  if (sound.subarray(0, 4).toString("ascii") !== "RIFF" || sound.subarray(8, 12).toString("ascii") !== "WAVE") {
    failures.push(`The ${kind}-answer feedback asset is not a valid RIFF/WAVE file.`);
  }

  const digest = createHash("sha256").update(sound).digest("hex");
  if (digest !== definition.sha256) {
    failures.push(`The ${kind}-answer feedback asset hash changed: expected ${definition.sha256}, received ${digest}.`);
  }
}

if (answerFeedbackKind(true) !== "correct" || answerFeedbackKind(false) !== "wrong") {
  failures.push("Answer results no longer map to the expected feedback kinds.");
}

for (const kind of ["lock", "start"]) {
  if (dotaFeedbackSoundForKind(kind) !== null) {
    failures.push(`${kind} unexpectedly triggers a Dota answer-result cue.`);
  }
}

if (dotaFeedbackSoundForKind("correct") !== correctSound) {
  failures.push("Correct answers no longer resolve to the Dota success cue.");
}
if (dotaFeedbackSoundForKind("wrong") !== wrongSound) {
  failures.push("Wrong answers no longer resolve to the Dota failure cue.");
}
if (correctSound.gain < 0.15 || correctSound.gain > 0.3 || wrongSound.gain !== 1) {
  failures.push("Feedback normalization no longer keeps the louder success sting in a safe range.");
}

const feedbackCalls = component.match(/playSound\(answerFeedbackKind\(isCorrect\)\)/g) ?? [];
if (
  feedbackCalls.length !== 1 ||
  component.includes('playSound("correct")') ||
  component.includes('playSound("wrong")')
) {
  failures.push("Round feedback must be emitted once from the finalized answer result, never from transitions.");
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(
  `Validated Dota answer-result cues (${correctSound.source} / ${wrongSound.source}), normalized playback, and the result-only trigger.`,
);
