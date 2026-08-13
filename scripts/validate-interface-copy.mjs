#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { revealCallout, sessionHonorific } from "../src/lib/dota-flavor.mjs";

const root = process.cwd();
const [arcadeSource, publicQuestionSource, publicQuestionType, steamAvatarSource, profileSource] = await Promise.all(
  [
    "src/components/queue-arcade.tsx",
    "src/lib/public-question.mjs",
    "src/lib/public-question.ts",
    "src/components/steam-avatar.tsx",
    "src/app/profile/page.tsx",
  ].map((file) => readFile(path.join(root, file), "utf8")),
);

const failures = [];
const record = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const phrase of [
  "Trust the silhouette, palette, and pose.",
  "Later clues cost",
  "No talents or upgrades unless stated",
  "shopkeeperRoundNote",
  "summaryPatch",
]) {
  record(!arcadeSource.includes(phrase), `Redundant live-round copy returned: ${phrase}`);
}

record(
  !arcadeSource.includes("currentQuestion.patch"),
  "The persistent patch badge is being repeated inside an individual question.",
);
record(
  arcadeSource.includes("{gameInfo.label} · {gameInfo.contentLabel}"),
  "The single persistent game and patch label disappeared from the header.",
);
record(
  arcadeSource.includes("Correct now:") && arcadeSource.includes("A–D or 1–4"),
  "Useful live scoring or keyboard guidance was removed with the redundant copy.",
);
record(
  !publicQuestionSource.includes("patch: question.patch") && !publicQuestionType.includes("patch: string;"),
  "The server still sends a per-question patch field that the interface no longer uses.",
);
record(
  steamAvatarSource.includes("onError") && steamAvatarSource.includes("steam-avatar-fallback"),
  "A missing or failed Steam avatar no longer falls back to a local placeholder.",
);
record(
  !profileSource.includes("Ability values") &&
    !profileSource.includes("Recent answers") &&
    !profileSource.includes("stage ${") &&
    !profileSource.includes("round ${round.roundNumber"),
  "The profile page returned to scheduler names, a recent-answer log, or raw round numbers.",
);

record(
  revealCallout({ correct: true, timedOut: false, firstBlood: true, streak: 1 }) === "First Blood" &&
    revealCallout({ correct: true, timedOut: false, firstBlood: false, streak: 3 }) === "Killing Spree" &&
    revealCallout({ correct: true, timedOut: false, firstBlood: false, streak: 5 }) === "Rampage" &&
    revealCallout({ correct: true, timedOut: false, firstBlood: false, streak: 8 }) === "Godlike" &&
    revealCallout({ correct: false, timedOut: false, firstBlood: false, streak: 0 }) === "Denied" &&
    revealCallout({ correct: false, timedOut: true, firstBlood: false, streak: 0 }) === "Time expired" &&
    sessionHonorific(8, 10) === "Well Played." &&
    sessionHonorific(1, 10) === "One more queue",
  "Dota fight callouts or session honorifics drifted.",
);

if (failures.length) throw new Error(failures.join("\n"));

console.log("Validated lean live-round copy with one persistent patch label and actionable guidance intact.");
