import { describe, expect, it } from "vitest";
import { lobbyRoundAt } from "../src/lib/lobby-round.mjs";

const round = {
  number: 10,
  game: "trivia",
  phase: "answering",
  answerDeadline: 115_000,
  revealDeadline: 122_000,
  answerDuration: 15_000,
  nextGame: "shopkeeper",
};

describe("lobbyRoundAt", () => {
  it("keeps the known round while it is live", () => {
    expect(lobbyRoundAt(round, 101_000)).toEqual({ ...round, phase: "answering", known: true });
    expect(lobbyRoundAt(round, 118_000)).toEqual({ ...round, phase: "reveal", known: true });
  });

  it("steps to the next round on the fixed period once the reveal has ended", () => {
    expect(lobbyRoundAt(round, 122_000)).toEqual({
      number: 11,
      game: "shopkeeper",
      nextGame: null,
      phase: "answering",
      answerDeadline: 137_000,
      revealDeadline: 144_000,
      answerDuration: 15_000,
      known: false,
    });
    expect(lobbyRoundAt(round, 170_000)).toMatchObject({
      number: 13,
      game: null,
      phase: "answering",
      answerDeadline: 181_000,
    });
    expect(lobbyRoundAt(round, 183_000)).toMatchObject({ number: 13, phase: "reveal", known: false });
  });
});
