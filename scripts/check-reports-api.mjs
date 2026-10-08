#!/usr/bin/env node

/**
 * Reports a private-room reveal, rejects a duplicate, then reports the old round
 * after the next one starts.
 */

import { randomUUID } from "node:crypto";

const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const hostId = `report-host-${randomUUID()}`;
const guestId = `report-guest-${randomUUID()}`;
const code = `R${Date.now().toString(36).slice(-5).toUpperCase()}`;
const settings = { gameId: "dota2", mode: "mixed", filter: "Mixed", privateCode: code };

const created = await fetch(`${appUrl}/api/private-rooms`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: new URL(appUrl).origin },
  body: JSON.stringify({ playerId: hostId, code, name: "Reporter", games: ["trivia"] }),
});
if (!created.ok) {
  throw new Error(`Could not create a party for reports (${created.status} ${await created.text()}).`);
}

const joined = await fetch(`${appUrl}/api/private-rooms`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: new URL(appUrl).origin },
  body: JSON.stringify({ action: "join", playerId: guestId, code, name: "Guest reporter" }),
});
if (!joined.ok) {
  throw new Error(`Could not join the report party (${joined.status} ${await joined.text()}).`);
}

const started = await fetch(`${appUrl}/api/private-rooms/start`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: new URL(appUrl).origin },
  body: JSON.stringify({ playerId: hostId, code }),
});
if (!started.ok) {
  throw new Error(`Could not start the party for reports (${started.status} ${await started.text()}).`);
}

async function readRound(playerId) {
  const url = new URL(`${appUrl}/api/rounds`);
  url.searchParams.set("gameId", "dota2");
  url.searchParams.set("mode", "mixed");
  url.searchParams.set("filter", "Mixed");
  url.searchParams.set("privateCode", code);
  url.searchParams.set("playerId", playerId);
  const response = await fetch(url, { cache: "no-store" });
  return { status: response.status, body: await response.json() };
}

async function waitPhase(playerId, phase, timeout) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const snapshot = await readRound(playerId);
    if (snapshot.status === 200 && snapshot.body.round?.phase === phase) return snapshot.body;
    await delay(200);
  }
  throw new Error(`Did not reach ${phase} for the report check.`);
}

async function report(roundId, playerId, reason) {
  const response = await fetch(`${appUrl}/api/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: new URL(appUrl).origin },
    body: JSON.stringify({ ...settings, roundId, reason, voterId: playerId }),
  });
  return { status: response.status, body: await response.json() };
}

const reveal = await waitPhase(hostId, "reveal", 30_000);
const accepted = await report(reveal.round.id, hostId, "ambiguous");
const duplicate = await report(reveal.round.id, hostId, "incorrect");
if (
  accepted.status !== 200 ||
  !accepted.body.accepted ||
  accepted.body.reason !== "ambiguous" ||
  duplicate.status !== 200 ||
  duplicate.body.accepted ||
  duplicate.body.reason !== "ambiguous"
) {
  throw new Error(`Report accept/dedupe failed (${JSON.stringify({ accepted, duplicate })}).`);
}

const nextRound = await waitPhase(guestId, "answering", 15_000);
if (nextRound.round.id === reveal.round.id) {
  throw new Error("The party did not advance before the report carryover check.");
}

const carryover = await report(reveal.round.id, guestId, "outdated");
const carryoverDuplicate = await report(reveal.round.id, guestId, "incorrect");
if (
  carryover.status !== 200 ||
  !carryover.body.accepted ||
  carryover.body.reason !== "outdated" ||
  carryoverDuplicate.status !== 200 ||
  carryoverDuplicate.body.accepted ||
  carryoverDuplicate.body.reason !== "outdated"
) {
  throw new Error(`Report carryover failed (${JSON.stringify({ carryover, carryoverDuplicate })}).`);
}

console.log("Validated question reports: accept, dedupe, and next-round carryover.");
