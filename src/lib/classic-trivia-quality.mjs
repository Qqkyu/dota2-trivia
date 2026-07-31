export const RETIRED_CLASSIC_TRIVIA_KINDS = new Set(["ability-detective", "hero-primary-attribute", "hero-intruder"]);

export function isPlayableClassicTriviaQuestion(question) {
  return !RETIRED_CLASSIC_TRIVIA_KINDS.has(question.kind);
}
