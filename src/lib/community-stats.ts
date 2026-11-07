import { DEFAULT_GAME_ID, GAME_CATALOGS } from "@/lib/game-catalogs";
import { questionCalibrationRevision } from "@/lib/question-revision.mjs";
import { logServerError } from "@/lib/server-diagnostics";
import { gameForQuestion, type RoundGame } from "@/lib/trivia";
import { getQuestionStats } from "@/lib/vote-store";

/**
 * Real numbers that make a quiet room feel less empty while the player base is small.
 * Set ARCADE_COMMUNITY_STATS=off to hide them once rooms fill up.
 *
 * Reads run in the background and every caller gets the last result, so the 5-second presence
 * poll and the round snapshot never wait on the database.
 */
const REFRESH_MS = 60_000;
const MIN_ROUND_TYPE_ANSWERS = 20;

interface CommunityStats {
  roundTypes: Map<RoundGame, { total: number; correct: number }>;
}

const state = ((
  globalThis as typeof globalThis & {
    __queueArcadeCommunityStats?: { stats: CommunityStats | null; refreshedAt: number; refreshing: boolean };
  }
).__queueArcadeCommunityStats ??= { stats: null, refreshedAt: 0, refreshing: false });

async function readStats(): Promise<CommunityStats> {
  const catalog = GAME_CATALOGS[DEFAULT_GAME_ID];
  const questions = new Map(catalog.questions.map((question) => [question.id, question]));
  const revisions = new Map(catalog.questions.map((question) => [question.id, questionCalibrationRevision(question)]));
  const stored = await getQuestionStats(DEFAULT_GAME_ID, catalog.contentVersion, revisions);
  const roundTypes: CommunityStats["roundTypes"] = new Map();
  for (const stats of stored) {
    const question = questions.get(stats.questionId);
    if (!question) continue;
    const game = gameForQuestion(question);
    const entry = roundTypes.get(game) ?? { total: 0, correct: 0 };
    entry.total += stats.counts.reduce((sum, count) => sum + count, 0);
    entry.correct += stats.counts[question.correctIndex] ?? 0;
    roundTypes.set(game, entry);
  }
  return { roundTypes };
}

function latestStats(now = Date.now()) {
  if (process.env.ARCADE_COMMUNITY_STATS === "off") return null;
  if (!state.refreshing && now - state.refreshedAt >= REFRESH_MS) {
    state.refreshing = true;
    void readStats()
      .then((stats) => {
        state.stats = stats;
        state.refreshedAt = now;
      })
      .catch((error) => {
        state.refreshedAt = now;
        logServerError("community-stats.read", error);
      })
      .finally(() => {
        state.refreshing = false;
      });
  }
  return state.stats;
}

/** Visits with at least one answer in the last 24 hours. Visits are not linked, so these are not people. */
/** All-time share of right answers for a round type, once there are enough answers to mean something. */
export function roundTypeAccuracy(game: RoundGame, now = Date.now()) {
  const entry = latestStats(now)?.roundTypes.get(game);
  if (!entry || entry.total < MIN_ROUND_TYPE_ANSWERS) return null;
  return { share: Math.round((entry.correct / entry.total) * 100), total: entry.total };
}
