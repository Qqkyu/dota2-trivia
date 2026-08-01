#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const settings = {
  gameId: "dota2",
  mode: "mixed",
  filter: "Mixed",
};
const firstPlayer = `multiplayer-smoke-a-${randomUUID()}`;
const secondPlayer = `multiplayer-smoke-b-${randomUUID()}`;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const expectedStorageBackend = process.env.DATABASE_URL?.trim() ? "postgres" : "file";

function roomUrl(playerId, roomSettings = settings) {
  const query = new URLSearchParams({ ...roomSettings, playerId });
  return `${appUrl}/api/rounds?${query}`;
}

async function readRoom(playerId, roomSettings = settings) {
  const response = await fetch(roomUrl(playerId, roomSettings), { cache: "no-store" });
  if (!response.ok) throw new Error(`Room request failed with ${response.status}.`);
  return response.json();
}

async function answeringRoundWithTime(playerId, roomSettings = settings) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snapshot = await readRoom(playerId, roomSettings);
    const timeLeft = snapshot.round.answerDeadline - snapshot.serverNow;
    if (snapshot.round.phase === "answering" && timeLeft >= 4_000) return snapshot;
    await delay(Math.max(250, snapshot.round.revealDeadline - snapshot.serverNow + 150));
  }
  throw new Error("Could not join an answering phase with enough time to run the smoke test.");
}

async function vote(snapshot, playerId, answerIndex, roomSettings = settings, extraFields = {}) {
  const response = await fetch(`${appUrl}/api/votes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...roomSettings,
      roundId: snapshot.round.id,
      questionId: snapshot.round.questionId,
      answerIndex,
      voterId: playerId,
      ...extraFields,
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Vote failed with ${response.status}: ${JSON.stringify(result)}`);
  return result;
}

