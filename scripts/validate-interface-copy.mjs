#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { revealCallout, streakBannerParts } from "../src/lib/dota-flavor.mjs";
import {
  ENTRY_WAIT_HINT,
  ENTRY_WAIT_TIP_LABEL,
  ENTRY_WAIT_TIPS,
  shuffleEntryWaitTips,
} from "../src/lib/entry-wait-tips.mjs";
import { preventQuestionClipboard, shouldBlockQuestionClipboard } from "../src/lib/question-guard.mjs";

const root = process.cwd();
const [arcadeSource, arcadeCss, publicQuestionSource, publicQuestionType, steamAvatarSource, profileSource] =
  await Promise.all(
    [
      "src/components/queue-arcade.tsx",
      "src/components/queue-arcade.module.css",
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
  streakBannerParts("Unstoppable").accent === "unstoppable" &&
    streakBannerParts("Killing Spree").before === "You are on a " &&
    streakBannerParts("Beyond Godlike").accent === "GODLIKE, someone kill them!!" &&
    streakBannerParts("Killing Spree", "Aui_2000").before === "Aui_2000 is on a " &&
    streakBannerParts("First Blood", "Aui_2000").before === "Aui_2000 drew ",
  "Kill-feed streak sentences drifted from the Dota client strings.",
);

record(
  ENTRY_WAIT_HINT === "Waiting for the next full question." &&
    ENTRY_WAIT_TIP_LABEL === "Hint" &&
    ENTRY_WAIT_TIPS.some((tip) => tip.id === "keys" && tip.body === "Use A–D shortcut to pick an answer") &&
    ENTRY_WAIT_TIPS.some((tip) => tip.id === "heroes" && tip.body === "Start typing to filter heroes") &&
    ENTRY_WAIT_TIPS.some(
      (tip) => tip.id === "shop" && tip.body === "Use Search Items to filter" && tip.mark === "Search Items",
    ) &&
    !arcadeSource.includes("Tip {tipIndex") &&
    arcadeSource.includes("ENTRY_WAIT_TIP_LABEL") &&
    JSON.stringify(shuffleEntryWaitTips(ENTRY_WAIT_TIPS, () => 0).map((tip) => tip.id)) ===
      JSON.stringify(["heroes", "shop", "keys"]) &&
    arcadeSource.includes("shuffleEntryWaitTips") &&
    arcadeSource.includes('closest("[inert]")') &&
    arcadeSource.includes("EntryWaitLessons") &&
    arcadeSource.includes("<HeroPicker") &&
    arcadeSource.includes("<ShopkeeperStore") &&
    arcadeSource.includes("WAIT_CHOICE_QUESTION") &&
    arcadeSource.includes("ClassicChoiceBoard") &&
    arcadeSource.includes("<QuestionArtwork") &&
    arcadeSource.includes('data-testid="arcade-answer"') &&
    !arcadeSource.includes("entryWaitKeyDemo") &&
    arcadeSource.includes('data-testid="entry-wait-prev-tip"') &&
    arcadeSource.includes('data-testid="entry-wait-next-tip"') &&
    arcadeSource.includes('data-testid="entry-wait-keys-demo"') &&
    arcadeSource.includes('data-testid="entry-wait-heroes-demo"') &&
    arcadeSource.includes('data-testid="entry-wait-shop-demo"') &&
    arcadeSource.includes('data-testid="entry-wait-stage"') &&
    arcadeSource.includes('data-testid="entry-wait-tip-bar"') &&
    arcadeSource.includes('data-testid="shopkeeper-groups"') &&
    arcadeCss.includes(".entryWaitStage") &&
    arcadeCss.includes("height: min(440px, 48vh)") &&
    arcadeCss.includes("height: 224px") &&
    arcadeCss.includes(".entryWaitContent") &&
    /entryWaitContent \{[\s\S]*?width: 100%/.test(arcadeCss) &&
    !/shopkeeperSearchResults \{\s*min-width: 0;/.test(arcadeCss) &&
    !arcadeSource.includes('data-testid="picker-filter-hint"'),
  "The wait screen lost its visual key and type-to-filter cards.",
);

record(
  arcadeSource.includes('data-testid="entry-wait-stage"') &&
    arcadeSource.includes("inert={tip.id !==") &&
    /shopkeeperGroups \{[\s\S]*?height: 224px/.test(arcadeCss) &&
    /entryWaitStage \{[\s\S]*?height: min\(440px, 48vh\)/.test(arcadeCss) &&
    arcadeSource.includes('data-searching={normalizedQuery ? "true" : "false"}') &&
    arcadeSource.includes('data-testid="shopkeeper-search"') &&
    arcadeSource.includes('data-active="false"'),
  "Wait tips or shop search can still change size while the player is using them.",
);

record(
  shouldBlockQuestionClipboard("answering") &&
    !shouldBlockQuestionClipboard("reveal") &&
    !shouldBlockQuestionClipboard("lobby") &&
    !shouldBlockQuestionClipboard("waiting") &&
    arcadeSource.includes("shouldBlockQuestionClipboard") &&
    arcadeSource.includes("preventQuestionClipboard") &&
    arcadeSource.includes("data-copy-guard=") &&
    (() => {
      let prevented = false;
      preventQuestionClipboard({
        preventDefault: () => {
          prevented = true;
        },
      });
      return prevented;
    })(),
  "Live question copy is no longer blocked only while answering.",
);

record(
  revealCallout({ correct: true, timedOut: false, firstBlood: true, streak: 1 }) === "First Blood" &&
    revealCallout({ correct: true, timedOut: false, firstBlood: false, streak: 2 }) === "Correct" &&
    revealCallout({ correct: true, timedOut: false, firstBlood: false, streak: 3 }) === "Killing Spree" &&
    revealCallout({ correct: true, timedOut: false, firstBlood: false, streak: 5 }) === "Mega Kill" &&
    revealCallout({ correct: true, timedOut: false, firstBlood: false, streak: 9 }) === "Godlike" &&
    revealCallout({ correct: false, timedOut: false, firstBlood: false, streak: 0 }) === "Incorrect" &&
    revealCallout({ correct: false, timedOut: true, firstBlood: false, streak: 0 }) === "Time expired",
  "Dota fight callouts drifted.",
);

if (failures.length) throw new Error(failures.join("\n"));

console.log("Validated lean live-round copy with one persistent patch label and actionable guidance intact.");
