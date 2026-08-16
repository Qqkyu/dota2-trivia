#!/usr/bin/env node

import { existsSync } from "node:fs";
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
record(
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].every((ti) =>
    questions.some((question) => question.id === `flashback:ti${ti}-winner`),
  ),
  "Flashback is missing a finished International winner.",
);
record(new Set(questions.map((question) => question.id)).size === questions.length, "Flashback IDs are not unique.");
record(questions.every(isPlayableFlashbackQuestion), "A Flashback question failed the playable contract.");
record(
  questions.every(
    (question) => question.image?.src?.startsWith("https://") || question.image?.src?.startsWith("/arcade/flashback/"),
  ),
  "A Flashback prompt has no artwork.",
);

const FLASHBACK_ART = {
  "flashback:dota2-release-year": "dota2_logo_symbol",
  "flashback:ti1-year": "ti1-gamescom.jpg",
  "flashback:reborn-year": "dota2_logo_horiz",
  "flashback:patch-700-year": "heroes/monkey_king",
  "flashback:ti10-year": "ti10-mark.png",
  "flashback:og-first-ti-year": "ti8-vancouver.jpg",
  "flashback:techies-year": "heroes/techies",
  "flashback:ti14-year": "ti14-mark.png",
  "flashback:ti9-year": "ti-wordmark.png",
  "flashback:ti13-year": "ti13-mark.jpg",
  "flashback:ti1-winner": "ti1-gamescom.jpg",
  "flashback:ti2-winner": "ti-seattle.jpg",
  "flashback:ti3-winner": "ti-seattle.jpg",
  "flashback:ti4-winner": "ti-wordmark.png",
  "flashback:ti5-winner": "ti5-keyarena.jpg",
  "flashback:ti6-winner": "ti-wordmark.png",
  "flashback:ti7-winner": "ti5-keyarena.jpg",
  "flashback:ti8-winner": "ti8-vancouver.jpg",
  "flashback:ti9-winner": "ti-wordmark.png",
  "flashback:ti10-winner": "ti10-mark.png",
  "flashback:ti11-winner": "ti11-mark.jpg",
  "flashback:ti12-winner": "ti12-mark.png",
  "flashback:ti13-winner": "ti13-mark.jpg",
  "flashback:ti14-winner": "ti14-mark.png",
  "flashback:ti1-city": "ti1-gamescom.jpg",
  "flashback:back-to-back": "ti-wordmark.png",
  "flashback:dota-creator": "dota2_logo_symbol",
  "flashback:first-ti-winners-order": "ti-wordmark.png",
  "flashback:later-ti-winners-order": "ti-wordmark.png",
  "flashback:ti-cities-order": "ti-wordmark.png",
  "flashback:engine-history-order": "dota2_logo_symbol",
  "flashback:patch-733-year": "map-overview.webp",
  "flashback:patch-736-year": "dota2_logo_symbol",
  "flashback:neutrals-year": "outlanders-mark.png",
  "flashback:shard-year": "aghanims_shard",
  "flashback:bounty-runes-year": "items/bottle",
  "flashback:underlord-year": "heroes/abyssal_underlord",
  "flashback:first-arcana-year": "heroes/lina",
  "flashback:diretide-year": "items/aegis",
  "flashback:first-major-year": "dota2_logo_symbol",
  "flashback:last-wc3-hero": "items/cyclone",
  "flashback:first-original-hero": "dota2_logo_symbol",
  "flashback:universal-attribute": "map-overview.webp",
  "flashback:giff-diretide": "items/aegis",
  "flashback:pendragon-allstars": "dota2_logo_symbol",
  "flashback:scythe-old-name": "items/sheepstick",
  "flashback:side-shop": "items/boots",
  "flashback:patch-systems-order": "dota2_logo_symbol",
  "flashback:heroes-added-order": "dota2_logo_symbol",
  "flashback:valve-side-order": "dota2_logo_symbol",
};
record(
  questions.every((question) => question.image?.src?.includes(FLASHBACK_ART[question.id] ?? "missing")) &&
    Object.keys(FLASHBACK_ART).length === questions.length,
  "A Flashback prompt still uses artwork that does not belong to the question.",
);
record(
  questions
    .filter((question) => question.kind === "flashback-choice")
    .every((question) => {
      const answer = String(question.answers[question.correctIndex]).toLowerCase();
      const alt = String(question.image?.alt ?? "").toLowerCase();
      const src = String(question.image?.src ?? "").toLowerCase();
      return !alt.includes(answer) && !src.includes(answer.replace(/[^a-z0-9]/g, ""));
    }),
  "A Flashback choice prompt still prints the answer in the artwork.",
);
record(
  questions
    .filter((question) => question.kind === "flashback-year")
    .every((question) => !String(question.image?.src ?? "").includes(String(question.flashback?.correctYear))),
  "A Flashback year prompt still has the year in the image path.",
);
record(
  questions
    .filter((question) => question.kind === "flashback-order")
    .every((question) =>
      question.flashback.cards.every((card) => {
        const image = String(card.image);
        return (
          image.includes("team_logos/") ||
          image.includes("/items/") ||
          image.includes("/heroes/") ||
          image.includes("dota2_logo_")
        );
      }),
    ),
  "A Flashback order card still uses unrelated artwork.",
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

const isInternationalPrompt = (question) =>
  /(?:^|:)ti\d|og-first-ti|back-to-back|ti-winners|ti-cities/i.test(question.id);
const internationalCount = questions.filter(isInternationalPrompt).length;
const otherCount = questions.length - internationalCount;
record(
  otherCount >= internationalCount,
  `Flashback is still mostly International prompts (${internationalCount} TI / ${otherCount} other).`,
);
record(
  questions
    .filter((question) => String(question.image?.src ?? "").startsWith("/arcade/flashback/"))
    .every((question) => existsSync(path.join(process.cwd(), "public", question.image.src))),
  "A Flashback local image is missing from disk.",
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
