import { formatsForRoundGames, isLiveRoundGame, isPublicRoundFormat, PUBLIC_ROUND_FORMATS } from "./arcade-games.mjs";

export const PRIVATE_ROOM_CODE_MIN = 3;
export const PRIVATE_ROOM_CODE_MAX = 16;
export const PRIVATE_ROOM_CODE_LENGTH = PRIVATE_ROOM_CODE_MAX;
export const PRIVATE_ROOM_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const PRIVATE_ROOM_IDLE_MS = 30 * 60 * 1000;
export const PRIVATE_ROOM_POLL_MS = 1_000;
export const PRIVATE_ROOM_MEMBER_TTL_MS = 3_000;
export const PRIVATE_ROOM_MAX_MESSAGES = 40;
export const PRIVATE_ROOM_MESSAGE_MAX = 80;
export const PRIVATE_ROOM_NAME_MAX = 24;

const globalStore = globalThis;
const rooms = globalStore.__queueArcadePrivateRooms ?? new Map();
globalStore.__queueArcadePrivateRooms = rooms;

export function normalizePrivateRoomCode(value) {
  if (typeof value !== "string") return null;
  const code = value
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "");
  if (code.length < PRIVATE_ROOM_CODE_MIN || code.length > PRIVATE_ROOM_CODE_MAX) return null;
  if ([...code].some((character) => !PRIVATE_ROOM_CODE_ALPHABET.includes(character))) return null;
  return code;
}

export function partyCodeError(value) {
  if (typeof value !== "string" || !value.trim()) return "Type a party code.";
  if (!normalizePrivateRoomCode(value)) {
    return `Use ${PRIVATE_ROOM_CODE_MIN}-${PRIVATE_ROOM_CODE_MAX} letters or numbers.`;
  }
  return null;
}

export function partyNameError(value) {
  if (typeof value !== "string" || !sanitizeLine(value, PRIVATE_ROOM_NAME_MAX)) return "Type a name.";
  return null;
}

export function visiblePartyName({ partyName, displayName, selfName }) {
  const typed = typeof partyName === "string" ? partyName.trim() : "";
  if (typed) return typed;
  const account = typeof displayName === "string" ? displayName.trim() : "";
  if (account) return account;
  return typeof selfName === "string" ? selfName.trim() : "";
}

export function privateRoomId(gameId, contentVersion, code) {
  return `${gameId}:${contentVersion}:private:${code}`;
}

export function isPrivateRoomId(roomId) {
  return typeof roomId === "string" && roomId.includes(":private:");
}

export function normalizePrivateFormats(formats) {
  const unique = [...new Set(Array.isArray(formats) ? formats : [])].filter(isPublicRoundFormat);
  return unique.length > 0 ? unique : [...PUBLIC_ROUND_FORMATS];
}

export function normalizePrivateGames(games) {
  const unique = [...new Set(Array.isArray(games) ? games : [])].filter(isLiveRoundGame);
  return unique;
}

function sanitizeLine(value, max) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function privateRoundTiming(startedAt, now, answerMs = 15_000, revealMs = 7_000) {
  const cycle = answerMs + revealMs;
  const roundNumber = Math.max(0, Math.floor((now - startedAt) / cycle));
  const roundStartedAt = startedAt + roundNumber * cycle;
  const answerDeadline = roundStartedAt + answerMs;
  const revealDeadline = answerDeadline + revealMs;
  return {
    roundNumber,
    startedAt: roundStartedAt,
    answerDeadline,
    revealDeadline,
    answerDuration: answerMs,
    phase: now < answerDeadline ? "answering" : "reveal",
  };
}

function publicView(record, viewerId) {
  return {
    code: record.code,
    roomId: record.roomId,
    gameId: record.gameId,
    contentVersion: record.contentVersion,
    games: [...record.games],
    formats: [...record.formats],
    hostId: record.hostId,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
    lastSeenAt: record.lastSeenAt,
    players: (record.members ?? []).map((member) => ({
      name: member.name,
      host: member.playerId === record.hostId,
      self: Boolean(viewerId) && member.playerId === viewerId,
    })),
    messages: record.messages.map((message) => ({
      id: message.id,
      name: message.name,
      text: message.text,
      at: message.at,
    })),
  };
}

function upsertMember(record, playerId, name, now) {
  if (!record.members) record.members = [];
  const cleaned = sanitizeLine(name, PRIVATE_ROOM_NAME_MAX) || guestDisplayName(playerId);
  const existing = record.members.find((member) => member.playerId === playerId);
  if (existing) {
    existing.name = cleaned;
    existing.lastSeenAt = now;
    return;
  }
  record.members.push({ playerId, name: cleaned, lastSeenAt: now });
}

