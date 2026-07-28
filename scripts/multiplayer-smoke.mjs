#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const mapLocations = JSON.parse(
  await readFile(path.join(process.cwd(), "src", "data", "map-sense-locations.json"), "utf8"),
);
const mapChallenges = JSON.parse(
  await readFile(path.join(process.cwd(), "src", "data", "map-sense-challenges.json"), "utf8"),
);
const mapCrops = JSON.parse(await readFile(path.join(process.cwd(), "src", "data", "map-sense-crops.json"), "utf8"));
const counterplayQuestions = JSON.parse(
  await readFile(path.join(process.cwd(), "src", "data", "counterplay-questions.json"), "utf8"),
);
const settings = {
  gameId: "dota2",
  mode: "mixed",
  filter: "Mixed",
  skillLevel: "Open",
};
const firstPlayer = `multiplayer-smoke-a-${randomUUID()}`;
const secondPlayer = `multiplayer-smoke-b-${randomUUID()}`;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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

if (
  firstSnapshot.round.id !== secondSnapshot.round.id ||
  firstSnapshot.round.answerDeadline !== secondSnapshot.round.answerDeadline ||
  firstSnapshot.round.revealDeadline !== secondSnapshot.round.revealDeadline
) {
  throw new Error("Two clients did not receive the same synchronized round and deadlines.");
}

if (firstSnapshot.crowd.counts.some((count) => count !== 0)) {
  throw new Error("The answer split leaked before the reveal.");
}

const baselineTotal = firstSnapshot.crowd.total;
const mixedMapPositions =
  firstSnapshot.round.game === "map-sense"
    ? [{ mapPosition: { x: 0.42, y: 0.42 } }, { mapPosition: { x: 0.58, y: 0.58 } }]
    : [{}, {}];
const [firstVote, secondVote] = await Promise.all([
  vote(firstSnapshot, firstPlayer, 0, settings, mixedMapPositions[0]),
  vote(secondSnapshot, secondPlayer, 1, settings, mixedMapPositions[1]),
]);
const duplicateVote = await vote(
  firstSnapshot,
  firstPlayer,
  3,
  settings,
  firstSnapshot.round.game === "map-sense" ? { mapPosition: { x: 0.01, y: 0.01 } } : {},
);

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

const configuredDataFile = process.env.ARCADE_DATA_FILE?.trim();
const dataFile = path.resolve(process.cwd(), configuredDataFile || ".data/queue-arcade-votes.json");
const persisted = await readFile(dataFile, "utf8");

if (!persisted.includes(firstSnapshot.round.id)) {
  throw new Error("The synchronized round was not written to persistent storage.");
}

if (persisted.includes(firstPlayer) || persisted.includes(secondPlayer)) {
  throw new Error("A raw anonymous player ID was written to persistent storage.");
}

if (!persisted.includes('"ambiguous"') || !persisted.includes('"outdated"')) {
  throw new Error("The anonymous question report was not written to persistent storage.");
}

const mapSettings = {
  gameId: "dota2",
  mode: "map-sense",
  filter: "Mixed",
  skillLevel: "Learning",
};
const mapPlayer = `multiplayer-map-${randomUUID()}`;
const mapSnapshot = await answeringRoundWithTime(mapPlayer, mapSettings);
const [mapKind, ...mapDefinitionParts] = mapSnapshot.round.questionId.split(":");
const mapDefinitionId = mapDefinitionParts.join(":");
const challengeKinds = {
  "map-riddle": "riddle",
  "map-mirror": "mirror",
  "map-relative": "relative",
  "map-scenario": "scenario",
};
const [cropTier, cropId] = mapDefinitionId.split(":");
const crop = mapKind === "map-crop" ? mapCrops[cropTier]?.find((candidate) => candidate.id === cropId) : null;
const mapLocation = crop
  ? { target: { x: crop.x, y: crop.y } }
  : mapKind === "map-location"
    ? mapLocations.find((location) => location.id === mapDefinitionId)
    : mapChallenges.find(
        (challenge) => challenge.id === mapDefinitionId && challenge.family === challengeKinds[mapKind],
      );
if (!mapLocation) throw new Error("The synchronized Map Sense round referenced an unknown location.");

const mapPosition = mapLocation.target;
const mapVote = await vote(mapSnapshot, mapPlayer, 3, mapSettings, { mapPosition });
const mapDuplicate = await vote(mapSnapshot, mapPlayer, 3, mapSettings, {
  mapPosition: { x: 0.01, y: 0.01 },
});
if (
  !mapVote.accepted ||
  mapVote.playerVote?.answerIndex !== 0 ||
  mapVote.playerVote?.mapPosition?.x !== mapPosition.x ||
  mapVote.playerVote?.mapPosition?.y !== mapPosition.y ||
  mapDuplicate.accepted ||
  mapDuplicate.playerVote?.mapPosition?.x !== mapPosition.x ||
  mapDuplicate.playerVote?.mapPosition?.y !== mapPosition.y
) {
  throw new Error("Map Sense vote validation, server-side scoring, or duplicate protection failed.");
}

const lockedMapSnapshot = await readRoom(mapPlayer, mapSettings);
if (
  lockedMapSnapshot.crowd.positions.length !== 0 ||
  lockedMapSnapshot.playerVote?.mapPosition?.x !== mapPosition.x ||
  lockedMapSnapshot.playerVote?.mapPosition?.y !== mapPosition.y
) {
  throw new Error("Map Sense leaked room pins before reveal or failed to restore the player's pin.");
}