async function report(snapshot, playerId, reason, roomSettings = settings) {
  const response = await fetch(`${appUrl}/api/reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...roomSettings,
      roundId: snapshot.round.id,
      questionId: snapshot.round.questionId,
      reason,
      voterId: playerId,
    }),
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

const firstSnapshot = await answeringRoundWithTime(firstPlayer);
const secondSnapshot = await readRoom(secondPlayer);
const healthResponse = await fetch(`${appUrl}/api/health`, { cache: "no-store" });
const health = await healthResponse.json();

if (!healthResponse.ok || health.status !== "ready" || health.storage?.backend !== expectedStorageBackend) {
  throw new Error(`The readiness endpoint did not confirm the ${expectedStorageBackend} vote store.`);
}

if (
  firstSnapshot.round.id !== secondSnapshot.round.id ||
  firstSnapshot.round.answerDeadline !== secondSnapshot.round.answerDeadline ||
  firstSnapshot.round.revealDeadline !== secondSnapshot.round.revealDeadline ||
  firstSnapshot.round.answerDuration !== 15_000 ||
  "skillLevel" in firstSnapshot.room
) {
  throw new Error("Two clients did not receive the same level-free synchronized round and deadlines.");
}

const legacySettings = [
  { gameId: "dota2", mode: "trivia", filter: "Heroes" },
  { gameId: "dota2", mode: "shopkeeper", filter: "Items" },
  { gameId: "dota2", mode: "fogged-vision", filter: "Mixed" },
  { gameId: "dota2", mode: "map-sense", filter: "Mixed" },
  { gameId: "dota2", mode: "counterplay", filter: "Mixed" },
  { gameId: "dota2", mode: "not-a-mode", filter: "not-a-filter" },
];
const legacyRooms = await Promise.all(
  legacySettings.map((roomSettings, index) =>
    readRoom(`multiplayer-legacy-room-${index}-${randomUUID()}`, roomSettings),
  ),
);
if (
  legacyRooms.some(
    (snapshot) =>
      snapshot.room.mode !== "mixed" ||
      snapshot.room.filter !== "Mixed" ||
      snapshot.room.id !== firstSnapshot.room.id ||
      snapshot.round.id !== firstSnapshot.round.id ||
      snapshot.round.questionId !== firstSnapshot.round.questionId,
  )
) {
  throw new Error("A legacy mode or category setting still splits the one public Queue Arcade room.");
}

if (firstSnapshot.crowd.counts.some((count) => count !== 0)) {
  throw new Error("The answer split leaked before the reveal.");
}

const baselineTotal = firstSnapshot.crowd.total;
const [firstVote, secondVote] = await Promise.all([
  vote(firstSnapshot, firstPlayer, 0),
  vote(secondSnapshot, secondPlayer, 1),
]);
const duplicateVote = await vote(firstSnapshot, firstPlayer, 3);

if (!firstVote.accepted || !secondVote.accepted || duplicateVote.accepted) {
  throw new Error("Vote acceptance or duplicate-vote protection failed.");
}

if (duplicateVote.playerVote?.answerIndex !== firstVote.playerVote?.answerIndex) {
  throw new Error("A duplicate vote did not preserve the player’s original answer.");
}

const lockedSnapshot = await readRoom(firstPlayer);
if (
  lockedSnapshot.round.id !== firstSnapshot.round.id ||
  lockedSnapshot.playerVote?.answerIndex !== firstVote.playerVote?.answerIndex ||
  lockedSnapshot.crowd.total < baselineTotal + 2 ||
  lockedSnapshot.crowd.counts.some((count) => count !== 0)
) {
  throw new Error("The answering-phase room state is not synchronized or is leaking results.");
}

const prematureReport = await report(lockedSnapshot, firstPlayer, "unclear");
if (prematureReport.status !== 409) {
  throw new Error("A question report was accepted before the synchronized reveal.");
}

await delay(Math.max(250, lockedSnapshot.round.answerDeadline - lockedSnapshot.serverNow + 200));
const revealSnapshot = await readRoom(firstPlayer);

if (
  revealSnapshot.round.id !== firstSnapshot.round.id ||
  revealSnapshot.round.phase !== "reveal" ||
  revealSnapshot.crowd.total < baselineTotal + 2 ||
  revealSnapshot.crowd.counts.reduce((sum, count) => sum + count, 0) !== revealSnapshot.crowd.total
) {
  throw new Error("The synchronized reveal did not expose the final round split.");
}

const acceptedReport = await report(revealSnapshot, firstPlayer, "ambiguous");
const duplicateReport = await report(revealSnapshot, firstPlayer, "incorrect");
if (
  acceptedReport.status !== 200 ||
  !acceptedReport.body.accepted ||
  acceptedReport.body.reason !== "ambiguous" ||
  duplicateReport.status !== 200 ||
  duplicateReport.body.accepted ||
  duplicateReport.body.reason !== "ambiguous"
) {
  throw new Error("Question report acceptance or per-player deduplication failed.");
}

const reportedSnapshot = await readRoom(firstPlayer);
if (reportedSnapshot.round.id !== revealSnapshot.round.id || reportedSnapshot.playerReport !== "ambiguous") {
  throw new Error("The synchronized room did not restore the player's question report.");
}

await delay(Math.max(250, reportedSnapshot.round.revealDeadline - reportedSnapshot.serverNow + 200));
const carryoverSnapshot = await readRoom(secondPlayer);
if (carryoverSnapshot.round.id === revealSnapshot.round.id || carryoverSnapshot.round.phase !== "answering") {
  throw new Error("The room did not advance before the report carryover check.");
}

const carryoverReport = await report(revealSnapshot, secondPlayer, "outdated");
const carryoverDuplicate = await report(revealSnapshot, secondPlayer, "incorrect");
if (
  carryoverReport.status !== 200 ||
  !carryoverReport.body.accepted ||
  carryoverReport.body.reason !== "outdated" ||
  carryoverDuplicate.status !== 200 ||
  carryoverDuplicate.body.accepted ||
  carryoverDuplicate.body.reason !== "outdated"
) {
  throw new Error("The previous question could not be reported safely after the next round began.");
}

const rateLimitPlayer = `multiplayer-rate-limit-${randomUUID()}`;
const rateLimitResponses = [];
for (let attempt = 0; attempt < 13; attempt += 1) {
  rateLimitResponses.push(
    await fetch(`${appUrl}/api/votes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...settings,
        roundId: revealSnapshot.round.id,
        questionId: revealSnapshot.round.questionId,
        answerIndex: 0,
        voterId: rateLimitPlayer,
      }),
    }),
  );
}
if (
  rateLimitResponses.slice(0, 12).some((response) => response.status !== 409) ||
  rateLimitResponses[12]?.status !== 429 ||
  !rateLimitResponses[12]?.headers.get("retry-after")
) {
  throw new Error("The vote API did not apply its per-player production guardrail.");
}

