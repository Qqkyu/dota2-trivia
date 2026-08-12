import { LIVE_ROUND_GAMES, PUBLIC_ROUND_FORMATS, roundGameForFormat } from "./arcade-games.mjs";

export const LIVE_ROUND_IDENTITIES = Object.freeze({
  trivia: { label: "Classic Trivia", look: "A–D values" },
  shopkeeper: { label: "Shopkeeper", look: "item shop" },
  "spell-link": { label: "Spell Link", look: "ability → hero" },
  "fogged-vision": { label: "Fogged", look: "fogged portrait" },
  "echo-hunt": { label: "Echo", look: "voice clip" },
  soundcheck: { label: "Soundcheck", look: "effect sounds" },
  "quote-hunt": { label: "Quotes", look: "written line" },
  "aghanim-lab": { label: "Aghanim's Lab", look: "scepter / shard" },
  "order-up": { label: "Order Up", look: "low to high" },
});

const FORMAT_SLICE_LABELS = Object.freeze({
  "classic-ability-values": "values",
  "classic-hero-stats": "stats",
  "classic-item-prices": "prices",
  "shopkeeper-builds": "builds",
  "shopkeeper-paths": "paths",
});

/** @param {string} game */
export function liveRoundIdentity(game) {
  return LIVE_ROUND_IDENTITIES[game] ?? null;
}

/** @param {1 | 2 | 3 | null | undefined} stage */
export function answerStageLabel(stage) {
  if (stage === 1) return "early";
  if (stage === 2) return "mid";
  if (stage === 3) return "late";
  return null;
}

/** @param {number} submittedAt @param {number} [now] */
export function compactElapsedLabel(submittedAt, now = Date.now()) {
  if (!Number.isFinite(submittedAt) || !Number.isFinite(now) || now < submittedAt) return null;
  const elapsed = now - submittedAt;
  if (elapsed < 60_000) return `${Math.max(1, Math.floor(elapsed / 1_000))}s`;
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h`;
  return `${Math.floor(elapsed / 86_400_000)}d`;
}

/**
 * @param {Array<{ format: string, answered: number, correct?: number, accuracy: number }>} formatStats
 */
export function groupFormatMastery(formatStats) {
  const grouped = new Map(
    LIVE_ROUND_GAMES.map((game) => [
      game,
      {
        game,
        answered: 0,
        correct: 0,
        slices: [],
      },
    ]),
  );

  for (const row of formatStats ?? []) {
    const game = roundGameForFormat(row.format);
    const group = game ? grouped.get(game) : null;
    if (!group) continue;
    const answered = Math.max(0, Math.floor(row.answered));
    const correct =
      typeof row.correct === "number" && Number.isFinite(row.correct)
        ? Math.max(0, Math.floor(row.correct))
        : Math.round((row.accuracy / 100) * answered);
    group.answered += answered;
    group.correct += correct;
    const sliceLabel = FORMAT_SLICE_LABELS[row.format];
    if (sliceLabel && answered > 0) {
      group.slices.push({
        format: row.format,
        label: sliceLabel,
        answered,
        accuracy: row.accuracy,
      });
    }
  }

  return LIVE_ROUND_GAMES.map((game) => {
    const group = grouped.get(game);
    const identity = LIVE_ROUND_IDENTITIES[game];
    return {
      game,
      label: identity.label,
      look: identity.look,
      answered: group.answered,
      accuracy: group.answered ? Math.round((group.correct / group.answered) * 100) : null,
      slices: group.answered && group.slices.length > 1 ? group.slices : [],
    };
  });
}

export function publicFormatsHaveIdentities() {
  return PUBLIC_ROUND_FORMATS.every((format) => LIVE_ROUND_GAMES.includes(roundGameForFormat(format)));
}
