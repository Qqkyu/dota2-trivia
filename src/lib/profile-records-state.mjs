import { compareFormatMastery } from "./round-identity.mjs";

export const PROFILE_RECORDS_PREVIEW_SIZES = Object.freeze(["short", "long"]);

/** @param {unknown} value */
export function isProfileRecordsPreviewSize(value) {
  return PROFILE_RECORDS_PREVIEW_SIZES.includes(value);
}

const SHARED_PLAYER_FORMATS = [
  {
    format: "classic-ability-values",
    answered: 6,
    correct: 3,
    accuracy: 50,
    firstStageCorrect: 0,
    progressiveAnswered: 0,
  },
  {
    format: "classic-item-prices",
    answered: 2,
    correct: 2,
    accuracy: 100,
    firstStageCorrect: 0,
    progressiveAnswered: 0,
  },
  {
    format: "shopkeeper-builds",
    answered: 4,
    correct: 2,
    accuracy: 50,
    firstStageCorrect: 0,
    progressiveAnswered: 0,
  },
  {
    format: "shopkeeper-paths",
    answered: 3,
    correct: 1,
    accuracy: 33,
    firstStageCorrect: 0,
    progressiveAnswered: 0,
  },
  {
    format: "spell-link",
    answered: 5,
    correct: 4,
    accuracy: 80,
    firstStageCorrect: 2,
    progressiveAnswered: 5,
  },
];

/** @param {"short" | "long"} size */
export function profileRecordsPreview(size) {
  return {
    size,
    formats: compareFormatMastery(
      SHARED_PLAYER_FORMATS,
      size === "long"
        ? [
            { game: "trivia", total: 40, correct: 18 },
            { game: "shopkeeper", total: 20, correct: 14 },
            { game: "spell-link", total: 25, correct: 16 },
            { game: "fogged-vision", total: 12, correct: 5 },
          ]
        : [],
    ),
  };
}
