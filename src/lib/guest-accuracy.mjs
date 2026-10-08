export const GUEST_PENDING_VOTES_KEY = "queue-arcade:pending-votes:v2";
export const GUEST_SETTLED_ROUNDS_KEY = "queue-arcade:settled-rounds:v2";
export const PENDING_VOTE_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_PENDING = 24;
const MAX_SETTLED = 200;
const MAX_ROUND_ID_LENGTH = 512;
const GUEST_RUN_SCORES_KEY = "queue-arcade:run-scores:v1";

function readList(storage, key) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeList(storage, key, values) {
  try {
    storage?.setItem(key, JSON.stringify(values));
  } catch {
    // Callers use safeBrowserStorage. A supplied unavailable store is optional too.
  }
}

function validRoundId(roundId) {
  return typeof roundId === "string" && roundId.length > 0 && roundId.length <= MAX_ROUND_ID_LENGTH;
}

function sameScope(entry, { playerId = "", roomId = "" } = {}) {
  return entry.playerId === playerId && (!roomId || entry.roundId.startsWith(`${roomId}:round:`));
}

function pendingEntries(storage, now) {
  return readList(storage, GUEST_PENDING_VOTES_KEY)
    .filter(
      (entry) =>
        entry &&
        validRoundId(entry.roundId) &&
        typeof entry.playerId === "string" &&
        Number.isFinite(entry.at) &&
        entry.at <= now &&
        now - entry.at < PENDING_VOTE_MAX_AGE_MS,
    )
    .slice(-MAX_PENDING);
}

/** @param {{getItem: Function, setItem: Function}} storage
 * @param {{playerId?: string, roomId?: string, now?: number}} scope */
export function guestPendingRoundIds(storage, scope = {}) {
  const pending = pendingEntries(storage, scope.now ?? Date.now());
  writeList(storage, GUEST_PENDING_VOTES_KEY, pending);
  return pending.filter((entry) => sameScope(entry, scope)).map((entry) => entry.roundId);
}

/** @param {{getItem: Function, setItem: Function}} storage
 * @param {string} roundId
 * @param {{playerId?: string, roomId?: string, now?: number}} scope */
export function rememberGuestPendingVote(storage, roundId, scope = {}) {
  if (!storage || !validRoundId(roundId)) return;
  if (scope.roomId && !roundId.startsWith(`${scope.roomId}:round:`)) return;
  const now = scope.now ?? Date.now();
  const playerId = scope.playerId ?? "";
  const pending = pendingEntries(storage, now).filter(
    (entry) => entry.roundId !== roundId || entry.playerId !== playerId,
  );
  pending.push({ roundId, playerId, at: now });
  writeList(storage, GUEST_PENDING_VOTES_KEY, pending.slice(-MAX_PENDING));
}

/** @param {{getItem: Function, setItem: Function}} storage
 * @param {string} roundId
 * @param {{playerId?: string, roomId?: string, now?: number}} scope */
export function forgetGuestPendingVote(storage, roundId, scope = {}) {
  writeList(
    storage,
    GUEST_PENDING_VOTES_KEY,
    pendingEntries(storage, scope.now ?? Date.now()).filter(
      (entry) => entry.roundId !== roundId || !sameScope(entry, scope),
    ),
  );
}

export function guestRoundIsSettled(storage, roundId, scope = {}) {
  return readList(storage, GUEST_SETTLED_ROUNDS_KEY).some(
    (entry) => entry?.roundId === roundId && sameScope(entry, scope),
  );
}

/** Deduplicate lifetime persistence for this voter, independently of a tab's session. */
export function markGuestRoundSettled(storage, roundId, scope = {}) {
  if (!storage || !validRoundId(roundId)) return false;
  forgetGuestPendingVote(storage, roundId, scope);
  if (guestRoundIsSettled(storage, roundId, scope)) return false;
  const settled = readList(storage, GUEST_SETTLED_ROUNDS_KEY).filter((entry) => entry && validRoundId(entry.roundId));
  settled.push({ roundId, playerId: scope.playerId ?? "" });
  writeList(storage, GUEST_SETTLED_ROUNDS_KEY, settled.slice(-MAX_SETTLED));
  return true;
}

export function readGuestLifetimeStats(storage, key) {
  let value;
  try {
    value = JSON.parse(storage.getItem(key) ?? "{}");
  } catch {
    value = {};
  }
  const positiveInteger = (number) => (Number.isSafeInteger(number) && number >= 0 ? number : 0);
  const answered = positiveInteger(value?.answered);
  return {
    runs: positiveInteger(value?.runs),
    answered,
    correct: Math.min(answered, positiveInteger(value?.correct)),
    bestScore: positiveInteger(value?.bestScore),
  };
}

export function applyGuestLifetimeStats(stats, { correct, startedRun, nextScore }) {
  return {
    runs: stats.runs + (startedRun ? 1 : 0),
    answered: stats.answered + 1,
    correct: stats.correct + (correct ? 1 : 0),
    bestScore: Math.max(stats.bestScore, nextScore),
  };
}

/** Keep recent run scores editable when a late vote changes the crowd bonus. */
export function reconcileGuestRunBest(storage, runId, nextScore, previousBest) {
  let saved;
  try {
    saved = JSON.parse(storage.getItem(GUEST_RUN_SCORES_KEY) ?? "null");
  } catch {
    saved = null;
  }
  let historicalBest =
    Number.isSafeInteger(saved?.historicalBest) && saved.historicalBest >= 0 ? saved.historicalBest : previousBest;
  const runs = (Array.isArray(saved?.runs) ? saved.runs : []).filter(
    (run) => typeof run?.id === "string" && run.id !== runId && Number.isSafeInteger(run.score) && run.score >= 0,
  );
  runs.push({ id: runId, score: nextScore });
  while (runs.length > 200) historicalBest = Math.max(historicalBest, runs.shift().score);
  storage.setItem(GUEST_RUN_SCORES_KEY, JSON.stringify({ historicalBest, runs }));
  return Math.max(historicalBest, ...runs.map((run) => run.score));
}