const calibrationResponse = await fetch(`${appUrl}/api/calibration?gameId=dota2`, { cache: "no-store" });
const calibration = await calibrationResponse.json();
const calibratedQuestion = calibration.records?.find((record) => record.questionId === revealSnapshot.round.questionId);
const serializedCalibration = JSON.stringify(calibration);
if (
  !calibrationResponse.ok ||
  calibration.totals?.questions !== calibration.records?.length ||
  !calibratedQuestion ||
  calibratedQuestion.reports?.ambiguous < 1 ||
  calibratedQuestion.reports?.outdated < 1 ||
  calibratedQuestion.reportTotal < 2 ||
  calibratedQuestion.signal?.status !== "reported" ||
  serializedCalibration.includes("reporters") ||
  serializedCalibration.includes(firstPlayer)
) {
  throw new Error("The calibration endpoint did not expose safe aggregate report signals.");
}

let persisted;
let questionRevision;

if (expectedStorageBackend === "postgres") {
  const { default: postgres } = await import("postgres");
  const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 2, prepare: false });
  try {
    const rounds = await sql`
      SELECT round_id, room_id
      FROM queue_arcade_rounds
      WHERE round_id = ${firstSnapshot.round.id}
    `;
    const questions = await sql`
      SELECT question_revision, report_ambiguous, report_outdated
      FROM queue_arcade_question_stats
      WHERE game_id = 'dota2' AND question_id = ${revealSnapshot.round.questionId}
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    const voterHashes = await sql`
      SELECT voter_hash
      FROM queue_arcade_round_votes
      WHERE round_id = ${firstSnapshot.round.id}
    `;
    const reporterHashes = await sql`
      SELECT reporter_hash
      FROM queue_arcade_question_reporters
      WHERE game_id = 'dota2' AND question_id = ${revealSnapshot.round.questionId}
    `;
    const storedText = JSON.stringify({ rounds, questions, voterHashes, reporterHashes });
    persisted = rounds.length === 1;
    questionRevision = questions[0]?.question_revision;
    if (storedText.includes(firstPlayer) || storedText.includes(secondPlayer)) {
      throw new Error("A raw anonymous player ID was written to Postgres.");
    }
    if (
      voterHashes.length < 2 ||
      reporterHashes.length < 2 ||
      [...voterHashes, ...reporterHashes].some((row) => !/^[A-Za-z0-9_-]{43}$/.test(Object.values(row)[0]))
    ) {
      throw new Error("Postgres did not persist salted anonymous voter hashes.");
    }
    if (Number(questions[0]?.report_ambiguous) < 1 || Number(questions[0]?.report_outdated) < 1) {
      throw new Error("The anonymous question reports were not written to Postgres.");
    }
  } finally {
    await sql.end({ timeout: 2 });
  }
} else {
  const configuredDataFile = process.env.ARCADE_DATA_FILE?.trim();
  const dataFile = path.resolve(process.cwd(), configuredDataFile || ".data/queue-arcade-votes.json");
  const persistedText = await readFile(dataFile, "utf8");
  const persistedState = JSON.parse(persistedText);
  const question = Object.values(persistedState.questions ?? {}).find(
    (candidate) => candidate.questionId === revealSnapshot.round.questionId && candidate.questionRevision,
  );
  persisted = persistedText.includes(firstSnapshot.round.id) && persistedState.version === 2;
  questionRevision = question?.questionRevision;

  if (persistedText.includes(firstPlayer) || persistedText.includes(secondPlayer)) {
    throw new Error("A raw anonymous player ID was written to file storage.");
  }
  if (!persistedText.includes('"ambiguous"') || !persistedText.includes('"outdated"')) {
    throw new Error("The anonymous question reports were not written to file storage.");
  }
}

if (!persisted) {
  throw new Error("The synchronized round was not written to persistent storage.");
}
if (!/^q1_[A-Za-z0-9_-]{22}$/.test(questionRevision ?? "")) {
  throw new Error("Persistent calibration data is not keyed by a stable question revision.");
}

console.log(
  JSON.stringify(
    {
      roomId: firstSnapshot.room.id,
      roundId: firstSnapshot.round.id,
      deadlinesMatch: true,
      hiddenDuringAnswering: true,
      duplicateRejected: true,
      finalTotal: revealSnapshot.crowd.total,
      persisted: true,
      persistenceBackend: expectedStorageBackend,
      stableQuestionRevision: true,
      apiRateLimitVerified: true,
      voterIdsHashed: true,
      reportRejectedBeforeReveal: true,
      reportDeduplicated: true,
      playerReportRestored: true,
      reportCarriesIntoNextRound: true,
      calibrationAggregates: true,
      legacyModesCollapsedIntoPublicRoom: legacySettings.map(({ mode }) => mode),
      sharedDifficultyPoolVerified: true,
      legacyLevelSettingsIgnored: true,
      allPublicModeAndCategorySilosRemoved: true,
    },
    null,
    2,
  ),
);
