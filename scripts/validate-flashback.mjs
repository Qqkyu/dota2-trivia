#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { flashbackOrderCorrectAnswerKey, isPlayableFlashbackQuestion } from "../src/lib/flashback.mjs";
import {
  FRESH_ROUND_MIN_REMAINING_MS,
  shouldShowEntryWaitLessons,
  shouldWaitForNextRoundOnEntry,
} from "../src/lib/arcade-entry.mjs";
import { DOTA_SHOP_SEARCH_PLACEHOLDER, ENTRY_WAIT_HINT, ENTRY_WAIT_TIPS } from "../src/lib/entry-wait-tips.mjs";

const questions = JSON.parse(
  await readFile(path.join(process.cwd(), "src", "data", "flashback-questions.json"), "utf8"),
);
const arcadeSource = await readFile(path.join(process.cwd(), "src", "components", "queue-arcade.tsx"), "utf8");
const failures = [];
const record = (ok, message) => {
  if (!ok) failures.push(message);
};

record(questions.length >= 20, `Flashback is too thin (${questions.length}).`);
record(new Set(questions.map((question) => question.id)).size === questions.length, "Flashback IDs are not unique.");
record(questions.every(isPlayableFlashbackQuestion), "A Flashback question failed the playable contract.");
record(
  questions.every((question) => question.image?.src?.startsWith("https://")),
  "A Flashback prompt has no artwork.",
);

const FLASHBACK_ART = {
  "flashback:dota2-release-year": "dota2_logo_symbol",
  "flashback:ti1-year": "items/aegis",
  "flashback:reborn-year": "dota2_logo_horiz",
  "flashback:patch-700-year": "heroes/monkey_king",
  "flashback:ti10-year": "items/aegis",
  "flashback:og-first-ti-year": "team_logos/2586976",
  "flashback:techies-year": "heroes/techies",
  "flashback:ti14-year": "2314350571781870059",
  "flashback:ti9-year": "team_logos/2586976",
  "flashback:ti13-year": "team_logos/2163",
  "flashback:ti1-winner": "team_logos/36",
  "flashback:ti3-winner": "team_logos/111474",
  "flashback:ti5-winner": "team_logos/39",
  "flashback:ti6-winner": "team_logos/1838315",
  "flashback:ti8-winner": "team_logos/2586976",
  "flashback:ti10-winner": "1839179120711951766",
  "flashback:ti14-winner": "2314350571781870059",
  "flashback:ti1-city": "items/aegis",
  "flashback:back-to-back": "team_logos/2586976",
  "flashback:dota-creator": "items/cyclone",
  "flashback:first-ti-winners-order": "items/aegis",
  "flashback:later-ti-winners-order": "items/aegis",
  "flashback:ti-cities-order": "items/aegis",
  "flashback:engine-history-order": "dota2_logo_symbol",
};
record(
  questions.every((question) => question.image?.src?.includes(FLASHBACK_ART[question.id] ?? "missing")) &&
    Object.keys(FLASHBACK_ART).length === questions.length,
  "A Flashback prompt still uses artwork that does not belong to the question.",
);
record(
  questions
    .filter((question) => question.kind === "flashback-order")
    .every((question) =>
      question.flashback.cards.every(
        (card) =>
          card.image.includes("team_logos/") ||
          card.image.includes("items/aegis") ||
          card.image.includes("items/cyclone") ||
          card.image.includes("dota2_logo_"),
      ),
    ),
  "A Flashback order card still uses an unrelated hero portrait.",
);
record(
  questions.some((question) => question.kind === "flashback-year") &&
    questions.some((question) => question.kind === "flashback-choice") &&
    questions.some((question) => question.kind === "flashback-order"),
  "Flashback lost a year, choice, or order loop.",
);
record(
  questions
    .filter((question) => question.kind === "flashback-order")
    .every((question) => flashbackOrderCorrectAnswerKey(question)?.startsWith("order-v1:")),
  "Flashback order questions no longer produce a keyed answer.",
);
record(
  questions.every(
    (question) =>
      !question.prompt.toLowerCase().includes(String(question.answers[question.correctIndex]).toLowerCase()) ||
      question.kind === "flashback-year",
  ),
  "A Flashback prompt restates its exact answer.",
);

const now = 1_000_000;
record(
  shouldWaitForNextRoundOnEntry({ phase: "reveal", answerDeadline: now + 15_000 }, now) &&
    shouldWaitForNextRoundOnEntry({ phase: "answering", answerDeadline: now + 8_000 }, now) &&
    shouldWaitForNextRoundOnEntry(
      { phase: "answering", answerDeadline: now + FRESH_ROUND_MIN_REMAINING_MS - 1 },
      now,
    ) &&
    !shouldWaitForNextRoundOnEntry({ phase: "answering", answerDeadline: now + 15_000 }, now),
  "Players can still join a round that already started.",
);
record(
  arcadeSource.includes("entryWaitRoundIdRef.current = result.snapshot.round.id") &&
    !arcadeSource.includes("if (shouldWaitForNextRoundOnEntry(result.snapshot.round"),
  "First Play no longer always waits for the next full question.",
);
record(
  ENTRY_WAIT_HINT.includes("full question") &&
    shouldShowEntryWaitLessons(3_000) &&
    !shouldShowEntryWaitLessons(2_999) &&
    arcadeSource.includes('entryWaitMode === "lessons"') &&
    arcadeSource.includes('entryWaitMode === "silent"') &&
    !arcadeSource.includes("Starting now.") &&
    ENTRY_WAIT_TIPS.length === 3 &&
    ENTRY_WAIT_TIPS.every((tip) => tip.body),
  "The wait screen still swaps layout mid-wait.",
);
record(
  DOTA_SHOP_SEARCH_PLACEHOLDER === "Search Items" &&
    arcadeSource.includes("DOTA_SHOP_SEARCH_PLACEHOLDER") &&
    arcadeSource.includes('data-testid="shopkeeper-search-field"'),
  "The shop lost the Dota Search Items field.",
);

if (failures.length) throw new Error(failures.join("\n"));
console.log(`Validated ${questions.length} Flashback prompts and the full-question entry gate.`);
