#!/usr/bin/env node

import { clueStageAt, crowdScoreMultiplier, roundScoreSummary, scoreBreakdown } from "../src/lib/scoring.mjs";

const failures = [];
const duration = 15_000;
const standard = { difficulty: 2, game: "trivia" };
const early = scoreBreakdown(standard, duration, duration);
const late = scoreBreakdown(standard, 0, duration);

if (early.rawPoints !== 225 || early.speedBonus !== 100 || late.rawPoints !== 125 || late.speedBonus !== 0) {
  failures.push(`The standard speed score drifted: ${JSON.stringify({ early, late })}.`);
}

const spellSecondClue = scoreBreakdown({ difficulty: 2, game: "spell-link" }, 8_000, duration);
const spellFinalClue = scoreBreakdown({ difficulty: 2, game: "spell-link" }, 4_000, duration);
if (
  clueStageAt(8_000, duration) !== 2 ||
  clueStageAt(4_000, duration) !== 3 ||
  spellSecondClue.cluePenalty !== 40 ||
  spellFinalClue.cluePenalty !== 80 ||
  spellFinalClue.rawPoints >= spellSecondClue.rawPoints
) {
  failures.push("Spell Link hint stages no longer reduce the authoritative score in order.");
}

const aghanimSecondClue = scoreBreakdown({ difficulty: 2, game: "aghanim-lab" }, 8_000, duration);
const aghanimFinalClue = scoreBreakdown({ difficulty: 2, game: "aghanim-lab" }, 4_000, duration);
if (
  aghanimSecondClue.cluePenalty !== 40 ||
  aghanimFinalClue.cluePenalty !== 80 ||
  aghanimFinalClue.rawPoints >= aghanimSecondClue.rawPoints
) {
  failures.push("Aghanim's Lab clue stages no longer reduce the authoritative score in order.");
}

const map = scoreBreakdown(
  {
    difficulty: 2,
    game: "map-sense",
    map: { target: { x: 0.4, y: 0.6 }, tolerance: 0.1 },
  },
  12_000,
  duration,
  { x: 0.4, y: 0.6 },
);
if (map.speedBonus !== 100 || map.precisionBonus !== 100 || map.rawPoints !== 325) {
  failures.push(`Map reading grace or precision scoring drifted: ${JSON.stringify(map)}.`);
}

const solo = roundScoreSummary({
  correctCount: 1,
  total: 1,
  basePointsTotal: 200,
  basePointsBest: 200,
  playerBasePoints: 200,
});
if (crowdScoreMultiplier(1, 1) !== 1 || solo.average !== 200 || solo.best !== 200 || solo.playerPoints !== 200) {
  failures.push(`A solo correct answer received an invalid comparison: ${JSON.stringify(solo)}.`);
}

const minority = roundScoreSummary({
  correctCount: 2,
  total: 5,
  basePointsTotal: 320,
  basePointsBest: 170,
  playerBasePoints: 150,
});
if (
  crowdScoreMultiplier(2, 5) !== 2 ||
  minority.average !== 320 ||
  minority.best !== 340 ||
  minority.playerPoints !== 300
) {
  failures.push(`The crowd-breaker aggregate drifted: ${JSON.stringify(minority)}.`);
}

const evenSplit = roundScoreSummary({
  correctCount: 2,
  total: 4,
  basePointsTotal: 320,
  basePointsBest: 170,
  playerBasePoints: 150,
});
if (crowdScoreMultiplier(2, 4) !== 1 || evenSplit.average !== 160 || evenSplit.playerPoints !== 150) {
  failures.push("An exactly-even split incorrectly received the minority bonus.");
}

const allWrong = roundScoreSummary({
  correctCount: 0,
  total: 127,
  basePointsTotal: 0,
  basePointsBest: 0,
  playerBasePoints: 0,
});
if (allWrong.average !== null || allWrong.best !== null || allWrong.playerPoints !== 0) {
  failures.push(`An all-wrong room produced fake correct scores: ${JSON.stringify(allWrong)}.`);
}

const largeRoom = roundScoreSummary({
  correctCount: 1_000,
  total: 10_000,
  basePointsTotal: 200_000,
  basePointsBest: 250,
  playerBasePoints: null,
});
if (largeRoom.average !== 400 || largeRoom.best !== 500 || largeRoom.playerPoints !== null) {
  failures.push(`Large-room aggregation overflowed or exposed a non-player score: ${JSON.stringify(largeRoom)}.`);
}

if (failures.length) throw new Error(failures.join("\n"));
console.log("Validated authoritative timing, hint, precision, solo, minority, and large-room score aggregates.");
