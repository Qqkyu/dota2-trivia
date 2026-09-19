import { echoHuntRevealStage, soundcheckRevealStage } from "./soundcheck.mjs";

export const PROGRESSIVE_ROUND_GAMES = new Set([
  "spell-link",
  "fogged-vision",
  "echo-hunt",
  "soundcheck",
  "quote-hunt",
  "aghanim-lab",
]);

/**
 * @param {string} roundGame
 * @param {number} timeRemaining
 * @param {number} duration
 * @returns {1 | 2 | 3 | null}
 */
export function answerStageForRound(roundGame, timeRemaining, duration) {
  if (!PROGRESSIVE_ROUND_GAMES.has(roundGame)) return null;
  const safeDuration = Math.max(1, duration);
  const safeRemaining = Math.max(0, Math.min(safeDuration, timeRemaining));
  if (roundGame === "soundcheck") return soundcheckRevealStage(safeRemaining, safeDuration);
  if (roundGame === "echo-hunt") return echoHuntRevealStage(safeRemaining, safeDuration);
  if (safeRemaining <= safeDuration / 3) return 3;
  if (safeRemaining <= (safeDuration * 2) / 3) return 2;
  return 1;
}

/**
 * @param {Array<{
 *   roundId: string;
 *   roundNumber: number;
 *   gameId: string;
 *   questionId: string;
 *   questionRevision: string;
 *   roundGame: string;
 *   roundFormat: string;
 *   correct: boolean;
 *   answerStage: 1 | 2 | 3 | null;
 *   submittedAt: number;
 * }>} inputRounds
 */
export function summarizePlayerRounds(inputRounds) {
  const rounds = [...inputRounds].sort(
    (left, right) => left.submittedAt - right.submittedAt || left.roundNumber - right.roundNumber,
  );
  let correct = 0;
  let currentStreak = 0;
  let bestStreak = 0;
  let firstStageCorrect = 0;
  let progressiveCorrect = 0;
  let progressiveAnswered = 0;
  let bestTenCorrect = null;
  let rollingCorrect = 0;
  const rollingWindow = [];
  const formats = new Map();

  for (const round of rounds) {
    const format = formats.get(round.roundFormat) ?? {
      format: round.roundFormat,
      answered: 0,
      correct: 0,
      firstStageCorrect: 0,
      secondStageCorrect: 0,
      thirdStageCorrect: 0,
      firstStageAnswered: 0,
      secondStageAnswered: 0,
      thirdStageAnswered: 0,
      progressiveAnswered: 0,
    };
    format.answered += 1;

    if (round.correct) {
      correct += 1;
      format.correct += 1;
      currentStreak += 1;
      bestStreak = Math.max(bestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }

    if (round.answerStage !== null) {
      format.progressiveAnswered += 1;
      progressiveAnswered += 1;
      if (round.answerStage === 1) format.firstStageAnswered += 1;
      if (round.answerStage === 2) format.secondStageAnswered += 1;
      if (round.answerStage === 3) format.thirdStageAnswered += 1;
      if (round.correct) {
        progressiveCorrect += 1;
        if (round.answerStage === 1) {
          format.firstStageCorrect += 1;
          firstStageCorrect += 1;
        }
        if (round.answerStage === 2) format.secondStageCorrect += 1;
        if (round.answerStage === 3) format.thirdStageCorrect += 1;
      }
    }
    formats.set(round.roundFormat, format);

    const result = round.correct ? 1 : 0;
    rollingWindow.push(result);
    rollingCorrect += result;
    if (rollingWindow.length > 10) rollingCorrect -= rollingWindow.shift();
    if (rollingWindow.length === 10) bestTenCorrect = Math.max(bestTenCorrect ?? 0, rollingCorrect);
  }

  const answered = rounds.length;
  return {
    answered,
    correct,
    accuracy: answered ? Math.round((correct / answered) * 100) : 0,
    currentStreak,
    bestStreak,
    bestTenCorrect,
    firstStageCorrect,
    progressiveCorrect,
    progressiveAnswered,
    formats: [...formats.values()]
      .map((format) => ({
        ...format,
        accuracy: Math.round((format.correct / format.answered) * 100),
      }))
      .sort((left, right) => right.answered - left.answered || left.format.localeCompare(right.format)),
    recentRounds: rounds
      .slice(-10)
      .reverse()
      .map((round) => ({
        roundId: round.roundId,
        roundNumber: round.roundNumber,
        gameId: round.gameId,
        roundGame: round.roundGame,
        roundFormat: round.roundFormat,
        correct: round.correct,
        answerStage: round.answerStage,
        submittedAt: round.submittedAt,
      })),
  };
}
