#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const mapLocations = JSON.parse(
  await readFile(path.join(process.cwd(), "src", "data", "map-sense-locations.json"), "utf8"),
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
const [firstVote, secondVote] = await Promise.all([
  vote(firstSnapshot, firstPlayer, 0),
  vote(secondSnapshot, secondPlayer, 1),
]);
const duplicateVote = await vote(firstSnapshot, firstPlayer, 3);

if (!firstVote.accepted || !secondVote.accepted || duplicateVote.accepted) {
  throw new Error("Vote acceptance or duplicate-vote protection failed.");
}

if (duplicateVote.playerVote?.answerIndex !== 0) {
  throw new Error("A duplicate vote did not preserve the player’s original answer.");
}

const lockedSnapshot = await readRoom(firstPlayer);
if (
  lockedSnapshot.round.id !== firstSnapshot.round.id ||
  lockedSnapshot.playerVote?.answerIndex !== 0 ||
  lockedSnapshot.crowd.total < baselineTotal + 2 ||
  lockedSnapshot.crowd.counts.some((count) => count !== 0)
) {
  throw new Error("The answering-phase room state is not synchronized or is leaking results.");
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

const configuredDataFile = process.env.ARCADE_DATA_FILE?.trim();
const dataFile = path.resolve(process.cwd(), configuredDataFile || ".data/queue-arcade-votes.json");
const persisted = await readFile(dataFile, "utf8");

if (!persisted.includes(firstSnapshot.round.id)) {
  throw new Error("The synchronized round was not written to persistent storage.");
}

if (persisted.includes(firstPlayer) || persisted.includes(secondPlayer)) {
  throw new Error("A raw anonymous player ID was written to persistent storage.");
}

const mapSettings = {
  gameId: "dota2",
  mode: "map-sense",
  filter: "Mixed",
  skillLevel: "Open",
};
const mapPlayer = `multiplayer-map-${randomUUID()}`;
const mapSnapshot = await answeringRoundWithTime(mapPlayer, mapSettings);
const mapLocation = mapLocations.find((location) => `map-location:${location.id}` === mapSnapshot.round.questionId);
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
      mapAnswerScoredOnServer: true,
      mapPinsHiddenUntilReveal: true,
      mapPinRevealed: true,
    },
    null,
    2,
  ),
);
