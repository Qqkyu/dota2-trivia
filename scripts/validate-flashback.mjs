#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  FLASHBACK_YEAR_EPOCH,
  flashbackOrderCorrectAnswerKey,
  flashbackYearMax,
  isPlayableFlashbackQuestion,
} from "../src/lib/flashback.mjs";
import { publicQuestionForRound } from "../src/lib/public-question.mjs";
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
const arcadeCss = await readFile(path.join(process.cwd(), "src", "components", "queue-arcade.module.css"), "utf8");
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
  "flashback:phoenix-year": "heroes/phoenix",
  "flashback:oracle-year": "heroes/oracle",
  "flashback:arc-warden-year": "heroes/arc_warden",
  "flashback:turbo-year": "dota2_logo_symbol",
  "flashback:plus-year": "dota2_logo_symbol",
  "flashback:artifact-year": "dota2_logo_symbol",
  "flashback:ability-draft-year": "dota2_logo_symbol",
  "flashback:siltbreaker-year": "dota2_logo_symbol",
  "flashback:aghanim-lab-year": "items/ultimate_scepter",
  "flashback:nemestice-year": "dota2_logo_symbol",
  "flashback:crownfall-year": "heroes/vengefulspirit",
  "flashback:dawnbreaker-year": "heroes/dawnbreaker",
  "flashback:primal-beast-year": "heroes/primal_beast",
  "flashback:muerta-year": "heroes/muerta",
  "flashback:ringmaster-year": "heroes/ringmaster",
  "flashback:kez-year": "heroes/kez",
  "flashback:icefrog-valve-year": "dota2_logo_symbol",
  "flashback:first-compendium-year": "dota2_logo_symbol",
  "flashback:first-battlepass-year": "dota2_logo_symbol",
  "flashback:first-persona-year": "heroes/invoker",
  "flashback:hoodwink-year": "heroes/hoodwink",
  "flashback:dark-moon-year": "heroes/luna",
  "flashback:pit-lord": "heroes/abyssal_underlord",
  "flashback:io-wisp": "dota2_logo_symbol",
  "flashback:outposts-replaced": "map-overview.webp",
  "flashback:twin-gates": "map-overview.webp",
  "flashback:tormentors": "map-overview.webp",
  "flashback:first-persona-hero": "dota2_logo_symbol",
  "flashback:guinsoo-lol": "items/sheepstick",
  "flashback:roshan-cheese": "items/aegis",
  "flashback:frankfurt-major-winner": "ti-wordmark.png",
  "flashback:dueling-fates-turbo": "dota2_logo_symbol",
  "flashback:shrines-700": "map-overview.webp",
  "flashback:arcane-rune": "items/energy_booster",
  "flashback:oracle-wyvern-same-day": "dota2_logo_symbol",
  "flashback:kez-crownfall": "heroes/vengefulspirit",
  "flashback:lotus-pools": "map-overview.webp",
  "flashback:icefrog-hired-by": "dota2_logo_symbol",
  "flashback:underlords-genre": "dota2_logo_symbol",
  "flashback:personal-courier": "items/courier",
  "flashback:snapfire-patch": "heroes/snapfire",
  "flashback:siltbreaker-coop": "dota2_logo_symbol",
  "flashback:dark-moon-temple": "heroes/luna",
  "flashback:dueling-fates-heroes": "dota2_logo_symbol",
  "flashback:coop-events-order": "dota2_logo_symbol",
  "flashback:recent-heroes-order": "dota2_logo_symbol",
  "flashback:modes-order": "dota2_logo_symbol",
  "flashback:map-features-order": "map-overview.webp",
  "flashback:later-originals-order": "dota2_logo_symbol",
  "flashback:valve-path-order": "dota2_logo_symbol",
  "flashback:io-year": "heroes/wisp",
  "flashback:ember-year": "heroes/ember_spirit",
  "flashback:legion-year": "heroes/legion_commander",
  "flashback:terrorblade-year": "heroes/terrorblade",
  "flashback:winter-wyvern-year": "heroes/winter_wyvern",
  "flashback:pangolier-year": "heroes/pangolier",
  "flashback:grimstroke-year": "heroes/grimstroke",
  "flashback:mars-year": "heroes/mars",
  "flashback:void-spirit-year": "heroes/void_spirit",
  "flashback:snapfire-year": "heroes/snapfire",
  "flashback:marci-year": "heroes/marci",
  "flashback:largo-year": "heroes/largo",
  "flashback:frostivus-year": "dota2_logo_symbol",
  "flashback:underhollow-year": "heroes/abyssal_underlord",
  "flashback:morokai-year": "heroes/monkey_king",
  "flashback:diretide-return-year": "items/aegis",
  "flashback:water-runes-year": "items/energy_booster",
  "flashback:patch-738-year": "map-overview.webp",
  "flashback:ti2-year": "ti-seattle.jpg",
  "flashback:ti3-year": "ti-seattle.jpg",
  "flashback:ti4-year": "ti-wordmark.png",
  "flashback:ti5-year": "ti5-keyarena.jpg",
  "flashback:ti6-year": "ti-wordmark.png",
  "flashback:ti7-year": "ti5-keyarena.jpg",
  "flashback:ti11-year": "ti11-mark.jpg",
  "flashback:ti12-year": "ti12-mark.png",
  "flashback:shanghai-major-year": "ti-wordmark.png",
  "flashback:kiev-major-year": "ti-wordmark.png",
  "flashback:ember-earth-same-day": "dota2_logo_symbol",
  "flashback:phoenix-terrorblade-same-day": "dota2_logo_symbol",
  "flashback:shanghai-major-winner": "ti-wordmark.png",
  "flashback:manila-major-winner": "ti-wordmark.png",
  "flashback:boston-major-winner": "ti-wordmark.png",
  "flashback:kiev-major-winner": "ti-wordmark.png",
  "flashback:four-majors": "ti-wordmark.png",
  "flashback:wisdom-runes": "map-overview.webp",
  "flashback:water-runes-729": "items/energy_booster",
  "flashback:watchers": "map-overview.webp",
  "flashback:wisdom-shrines-738": "map-overview.webp",
  "flashback:tome-replaced": "dota2_logo_symbol",
  "flashback:skip-ti-2020": "ti10-mark.png",
  "flashback:first-10m": "ti-wordmark.png",
  "flashback:largo-740": "dota2_logo_symbol",
  "flashback:fourth-spirit": "dota2_logo_symbol",
  "flashback:refresher-shard": "items/aegis",
  "flashback:level-30": "dota2_logo_symbol",
  "flashback:free-observers": "dota2_logo_symbol",
  "flashback:flying-courier-gone": "items/courier",
  "flashback:new-bloom": "dota2_logo_symbol",
  "flashback:auto-chess": "dota2_logo_symbol",
  "flashback:shield-rune": "dota2_logo_symbol",
  "flashback:shanghai-city": "ti-wordmark.png",
  "flashback:manila-city": "ti-wordmark.png",
  "flashback:kiev-city": "ti-wordmark.png",
  "flashback:boston-city": "ti-wordmark.png",
  "flashback:stockholm-planned": "ti10-mark.png",
  "flashback:underhollow-who": "dota2_logo_symbol",
  "flashback:frostivus-what": "dota2_logo_symbol",
  "flashback:madstone": "dota2_logo_symbol",
  "flashback:first-seattle-ti": "ti-seattle.jpg",
  "flashback:ti20m": "ti-wordmark.png",
  "flashback:void-outlanders": "heroes/void_spirit",
  "flashback:major-cities-order": "ti-wordmark.png",
  "flashback:og-majors-order": "ti-wordmark.png",
  "flashback:2013-heroes-order": "dota2_logo_symbol",
  "flashback:recent-patches-order": "map-overview.webp",
  "flashback:newest-heroes-order": "dota2_logo_symbol",
  "flashback:season-events-order": "dota2_logo_symbol",
  "flashback:rune-history-order": "dota2_logo_symbol",
  "flashback:ti-year-gaps-order": "ti-wordmark.png",
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
const yearQuestions = questions.filter((question) => question.kind === "flashback-year");
const poolYearMin = Math.min(...yearQuestions.map((question) => question.flashback.correctYear));
record(poolYearMin === FLASHBACK_YEAR_EPOCH, `Flashback year ticks start at ${FLASHBACK_YEAR_EPOCH}, not ${poolYearMin}.`);
record(
  !arcadeSource.includes("yearMax: 2026") &&
    arcadeSource.includes("flashbackYearMax") === false &&
    arcadeSource.includes("flashback-year-board") &&
    arcadeSource.includes("flashback-year-tick") &&
    arcadeSource.includes("Pick a year") &&
    arcadeCss.includes(".flashbackYearBoard {") &&
    arcadeCss.includes("min-height: 148px;"),
  "Flashback year ticks still use a hardcoded last year or can jump.",
);
record(
  flashbackYearMax(Date.UTC(2027, 5, 1)) === 2027 && flashbackYearMax(Date.UTC(2031, 0, 1)) === 2031,
  "Flashback year ticks do not follow the current calendar year.",
);
const sampleYear = yearQuestions[0];
if (sampleYear) {
  const frozenNow = Date.UTC(2027, 5, 1);
  const answering = publicQuestionForRound(
    sampleYear,
    { id: "year-check", phase: "answering", game: "flashback", answerDeadline: frozenNow + 15_000, answerDuration: 15_000 },
    frozenNow,
  );
  const reveal = publicQuestionForRound(
    sampleYear,
    { id: "year-check", phase: "reveal", game: "flashback", answerDeadline: frozenNow - 1_000, answerDuration: 15_000 },
    frozenNow,
  );
  record(
    answering.answerMode === "flashback-year" &&
      answering.answers.every((answer) => answer === "") &&
      answering.flashback?.yearMin === FLASHBACK_YEAR_EPOCH &&
      answering.flashback?.yearMax === 2027 &&
      !JSON.stringify(answering).includes("correctYear"),
    "Flashback year ticks still leak the answer while answers are open.",
  );
  record(
    reveal.reveal?.correctAnswerKey === `year-v1:${sampleYear.flashback.correctYear}` &&
      reveal.flashback?.yearMax === 2027,
    "Flashback year reveal no longer names the correct year.",
  );
}
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
record(
  questions
    .filter((question) => question.flashback?.revealMedia)
    .every((question) => {
      const src = String(question.flashback.revealMedia.src ?? "");
      return (
        (src.startsWith("https://") || src.startsWith("/arcade/flashback/")) &&
        question.flashback.revealMedia.alt &&
        (!src.startsWith("/arcade/flashback/") || existsSync(path.join(process.cwd(), "public", src)))
      );
    }),
  "A Flashback reveal picture is missing or not playable.",
);
record(
  questions
    .filter((question) => question.id.endsWith("-winner") || question.id === "flashback:back-to-back")
    .every((question) => question.flashback?.revealMedia?.src),
  "A Flashback who-won prompt has no reveal picture.",
);
const winnerPhotoIds = new Set([
  "flashback:ti7-winner",
  "flashback:ti8-winner",
  "flashback:ti11-winner",
  "flashback:ti12-winner",
  "flashback:ti13-winner",
  "flashback:ti14-winner",
  "flashback:frankfurt-major-winner",
  "flashback:shanghai-major-winner",
  "flashback:manila-major-winner",
  "flashback:boston-major-winner",
  "flashback:kiev-major-winner",
  "flashback:back-to-back",
  "flashback:four-majors",
]);
record(
  questions
    .filter((question) => winnerPhotoIds.has(question.id))
    .every(
      (question) =>
        question.flashback?.revealMedia?.kind === "photo" &&
        String(question.flashback.revealMedia.src).startsWith("/arcade/flashback/winners/") &&
        existsSync(path.join(process.cwd(), "public", question.flashback.revealMedia.src)),
    ) && winnerPhotoIds.size === 13,
  "A Flashback winner photo is still a team mark.",
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
record(
  arcadeSource.includes('data-empty={position < 0 ? "true" : "false"}') &&
    arcadeSource.includes("flashback-reveal-media") &&
    arcadeSource.includes('data-testid="reveal-panel"') &&
    arcadeSource.includes("data-reveal-photo") &&
    arcadeSource.includes("flashbackOrderCardArt") &&
    arcadeSource.includes("<span>\n                  <strong>{card?.name ?? key}</strong>") &&
    !arcadeSource.includes("<em>{cardIndex") &&
    arcadeCss.includes(".flashbackOrderCards button {\n  position: relative;") &&
    arcadeCss.includes("height: 132px;") &&
    arcadeCss.includes(".flashbackOrderSlots > span {\n  display: grid;") &&
    arcadeCss.includes("height: 64px;") &&
    arcadeCss.includes(".flashbackOrderCardArt {\n  display: block;") &&
    arcadeCss.includes("width: 72px;") &&
    arcadeCss.includes(".flashbackOrderCards strong {\n  color: #ecece8;") &&
    arcadeCss.includes("font-size: 14px;") &&
    arcadeCss.includes(".flashbackQuestion .artwork,") &&
    arcadeCss.includes("width: 248px;") &&
    arcadeCss.includes("height: 148px;") &&
    arcadeCss.includes("transform: scale(1.16);"),
  "Flashback order cards can still change size when a card is picked.",
);

if (failures.length) throw new Error(failures.join("\n"));
console.log(`Validated ${questions.length} Flashback prompts and the full-question entry gate.`);
