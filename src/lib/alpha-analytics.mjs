export const ALPHA_SESSION_RETENTION_DAYS = 30;

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** @param {unknown} value */
export function isAlphaSessionId(value) {
  return typeof value === "string" && SESSION_ID_PATTERN.test(value);
}

function utcDay(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * @param {Array<{
 *   visitorHash: string;
 *   startedAt: number;
 *   lastSeenAt: number;
 *   finishedAt: number | null;
 *   roundsAnswered: number;
 *   correctAnswers: number;
 * }>} sessions
 * @param {{ now?: number; windowDays?: number; dailyDays?: number }} [options]
 */
export function summarizeAlphaSessions(sessions, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const windowDays = Number.isInteger(options.windowDays) && options.windowDays > 0 ? options.windowDays : 30;
  const dailyDays = Number.isInteger(options.dailyDays) && options.dailyDays > 0 ? options.dailyDays : 14;
  const since = now - windowDays * 24 * 60 * 60 * 1_000;
  const eligible = sessions.filter(
    (session) =>
      typeof session.visitorHash === "string" &&
      Number.isFinite(session.startedAt) &&
      session.startedAt >= since &&
      session.startedAt <= now + 60_000,
  );
  const visitsByPlayer = new Map();
  let rounds = 0;
  let correct = 0;
  let totalDurationMs = 0;

  for (const session of eligible) {
    visitsByPlayer.set(session.visitorHash, (visitsByPlayer.get(session.visitorHash) ?? 0) + 1);
    rounds += Math.max(0, Number(session.roundsAnswered) || 0);
    correct += Math.max(0, Number(session.correctAnswers) || 0);
    const end = Math.max(
      Number.isFinite(session.lastSeenAt) ? session.lastSeenAt : session.startedAt,
      Number.isFinite(session.finishedAt) ? session.finishedAt : session.startedAt,
    );
    totalDurationMs += Math.max(0, Math.min(24 * 60 * 60 * 1_000, end - session.startedAt));
  }

  const players = visitsByPlayer.size;
  const returningPlayers = [...visitsByPlayer.values()].filter((visits) => visits > 1).length;
  const dailyStart = new Date(now);
  dailyStart.setUTCHours(0, 0, 0, 0);
  dailyStart.setUTCDate(dailyStart.getUTCDate() - dailyDays + 1);
  const daily = Array.from({ length: dailyDays }, (_, index) => {
    const timestamp = dailyStart.getTime() + index * 24 * 60 * 60 * 1_000;
    return { date: utcDay(timestamp), sessions: 0, players: 0, rounds: 0, playerHashes: new Set() };
  });
  const dailyByDate = new Map(daily.map((day) => [day.date, day]));
  for (const session of eligible) {
    const day = dailyByDate.get(utcDay(session.startedAt));
    if (!day) continue;
    day.sessions += 1;
    day.rounds += Math.max(0, Number(session.roundsAnswered) || 0);
    day.playerHashes.add(session.visitorHash);
  }

  return {
    windowDays,
    sessions: eligible.length,
    players,
    returningPlayers,
    returnRate: players ? Math.round((returningPlayers / players) * 100) : 0,
    rounds,
    correct,
    accuracy: rounds ? Math.round((correct / rounds) * 100) : 0,
    roundsPerSession: eligible.length ? Math.round((rounds / eligible.length) * 10) / 10 : 0,
    averageMinutes: eligible.length ? Math.round((totalDurationMs / eligible.length / 60_000) * 10) / 10 : 0,
    daily: daily.map(({ playerHashes, ...day }) => ({ ...day, players: playerHashes.size })),
  };
}
