#!/usr/bin/env node

/**
 * Party API checks without a browser: Echo Hunt audio must play inside a
 * private room, and only party members may chat or vote there.
 */

import { randomUUID } from "node:crypto";

const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const json = { "Content-Type": "application/json", Origin: new URL(appUrl).origin };

const hostId = `party-host-${randomUUID()}`;
const guestId = `party-guest-${randomUUID()}`;
const strangerId = `party-stranger-${randomUUID()}`;
const code = `A${Date.now().toString(36).slice(-5).toUpperCase()}`;
const settings = { gameId: "dota2", mode: "mixed", filter: "Mixed", privateCode: code };

async function post(path, body) {
  const response = await fetch(`${appUrl}${path}`, { method: "POST", headers: json, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function readRound(playerId) {
  const url = new URL(`${appUrl}/api/rounds`);
  for (const [key, value] of Object.entries({ ...settings, playerId })) url.searchParams.set(key, value);
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
  throw new Error(`Party did not reach ${phase}.`);
}

const created = await post("/api/private-rooms", { playerId: hostId, code, name: "Host", games: ["echo-hunt"] });
if (created.status !== 200) throw new Error(`Could not create the party (${created.status}).`);
const joined = await post("/api/private-rooms", { action: "join", code, playerId: guestId, name: "Guest" });
if (joined.status !== 200) throw new Error(`Guest could not join (${joined.status}).`);
const started = await post("/api/private-rooms/start", { playerId: hostId, code });
if (started.status !== 200) throw new Error(`Could not start the party (${started.status}).`);

const answering = await waitPhase(hostId, "answering", 30_000);
const audioSrc = answering.question?.audio?.src;
if (typeof audioSrc !== "string" || !audioSrc.startsWith("/api/round-audio?")) {
  throw new Error(`Echo Hunt party round has no proxied audio (${JSON.stringify(answering.question?.audio)}).`);
}
const mediaUrl = new URL(audioSrc, appUrl);
for (const method of ["GET", "HEAD"]) {
  const denied = await fetch(mediaUrl, { method, cache: "no-store" });
  if (denied.status !== 403) throw new Error(`A stranger could request party audio with ${method} (${denied.status}).`);
}
const imageDenied = await fetch(`${appUrl}/api/round-image?roundId=${encodeURIComponent(answering.round.id)}`);
if (imageDenied.status !== 403) throw new Error(`A stranger could request party images (${imageDenied.status}).`);
mediaUrl.searchParams.set("playerId", hostId);
const audio = await fetch(mediaUrl, { cache: "no-store" });
if (audio.status === 409 || audio.status === 404 || audio.status === 400) {
  throw new Error(`Party round audio was refused with ${audio.status}; the proxy only knows the public room.`);
}
if (audio.status !== 200 && audio.status !== 206) {
  throw new Error(`Party round audio returned ${audio.status} (upstream audio host may be unreachable).`);
}
await audio.arrayBuffer();

const strangerVote = await post("/api/votes", {
  ...settings,
  roundId: answering.round.id,
  answerIndex: 0,
  answerKey: "npc_dota_hero_axe",
  voterId: strangerId,
});
if (strangerVote.status !== 403) {
  throw new Error(`A stranger could vote in the party (${strangerVote.status} ${JSON.stringify(strangerVote.body)}).`);
}
const hostVote = await post("/api/votes", {
  ...settings,
  roundId: answering.round.id,
  answerIndex: 0,
  answerKey: "npc_dota_hero_axe",
  voterId: hostId,
});
if (hostVote.status !== 200 || !hostVote.body?.accepted) {
  throw new Error(`The host could not vote in the party (${hostVote.status} ${JSON.stringify(hostVote.body)}).`);
}
const guestVote = await post("/api/votes", {
  ...settings,
  roundId: answering.round.id,
  answerIndex: 0,
  answerKey: "npc_dota_hero_axe",
  voterId: guestId,
});
if (guestVote.status !== 200 || !guestVote.body?.accepted) {
  throw new Error(`The guest could not vote in the party (${guestVote.status} ${JSON.stringify(guestVote.body)}).`);
}
const strangerChat = await post("/api/private-rooms/messages", { code, playerId: strangerId, text: "hi" });
if (strangerChat.status !== 403) {
  throw new Error(`A stranger could chat in the party (${strangerChat.status}).`);
}
const spoofedChat = await post("/api/private-rooms/messages", { code, playerId: hostId, name: "Not Host", text: "gg" });
const lastMessage = spoofedChat.body?.privateRoom?.messages?.at(-1);
if (spoofedChat.status !== 200 || lastMessage?.name !== "Host" || lastMessage?.text !== "gg") {
  throw new Error(`Chat did not use the roster name (${spoofedChat.status} ${JSON.stringify(lastMessage)}).`);
}
const peek = await fetch(`${appUrl}/api/private-rooms?code=${code}&peek=1`).then((response) => response.json());
const peekNames = new Set(peek.privateRoom?.players?.map((player) => player.name) ?? []);
if (!peekNames.has("Host") || !peekNames.has("Guest") || peekNames.size !== 2) {
  throw new Error(`A stranger's vote joined the roster (${JSON.stringify(peek.privateRoom?.players)}).`);
}

const hostLeft = await post("/api/private-rooms/leave", { playerId: hostId, code });
if (hostLeft.status !== 200) throw new Error(`Host could not leave (${hostLeft.status}).`);
const oldHostStart = await post("/api/private-rooms/start", { playerId: hostId, code });
if (oldHostStart.status !== 403) {
  throw new Error(`The old host could start after leaving (${oldHostStart.status}).`);
}
const newHostStart = await post("/api/private-rooms/start", { playerId: guestId, code });
if (newHostStart.status !== 200) {
  throw new Error(`New host could not start (${newHostStart.status} ${JSON.stringify(newHostStart.body)}).`);
}

const reveal = await waitPhase(guestId, "reveal", 30_000);
const prewarm = await fetch(
  `${appUrl}/api/round-audio?roundId=${encodeURIComponent(reveal.round.id)}&playerId=${guestId}`,
  {
    method: "HEAD",
    cache: "no-store",
  },
);
if (prewarm.status !== 204) throw new Error(`Party next-round audio prewarm returned ${prewarm.status}.`);

console.log("Validated member-only party audio, images, votes and chat, and host pass.");
