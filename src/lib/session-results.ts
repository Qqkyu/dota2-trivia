import type { PublicArcadeQuestion } from "./public-question";
import type { RoundGame } from "./trivia";

export type SessionRoundResult = {
  id: string;
  correct: boolean;
  points: number;
  accepted: boolean;
  category?: PublicArcadeQuestion["category"];
  game?: RoundGame;
};

/** Server results can arrive late or change after an in-flight vote commits. */
export function reconcileSessionResult(records: SessionRoundResult[], result: SessionRoundResult) {
  const existing = records.find((record) => record.id === result.id);
  if (existing?.accepted && !result.accepted) return records;
  const next = {
    ...existing,
    ...result,
    category: result.category ?? existing?.category,
    game: result.game ?? existing?.game,
  };
  if (
    existing &&
    Object.keys(next).every(
      (key) => next[key as keyof SessionRoundResult] === existing[key as keyof SessionRoundResult],
    )
  )
    return records;
  return [...records.filter((record) => record.id !== result.id), next].sort((a, b) => {
    const number = (id: string) => Number(id.match(/:round:(\d+)(?::|$)/)?.[1] ?? 0);
    return number(a.id) - number(b.id);
  });
}

export function sessionResultTotals(records: SessionRoundResult[]) {
  let streak = 0;
  for (const record of records) streak = record.correct ? streak + 1 : 0;
  return {
    score: records.reduce((total, record) => total + record.points, 0),
    correctCount: records.filter((record) => record.correct).length,
    streak,
  };
}
