import { describe, expect, it } from "vitest";
import {
  clueStageAt,
  crowdScoreMultiplier,
  missedRoundResult,
  roundScoreSummary,
  scoreBreakdown,
} from "../src/lib/scoring.mjs";

const duration = 15_000;
const standard = { difficulty: 2, game: "trivia" };

describe("scoreBreakdown", () => {
  it("pays the full speed bonus at the start and none at the deadline", () => {
    expect(scoreBreakdown(standard, duration, duration)).toMatchObject({ rawPoints: 225, speedBonus: 100 });
    expect(scoreBreakdown(standard, 0, duration)).toMatchObject({ rawPoints: 125, speedBonus: 0 });
  });

  it("adds 25 points per hidden difficulty tier", () => {
    expect(scoreBreakdown({ difficulty: 1, game: "trivia" }, duration, duration).difficultyBonus).toBe(0);
    expect(scoreBreakdown({ difficulty: 3, game: "trivia" }, duration, duration).difficultyBonus).toBe(50);
  });

  it.each(["spell-link", "aghanim-lab"])("charges 40 points per unlocked clue in %s", (game) => {
    expect(clueStageAt(8_000, duration)).toBe(2);
    expect(clueStageAt(4_000, duration)).toBe(3);
    const second = scoreBreakdown({ difficulty: 2, game }, 8_000, duration);
    const final = scoreBreakdown({ difficulty: 2, game }, 4_000, duration);
    expect(second.cluePenalty).toBe(40);
    expect(final.cluePenalty).toBe(80);
    expect(final.rawPoints).toBeLessThan(second.rawPoints);
  });

  it("charges no clue penalty outside the progressive-clue formats", () => {
    expect(scoreBreakdown({ difficulty: 2, game: "quote-hunt" }, 4_000, duration).cluePenalty).toBe(0);
  });

  it("never pays less than 25 points for a correct answer", () => {
    expect(scoreBreakdown({ difficulty: 1, game: "spell-link" }, 0, duration).rawPoints).toBe(25);
  });
});

describe("roundScoreSummary", () => {
  it("returns a solo correct answer unchanged", () => {
    expect(crowdScoreMultiplier(1, 1)).toBe(1);
    expect(
      roundScoreSummary({
        correctCount: 1,
        total: 1,
        basePointsTotal: 200,
        basePointsBest: 200,
        playerBasePoints: 200,
      }),
    ).toEqual({ correctCount: 1, average: 200, best: 200, playerPoints: 200 });
  });

  it("doubles every correct score when fewer than half the room was right", () => {
    expect(crowdScoreMultiplier(2, 5)).toBe(2);
    expect(
      roundScoreSummary({
        correctCount: 2,
        total: 5,
        basePointsTotal: 320,
        basePointsBest: 170,
        playerBasePoints: 150,
      }),
    ).toEqual({ correctCount: 2, average: 320, best: 340, playerPoints: 300 });
  });

  it("gives no crowd-breaker bonus on an exactly even split", () => {
    expect(crowdScoreMultiplier(2, 4)).toBe(1);
    expect(
      roundScoreSummary({
        correctCount: 2,
        total: 4,
        basePointsTotal: 320,
        basePointsBest: 170,
        playerBasePoints: 150,
      }),
    ).toMatchObject({ average: 160, playerPoints: 150 });
  });

  it("reports no averages when nobody was right", () => {
    expect(
      roundScoreSummary({ correctCount: 0, total: 127, basePointsTotal: 0, basePointsBest: 0, playerBasePoints: 0 }),
    ).toEqual({ correctCount: 0, average: null, best: null, playerPoints: 0 });
  });

  it("aggregates a large room without exposing a score for a non-player", () => {
    expect(
      roundScoreSummary({
        correctCount: 1_000,
        total: 10_000,
        basePointsTotal: 200_000,
        basePointsBest: 250,
        playerBasePoints: null,
      }),
    ).toEqual({ correctCount: 1_000, average: 400, best: 500, playerPoints: null });
  });
});

describe("missedRoundResult", () => {
  it("recovers an accepted correct vote after a missed reveal", () => {
    expect(
      missedRoundResult("round-1", {
        playerVote: { answerIndex: 0, submittedAt: 1 },
        scoreSummary: { playerPoints: 246 },
      }),
    ).toEqual({ roundId: "round-1", correct: true, points: 246 });
  });

  it("counts an accepted wrong vote without inventing points", () => {
    expect(
      missedRoundResult("round-1", {
        playerVote: { answerIndex: 2, submittedAt: 1 },
        scoreSummary: { playerPoints: 0 },
      }),
    ).toEqual({ roundId: "round-1", correct: false, points: 0 });
  });

  it("ignores a round the player never answered", () => {
    expect(missedRoundResult("round-1", { playerVote: null, scoreSummary: { playerPoints: 200 } })).toBeNull();
  });
});
