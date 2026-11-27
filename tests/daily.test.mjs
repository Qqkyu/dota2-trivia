import { describe, expect, it } from "vitest";
import {
  DAILY_MAX_POINTS,
  currentDailyStreak,
  dailyFinishMetrics,
  dailyNumberForDate,
  dailyRoundId,
  dailyRoundMetrics,
  dailyShareText,
  estimatePoints,
  flashbackYearPoints,
  isDailyPoints,
  isOpenDailyNumber,
  nextDailyStreak,
  openDailyNumbers,
  parseDailyRoundId,
  stagedRoundPoints,
  summarizeDailyCounts,
} from "../src/lib/daily.mjs";

describe("daily numbers", () => {
  it("counts local calendar days from 27 November 2026", () => {
    expect(dailyNumberForDate(new Date(2026, 10, 27, 0, 1))).toBe(1);
    expect(dailyNumberForDate(new Date(2026, 10, 27, 23, 59))).toBe(1);
    expect(dailyNumberForDate(new Date(2026, 10, 28, 0, 0))).toBe(2);
    expect(dailyNumberForDate(new Date(2027, 0, 1, 12))).toBe(36);
  });

  it("opens only the dates in use somewhere on Earth", () => {
    // 2026-12-01 12:00 UTC: UTC-12 is still on 1 December, UTC+14 is already on 2 December.
    const noon = Date.UTC(2026, 11, 1, 12);
    expect(openDailyNumbers(noon)).toEqual({ earliest: 5, latest: 6 });
    expect(isOpenDailyNumber(4, noon)).toBe(false);
    expect(isOpenDailyNumber(5, noon)).toBe(true);
    expect(isOpenDailyNumber(6, noon)).toBe(true);
    expect(isOpenDailyNumber(7, noon)).toBe(false);
    expect(isOpenDailyNumber(5.5, noon)).toBe(false);
  });

  it("never opens a day before the first daily", () => {
    expect(openDailyNumbers(Date.UTC(2026, 10, 27, 1)).earliest).toBe(1);
  });

  it("uses round IDs that name only the day and slot", () => {
    expect(dailyRoundId(12, 3)).toBe("dota2:daily:12:3");
    expect(parseDailyRoundId("dota2:daily:12:3")).toEqual({ day: 12, slot: 3 });
    expect(parseDailyRoundId("dota2:daily:12:6")).toBeNull();
    expect(parseDailyRoundId("dota2:daily:0:1")).toBeNull();
    expect(parseDailyRoundId("dota2:7.41f:public:round:4")).toBeNull();
  });
});

describe("daily scoring", () => {
  it("costs one point for each extra clue", () => {
    expect(stagedRoundPoints(true, 1)).toBe(3);
    expect(stagedRoundPoints(true, 2)).toBe(2);
    expect(stagedRoundPoints(true, 3)).toBe(1);
    expect(stagedRoundPoints(false, 1)).toBe(0);
    expect(stagedRoundPoints(true, 4)).toBe(0);
  });

  it("scores Flashback years by closeness", () => {
    expect(flashbackYearPoints(2015, 2015)).toBe(3);
    expect(flashbackYearPoints(2014, 2015)).toBe(2);
    expect(flashbackYearPoints(2018, 2015)).toBe(1);
    expect(flashbackYearPoints(2019, 2015)).toBe(0);
  });

  it("scores prices by relative error and speed or range by distance", () => {
    expect(estimatePoints("item-price", 4_050, 4_050)).toBe(3);
    expect(estimatePoints("item-price", 4_250, 4_050)).toBe(3);
    expect(estimatePoints("item-price", 4_600, 4_050)).toBe(2);
    expect(estimatePoints("item-price", 5_200, 4_050)).toBe(1);
    expect(estimatePoints("item-price", 6_000, 4_050)).toBe(0);
    expect(estimatePoints("hero-move-speed", 310, 310)).toBe(3);
    expect(estimatePoints("hero-move-speed", 305, 310)).toBe(2);
    expect(estimatePoints("hero-move-speed", 300, 310)).toBe(1);
    expect(estimatePoints("hero-move-speed", 295, 310)).toBe(0);
    expect(estimatePoints("hero-attack-range", 550, 600)).toBe(2);
    expect(estimatePoints("unknown", 1, 1)).toBe(0);
  });

  it("accepts only six whole round scores from 0 to 3", () => {
    expect(isDailyPoints([3, 2, 1, 0, 3, 3])).toBe(true);
    expect(isDailyPoints([3, 2, 1, 0, 3])).toBe(false);
    expect(isDailyPoints([3, 2, 1, 0, 3, 4])).toBe(false);
    expect(isDailyPoints([3, 2, 1, 0, 3, 1.5])).toBe(false);
  });
});

describe("daily sharing and streaks", () => {
  it("shares marks and a total, never answers", () => {
    expect(dailyShareText(4, [3, 2, 1, 0, 3, 2], "https://queuearcade.com/daily")).toBe(
      `Queue Daily #4 11/${DAILY_MAX_POINTS}\n🟩🟨🟧⬛🟩🟨\nhttps://queuearcade.com/daily`,
    );
  });

  it("extends a streak only on the next day", () => {
    const first = nextDailyStreak(null, 10);
    expect(first).toEqual({ lastDay: 10, streak: 1, best: 1 });
    const second = nextDailyStreak(first, 11);
    expect(second).toEqual({ lastDay: 11, streak: 2, best: 2 });
    expect(nextDailyStreak(second, 11)).toBe(second);
    expect(nextDailyStreak(second, 13)).toEqual({ lastDay: 13, streak: 1, best: 2 });
  });

  it("keeps showing a streak until a whole day is missed", () => {
    const state = { lastDay: 11, streak: 2, best: 2 };
    expect(currentDailyStreak(state, 11)).toBe(2);
    expect(currentDailyStreak(state, 12)).toBe(2);
    expect(currentDailyStreak(state, 13)).toBe(0);
    expect(currentDailyStreak(null, 13)).toBe(0);
  });
});

describe("daily counters", () => {
  it("stores counts only", () => {
    expect(dailyRoundMetrics(0, 3)).toEqual(["start", "slot:0:3"]);
    expect(dailyRoundMetrics(4, 0)).toEqual(["slot:4:0"]);
    expect(dailyFinishMetrics({ points: [3, 3, 3, 0, 0, 1], playedYesterday: true, streak: 45 })).toEqual([
      "finish",
      "finish:yesterday",
      "streak:30",
      "score:10",
    ]);
    expect(dailyFinishMetrics({ points: [0, 0, 0, 0, 0, 0], playedYesterday: false, streak: 1 })).toEqual([
      "finish",
      "streak:1",
      "score:0",
    ]);
  });

  it("summarizes the day for the end screen", () => {
    const summary = summarizeDailyCounts(
      { finish: 4, "score:6": 1, "score:9": 2, "score:15": 1, "slot:0:3": 2, "slot:0:0": 2, "slot:5:1": 1 },
      9,
    );
    expect(summary.players).toBe(4);
    expect(summary.averageTotal).toBe(9.75);
    expect(summary.beatShare).toBe(0.25);
    expect(summary.slots[0]).toEqual({ answered: 4, scoredShare: 0.5 });
    expect(summary.slots[5]).toEqual({ answered: 1, scoredShare: 1 });
    expect(summary.slots[2]).toEqual({ answered: 0, scoredShare: null });
    expect(summarizeDailyCounts({}, 3)).toMatchObject({ players: 0, averageTotal: null, beatShare: null });
  });
});
