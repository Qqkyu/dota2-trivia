import { groupFormatMastery, liveRoundIdentity } from "./round-identity.mjs";

export const PROFILE_RECORDS_PREVIEW_SIZES = Object.freeze(["short", "long"]);

/** @param {unknown} value */
export function isProfileRecordsPreviewSize(value) {
  return PROFILE_RECORDS_PREVIEW_SIZES.includes(value);
}

/**
 * Selecting a format may dim rows, but it must never change how many recent
 * answers are rendered. Filtering is what collapsed the panel.
 *
 * @template {{ game?: string }} Row
 * @param {Row[]} recent
 * @param {string | null | undefined} selectedGame
 * @returns {Array<Row & { dimmed: boolean, highlighted: boolean }>}
 */
export function presentProfileRecent(recent, selectedGame) {
  return (recent ?? []).map((round) => ({
    ...round,
    dimmed: Boolean(selectedGame) && round.game !== selectedGame,
    highlighted: Boolean(selectedGame) && round.game === selectedGame,
  }));
}

function previewRound(index, game, correct) {
  const identity = liveRoundIdentity(game);
  return {
    roundId: `preview-${game}-${index}`,
    game,
    label: identity?.label ?? game,
    correct,
    detail: correct ? "early · 2m" : "3m",
  };
}

/** @param {"short" | "long"} size */
export function profileRecordsPreview(size) {
  const games =
    size === "short"
      ? ["trivia", "shopkeeper"]
      : [
          "trivia",
          "shopkeeper",
          "spell-link",
          "echo-hunt",
          "soundcheck",
          "quote-hunt",
          "aghanim-lab",
          "order-up",
          "trivia",
          "shopkeeper",
        ];

  return {
    size,
    formats: groupFormatMastery([
      { format: "classic-ability-values", answered: 6, correct: 3, accuracy: 50 },
      { format: "classic-item-prices", answered: 2, correct: 2, accuracy: 100 },
      { format: "shopkeeper-builds", answered: 4, correct: 2, accuracy: 50 },
      { format: "shopkeeper-paths", answered: 3, correct: 1, accuracy: 33 },
      { format: "spell-link", answered: 5, correct: 4, accuracy: 80 },
    ]),
    recent: games.map((game, index) => previewRound(index, game, index % 2 === 0)),
  };
}
