import { describe, expect, it } from "vitest";
import {
  dailyMediaRound,
  dailyPoolSizes,
  dailyQuestion,
  dailyRoundPayload,
  gradeDailyAnswer,
} from "../src/lib/daily-deck";
import { DAILY_SLOTS, dailyRoundId } from "../src/lib/daily.mjs";
import { correctAnswerKey } from "../src/lib/keyed-answer";
import { flashbackYearAnswerKey, flashbackYearFromAnswerKey } from "../src/lib/flashback.mjs";

const labels = { hiddenHero: "Hidden hero", spellLink: "Spell Link" };
// The first daily: every check runs against a real set from the live catalog.
const DAY = 1;
const NOW = Date.UTC(2026, 10, 27, 12);

describe("daily deck", () => {
  it("has a pool for every slot, large enough for months without repeats", () => {
    const sizes = dailyPoolSizes();
    expect(sizes).toHaveLength(DAILY_SLOTS.length);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(90);
  });

  it("gives everyone the same set on the same day and a new set the next day", () => {
    const first = DAILY_SLOTS.map((_, slot) => dailyQuestion(DAY, slot)?.id ?? null);
    expect(DAILY_SLOTS.map((_, slot) => dailyQuestion(DAY, slot)?.id ?? null)).toEqual(first);
    const second = DAILY_SLOTS.map((_, slot) => dailyQuestion(DAY + 1, slot)?.id ?? null);
    expect(second.slice(0, 5)).not.toEqual(first.slice(0, 5));
  });

  it("serves rounds whose ID names only the day and slot, with no answer before the guess", () => {
    for (let slot = 0; slot < DAILY_SLOTS.length; slot += 1) {
      const round = dailyRoundPayload(DAY, slot, 1, "en", labels, false, NOW);
      const text = JSON.stringify(round);
      const question = dailyQuestion(DAY, slot);
      if (question) {
        expect(round.question.id).toBe(dailyRoundId(DAY, slot));
        expect(round.question.reveal).toBeNull();
        expect(text).not.toContain(question.id);
        expect(text).not.toContain(question.explanation);
      } else {
        expect(round.estimate.reveal).toBeNull();
        expect(round.estimate.slider.max).toBeGreaterThan(round.estimate.slider.min);
      }
    }
  });

  it("opens clues only up to the stage the player asked for", () => {
    const quote = DAILY_SLOTS.indexOf("quote-hunt");
    expect(dailyRoundPayload(DAY, quote, 1, "en", labels, false, NOW).question.quoteHints).toEqual([]);
    expect(dailyRoundPayload(DAY, quote, 3, "en", labels, false, NOW).question.quoteHints).toHaveLength(2);
    const fog = dailyRoundPayload(DAY, 0, 2, "en", labels, false, NOW).question.image.src;
    expect(fog).toContain("stage=2");
    expect(fog).toContain(encodeURIComponent(dailyRoundId(DAY, 0)));
  });

  it("scores a right answer by the clue it came after, and a wrong one as zero", () => {
    const fogged = dailyQuestion(DAY, 0);
    const key = correctAnswerKey(fogged);
    expect(gradeDailyAnswer(DAY, 0, 1, { answerKey: key }, NOW)).toEqual({ points: 3, correct: true });
    expect(gradeDailyAnswer(DAY, 0, 3, { answerKey: key }, NOW)).toEqual({ points: 1, correct: true });
    expect(gradeDailyAnswer(DAY, 0, 1, { answerKey: "npc_dota_hero_not_a_hero" }, NOW)).toEqual({
      points: 0,
      correct: false,
    });
    expect(gradeDailyAnswer(DAY, 0, 1, {}, NOW)).toBeNull();
  });

  it("scores the estimate by closeness and rejects a guess off the slider", () => {
    const slot = DAILY_SLOTS.indexOf("estimate");
    const round = dailyRoundPayload(DAY, slot, 1, "en", labels, true, NOW);
    const { value } = round.estimate.reveal;
    expect(gradeDailyAnswer(DAY, slot, 1, { value }, NOW)).toEqual({ points: 3, correct: true });
    expect(gradeDailyAnswer(DAY, slot, 1, { value: round.estimate.slider.max + 1 }, NOW)).toBeNull();
  });

  it("scores Flashback years by closeness", () => {
    for (let day = 1; day < 60; day += 1) {
      const question = dailyQuestion(day, DAILY_SLOTS.indexOf("flashback"));
      if (question.flashback?.family !== "year") continue;
      const year = flashbackYearFromAnswerKey(correctAnswerKey(question));
      const slot = DAILY_SLOTS.indexOf("flashback");
      expect(gradeDailyAnswer(day, slot, 1, { answerKey: flashbackYearAnswerKey(year) }, NOW).points).toBe(3);
      expect(gradeDailyAnswer(day, slot, 1, { answerKey: flashbackYearAnswerKey(year - 1) }, NOW).points).toBe(2);
      return;
    }
    throw new Error("No Flashback year round in the first 60 dailies.");
  });

  it("serves media only for a daily that is open", () => {
    expect(dailyMediaRound(dailyRoundId(DAY, 0), "2", NOW)).toMatchObject({ day: DAY, slot: 0, stage: 2 });
    expect(dailyMediaRound(dailyRoundId(DAY, 0), "9", NOW).stage).toBe(3);
    expect(dailyMediaRound(dailyRoundId(40, 0), "1", NOW)).toBeNull();
    expect(dailyMediaRound(dailyRoundId(DAY, 5), "1", NOW)).toBeNull();
  });
});
