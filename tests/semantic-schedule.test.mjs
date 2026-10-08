import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LIVE_ROUND_GAMES,
  PUBLIC_ROUND_FORMATS,
  formatsForRoundGames,
  roundFormatForQuestion,
} from "../src/lib/arcade-games.mjs";
import { isPlayableClassicTriviaQuestion } from "../src/lib/classic-trivia-quality.mjs";
import { isPlayableShopkeeperQuestion } from "../src/lib/shopkeeper-quality.mjs";
import { isPlayableFlashbackQuestion } from "../src/lib/flashback.mjs";
import {
  createSemanticPublicDeck,
  createSemanticSubjectContext,
  semanticSubjectForQuestion,
  semanticSlotCountForFormats,
  semanticScheduleCacheSize,
  SEMANTIC_SCHEDULE_CACHE_MAX,
} from "../src/lib/semantic-schedule.mjs";

const readQuestions = (name) => JSON.parse(readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), "utf8"));
const questions = [
  ...readQuestions("questions.generated").filter(
    (question) =>
      isPlayableClassicTriviaQuestion(question) &&
      isPlayableShopkeeperQuestion(question) &&
      (question.kind !== "spell-owner" ||
        (question.hint?.trim().length >= 18 && !question.hint.startsWith("No additional mechanical clue"))),
  ),
  ...readQuestions("shopkeeper-questions").filter(isPlayableShopkeeperQuestion),
  ...readQuestions("soundcheck-questions"),
  ...readQuestions("value-order-questions"),
  ...readQuestions("aghanim-questions"),
  ...readQuestions("flashback-questions").filter(isPlayableFlashbackQuestion),
];
const context = createSemanticSubjectContext(questions);
const subjects = new Map(questions.map((question) => [question.id, semanticSubjectForQuestion(question, context)]));
const optionsFor = (formats, seed) => ({
  formats,
  seed,
  getFormat: roundFormatForQuestion,
  poolSeedForFormat: (format) => `${seed}:${format}`,
});

describe("private schedules", () => {
  it("reaches every eligible question without short repeats in all 1,023 game selections", () => {
    for (let mask = 1; mask < 2 ** LIVE_ROUND_GAMES.length; mask += 1) {
      const games = LIVE_ROUND_GAMES.filter((_, index) => mask & (1 << index));
      const formats = formatsForRoundGames(games);
      const options = optionsFor(formats, `all-subsets:${mask}`);
      const deck = createSemanticPublicDeck(questions, { ...options, length: 5_000 });
      const lastQuestions = new Map();
      const lastSubjects = new Map();
      let minimumQuestionGap = Infinity;
      let minimumSubjectGap = Infinity;
      for (let index = 0; index < deck.length; index += 1) {
        const question = deck[index];
        const subject = subjects.get(question.id);
        if (lastQuestions.has(question.id))
          minimumQuestionGap = Math.min(minimumQuestionGap, index - lastQuestions.get(question.id));
        if (lastSubjects.has(subject))
          minimumSubjectGap = Math.min(minimumSubjectGap, index - lastSubjects.get(subject));
        lastQuestions.set(question.id, index);
        lastSubjects.set(subject, index);
        if (roundFormatForQuestion(question) !== formats[index % formats.length])
          throw new Error(`Wrong format in ${games} round ${index}`);
      }
      const eligible = questions.filter((question) => formats.includes(roundFormatForQuestion(question)));
      expect(lastQuestions.size, games.join(",")).toBe(eligible.length);
      expect(minimumSubjectGap, games.join(",")).toBeGreaterThanOrEqual(12);
      expect(minimumQuestionGap, games.join(",")).toBeGreaterThan(50);
      // Batch boundaries and a distant seek must use the same absolute schedule.
      for (const roundOffset of [0, 23, 24, 997, 4_976]) {
        expect(
          createSemanticPublicDeck(questions, { ...options, roundOffset, length: 24 }).map((question) => question.id),
        ).toEqual(deck.slice(roundOffset, roundOffset + 24).map((question) => question.id));
      }
    }
  }, 60_000);

  it("keeps the public slot count and bounds cached party schedules", () => {
    expect(semanticSlotCountForFormats(PUBLIC_ROUND_FORMATS)).toBe(12);
    const options = optionsFor(PUBLIC_ROUND_FORMATS, "eviction-baseline");
    const before = createSemanticPublicDeck(questions, { ...options, length: 50 });
    for (let index = 0; index < SEMANTIC_SCHEDULE_CACHE_MAX * 2; index += 1) {
      createSemanticPublicDeck(questions, { ...optionsFor(PUBLIC_ROUND_FORMATS, `turnover:${index}`), length: 1 });
    }
    expect(semanticScheduleCacheSize(questions)).toBe(SEMANTIC_SCHEDULE_CACHE_MAX);
    expect(createSemanticPublicDeck(questions, { ...options, length: 50 })).toEqual(before);
    expect(semanticScheduleCacheSize(questions)).toBe(SEMANTIC_SCHEDULE_CACHE_MAX);
  });
});