function pruneMembers(record, now) {
  if (!record.members) return;
  record.members = record.members.filter((member) => now - member.lastSeenAt < PRIVATE_ROOM_MEMBER_TTL_MS);
}

export function expireIdlePrivateRooms(now = Date.now()) {
  for (const [code, record] of rooms) {
    if (now >= record.lastSeenAt && now - record.lastSeenAt >= PRIVATE_ROOM_IDLE_MS) rooms.delete(code);
  }
}

export function getPrivateRoom(code, now = Date.now(), viewerId) {
  expireIdlePrivateRooms(now);
  const normalized = normalizePrivateRoomCode(code);
  if (!normalized) return null;
  const record = rooms.get(normalized);
  if (!record) return null;
  pruneMembers(record, now);
  return publicView(record, viewerId);
}

export function touchPrivateRoom(code, now = Date.now(), identity) {
  const record = rooms.get(normalizePrivateRoomCode(code) ?? "");
  if (!record) return null;
  record.lastSeenAt = now;
  if (identity?.playerId) upsertMember(record, identity.playerId, identity.name, now);
  pruneMembers(record, now);
  return publicView(record, identity?.playerId);
}

export function leavePrivateRoom(code, playerId, now = Date.now()) {
  const record = rooms.get(normalizePrivateRoomCode(code) ?? "");
  if (!record) return null;
  record.members = (record.members ?? []).filter((member) => member.playerId !== playerId);
  record.lastSeenAt = now;
  pruneMembers(record, now);
  return publicView(record);
}

export function createPrivateRoom({
  hostId,
  gameId,
  contentVersion,
  games,
  code: requestedCode,
  name,
  now = Date.now(),
}) {
  if (typeof hostId !== "string" || hostId.length < 8 || hostId.length > 80) {
    throw new Error("Invalid private-room host.");
  }
  if (typeof gameId !== "string" || typeof contentVersion !== "string" || !contentVersion) {
    throw new Error("Invalid private-room catalog.");
  }

  expireIdlePrivateRooms(now);
  const selectedGames = normalizePrivateGames(games);
  if (selectedGames.length === 0) throw new Error("Pick at least one game.");
  const selectedFormats = formatsForRoundGames(selectedGames);
  const code = normalizePrivateRoomCode(requestedCode);
  if (!code) throw new Error("Pick a party code.");
  if (rooms.has(code)) throw new Error("That code is taken.");

  const record = {
    code,
    gameId,
    contentVersion,
    roomId: privateRoomId(gameId, contentVersion, code),
    games: selectedGames,
    formats: selectedFormats,
    hostId,
    createdAt: now,
    startedAt: null,
    lastSeenAt: now,
    members: [],
    messages: [],
    nextMessageId: 1,
  };
  upsertMember(record, hostId, name, now);
  rooms.set(code, record);
  return publicView(record, hostId);
}

export function startPrivateRoom(code, playerId, now = Date.now()) {
  const record = rooms.get(normalizePrivateRoomCode(code) ?? "");
  if (!record) return { ok: false, reason: "missing" };
  if (record.hostId !== playerId) return { ok: false, reason: "forbidden" };
  if (record.startedAt != null) return { ok: true, alreadyStarted: true, room: publicView(record) };
  record.startedAt = now;
  record.lastSeenAt = now;
  return { ok: true, alreadyStarted: false, room: publicView(record) };
}

export function addPrivateRoomMessage(code, { name, text, now = Date.now() }) {
  const record = rooms.get(normalizePrivateRoomCode(code) ?? "");
  if (!record) return { ok: false, reason: "missing" };
  const cleanedText = sanitizeLine(text, PRIVATE_ROOM_MESSAGE_MAX);
  if (!cleanedText) return { ok: false, reason: "empty" };
  const cleanedName = sanitizeLine(name, PRIVATE_ROOM_NAME_MAX) || "Guest";
  const message = {
    id: `m${record.nextMessageId}`,
    name: cleanedName,
    text: cleanedText,
    at: now,
  };
  record.nextMessageId += 1;
  record.messages.push(message);
  if (record.messages.length > PRIVATE_ROOM_MAX_MESSAGES) {
    record.messages.splice(0, record.messages.length - PRIVATE_ROOM_MAX_MESSAGES);
  }
  record.lastSeenAt = now;
  return { ok: true, message, room: publicView(record) };
}

export function guestDisplayName(playerId) {
  const tail = String(playerId ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-4)
    .toUpperCase();
  return tail ? `Guest-${tail}` : "Guest";
}

export function resetPrivateRoomsForTests() {
  rooms.clear();
}