await delay(Math.max(250, lockedMapSnapshot.round.answerDeadline - lockedMapSnapshot.serverNow + 200));
const revealedMapSnapshot = await readRoom(mapPlayer, mapSettings);
const ownPinRevealed = revealedMapSnapshot.crowd.positions.some(
  (position) => position.x === mapPosition.x && position.y === mapPosition.y,
);
if (revealedMapSnapshot.round.phase !== "reveal" || !ownPinRevealed) {
  throw new Error("Map Sense did not reveal the anonymous room pins after the shared deadline.");
}

const choiceSettings = {
  gameId: "dota2",
  mode: "map-sense",
  filter: "Mixed",
  skillLevel: "Veteran",
};
const choicePlayer = `multiplayer-map-choice-${randomUUID()}`;
let choiceSnapshot = await answeringRoundWithTime(choicePlayer, choiceSettings);
if (choiceSnapshot.round.questionId.startsWith("map-crop:")) {
  await delay(Math.max(250, choiceSnapshot.round.revealDeadline - choiceSnapshot.serverNow + 150));
  choiceSnapshot = await answeringRoundWithTime(choicePlayer, choiceSettings);
}
if (
  !["map-camp-block", "map-stack-route", "map-tp-in"].some((kind) => choiceSnapshot.round.questionId.startsWith(kind))
) {
  throw new Error("The Veteran Map Sense room did not advance to a Dota mechanics choice round.");
}

const choiceVote = await vote(choiceSnapshot, choicePlayer, 0, choiceSettings);
const choiceDuplicate = await vote(choiceSnapshot, choicePlayer, 3, choiceSettings);
if (
  !choiceVote.accepted ||
  choiceVote.playerVote?.answerIndex !== 0 ||
  choiceVote.playerVote?.mapPosition ||
  choiceDuplicate.accepted ||
  choiceDuplicate.playerVote?.answerIndex !== 0
) {
  throw new Error("Map Sense choice voting or duplicate protection failed.");
}

await delay(Math.max(250, choiceSnapshot.round.answerDeadline - choiceSnapshot.serverNow + 200));
const revealedChoiceSnapshot = await readRoom(choicePlayer, choiceSettings);
if (
  revealedChoiceSnapshot.round.phase !== "reveal" ||
  revealedChoiceSnapshot.crowd.total < 1 ||
  revealedChoiceSnapshot.crowd.counts.reduce((sum, count) => sum + count, 0) !== revealedChoiceSnapshot.crowd.total ||
  revealedChoiceSnapshot.crowd.positions.length !== 0
) {
  throw new Error("Map Sense choice answers did not reveal as a synchronized A–D split.");
}

const counterplayLearningSettings = {
  gameId: "dota2",
  mode: "counterplay",
  filter: "Mixed",
  skillLevel: "Learning",
};
const counterplayVeteranSettings = {
  ...counterplayLearningSettings,
  skillLevel: "Veteran",
};
const learningCounterplayPlayer = `multiplayer-counterplay-learning-${randomUUID()}`;
const veteranCounterplayPlayer = `multiplayer-counterplay-veteran-${randomUUID()}`;
const [learningCounterplay, veteranCounterplay] = await Promise.all([
  answeringRoundWithTime(learningCounterplayPlayer, counterplayLearningSettings),
  answeringRoundWithTime(veteranCounterplayPlayer, counterplayVeteranSettings),
]);
const learningDefinition = counterplayQuestions.find(
  (question) => question.id === learningCounterplay.round.questionId,
);
const veteranDefinition = counterplayQuestions.find((question) => question.id === veteranCounterplay.round.questionId);
if (
  learningCounterplay.round.game !== "counterplay" ||
  veteranCounterplay.round.game !== "counterplay" ||
  learningCounterplay.round.answerDuration !== 18_000 ||
  veteranCounterplay.round.answerDuration !== 15_000 ||
  learningDefinition?.difficulty !== 1 ||
  (veteranDefinition?.difficulty ?? 0) < 2
) {
  throw new Error("Counterplay public rooms did not respect Learning and Veteran pools.");
}
const counterplayVote = await vote(veteranCounterplay, veteranCounterplayPlayer, 0, counterplayVeteranSettings);
const counterplayDuplicate = await vote(veteranCounterplay, veteranCounterplayPlayer, 3, counterplayVeteranSettings);
if (
  !counterplayVote.accepted ||
  counterplayVote.playerVote?.mapPosition ||
  counterplayDuplicate.accepted ||
  counterplayDuplicate.playerVote?.answerIndex !== 0
) {
  throw new Error("Counterplay voting or duplicate protection failed.");
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
      voterIdsHashed: true,
      reportRejectedBeforeReveal: true,
      reportDeduplicated: true,
      playerReportRestored: true,
      reportCarriesIntoNextRound: true,
      calibrationAggregates: true,
      mapAnswerScoredOnServer: true,
      mapPinsHiddenUntilReveal: true,
      mapPinRevealed: true,
      mapChoiceAcceptedWithoutPin: true,
      mapChoiceSplitRevealed: true,
      counterplaySkillPoolsVerified: true,
      counterplayVoteAccepted: true,
    },
    null,
    2,
  ),
);
