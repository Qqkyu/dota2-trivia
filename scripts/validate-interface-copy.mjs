#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const [arcadeSource, publicQuestionSource, publicQuestionType] = await Promise.all(
  ["src/components/queue-arcade.tsx", "src/lib/public-question.mjs", "src/lib/public-question.ts"].map((file) =>
    readFile(path.join(root, file), "utf8"),
  ),
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

if (failures.length) throw new Error(failures.join("\n"));

console.log("Validated lean live-round copy with one persistent patch label and actionable guidance intact.");
