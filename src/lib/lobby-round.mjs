/**
 * The public room runs on a fixed period, so the lobby can keep its own clock
 * between polls: when the round it last heard about has ended, step forward to
 * the round that is live now. The format of a stepped round is unknown until
 * the next poll, so `game` is null and `known` is false.
 *
 * @param {{ number: number, game: string, nextGame?: string | null, phase: "answering" | "reveal", answerDeadline: number, revealDeadline: number, answerDuration: number }} round
 * @param {number} serverNow
 */
export function lobbyRoundAt(round, serverNow) {
  const revealLength = Math.max(1, round.revealDeadline - round.answerDeadline);
  const period = round.answerDuration + revealLength;
  const start = round.answerDeadline - round.answerDuration;
  if (serverNow < round.revealDeadline) {
    return {
      ...round,
      nextGame: round.nextGame ?? null,
      phase: serverNow < round.answerDeadline ? "answering" : "reveal",
      known: true,
    };
  }
  const steps = Math.floor((serverNow - start) / period);
  const nextStart = start + steps * period;
  const answerDeadline = nextStart + round.answerDuration;
  return {
    number: round.number + steps,
    game: steps === 1 ? (round.nextGame ?? null) : null,
    nextGame: null,
    phase: serverNow < answerDeadline ? "answering" : "reveal",
    answerDeadline,
    revealDeadline: nextStart + period,
    answerDuration: round.answerDuration,
    known: false,
  };
}
