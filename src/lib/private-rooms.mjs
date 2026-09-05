import { formatsForRoundGames, isLiveRoundGame, isPublicRoundFormat, PUBLIC_ROUND_FORMATS } from "./arcade-games.mjs";

export const PRIVATE_ROOM_CODE_MIN = 3;
export const PRIVATE_ROOM_CODE_MAX = 16;
export const PRIVATE_ROOM_CODE_LENGTH = PRIVATE_ROOM_CODE_MAX;
export const PRIVATE_ROOM_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
export const PRIVATE_ROOM_IDLE_MS = 30 * 60 * 1000;
/**
 * A player who stops polling (closed tab, lost network, suspended phone) is
 * marked away after this long. Away players keep their seat and score, so a
 * returning tab never loses anything; they only leave the ranking view and
 * hand off host duty. Background tabs throttle timers to about once a
 * minute, so this must stay well above 60s or minimised players look away.
 */
export const PRIVATE_ROOM_MEMBER_TIMEOUT_MS = 90_000;
export const PRIVATE_ROOM_POLL_MS = 1_000;
export const PRIVATE_ROOM_MAX_MESSAGES = 40;
export const PRIVATE_ROOM_MESSAGE_MAX = 80;
export const PRIVATE_ROOM_NAME_MAX = 24;
export const PRIVATE_ROOM_NAME_NOTICE_MS = 2_500;
export const PRIVATE_ROOM_COUNTDOWN_MS = 3_000;

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
  const server = typeof selfName === "string" ? selfName.trim() : "";
  if (server) return server;
  return typeof displayName === "string" ? displayName.trim() : "";
}

export function partyNameSeed({ serverName, displayName }) {
  const server = typeof serverName === "string" ? serverName.trim() : "";
  if (server) return server;
  return typeof displayName === "string" ? displayName : "";
}

export function partyNameInputValue({ draft, seed }) {
  if (draft !== null && draft !== undefined) return String(draft);
  return typeof seed === "string" ? seed : "";
}

export function storedPartyNameDraft(stored) {
  if (typeof stored !== "string") return null;
  const trimmed = stored.trim();
  if (!trimmed) return null;
  return stored.slice(0, PRIVATE_ROOM_NAME_MAX);
}

export function privateRoomId(gameId, contentVersion, code) {
  return `${gameId}:${contentVersion}:private:${code}`;
}

export function isPrivateRoomId(roomId) {
  return typeof roomId === "string" && roomId.includes(":private:");
}

/** Round IDs look like `<game>:<version>:private:<CODE>:round:<n>`; public rounds have no code. */
export function privateRoomCodeFromRoundId(roundId) {
  if (typeof roundId !== "string") return null;
  const match = /:private:([0-9A-Za-z]{3,16}):round:\d+$/.exec(roundId);
  return match ? normalizePrivateRoomCode(match[1]) : null;
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

export function privateRoomWaiting(record, now = Date.now()) {
  return record.startedAt == null || now < record.startedAt;
}

export function privateRoomCountdownMs(record, now = Date.now()) {
  if (record.startedAt == null || now >= record.startedAt) return 0;
  return record.startedAt - now;
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
      score: Number(member.score) || 0,
      away: Boolean(member.away),
    })),
    messages: record.messages.map((message) => ({
      id: message.id,
      name: message.name,
      text: message.text,
      at: message.at,
    })),
    nameTaken: false,
  };
}

function nameTaken(record, playerId, name) {
  const needle = name.toLowerCase();
  return (record.members ?? []).some((member) => member.playerId !== playerId && member.name.toLowerCase() === needle);
}

function uniqueAutoName(record, playerId, base) {
  if (!nameTaken(record, playerId, base)) return base;
  let suffix = 2;
  let next = `${base}${suffix}`;
  while (nameTaken(record, playerId, next)) {
    suffix += 1;
    next = `${base}${suffix}`;
  }
  return next;
}

function upsertMember(record, playerId, name, now, applyName) {
  if (!record.members) record.members = [];
  const cleaned = sanitizeLine(name, PRIVATE_ROOM_NAME_MAX);
  const shouldApply = applyName ?? Boolean(cleaned);
  const existing = record.members.find((member) => member.playerId === playerId);
  if (existing) {
    if (shouldApply && cleaned) {
      if (nameTaken(record, playerId, cleaned)) {
        existing.lastSeenAt = now;
        return { nameTaken: true };
      }
      existing.name = cleaned;
    }
    existing.lastSeenAt = now;
    return { nameTaken: false };
  }
  record.members.push({
    playerId,
    name: uniqueAutoName(record, playerId, cleaned || guestDisplayName(playerId)),
    lastSeenAt: now,
    score: 0,
  });
  return { nameTaken: false };
}

export function expireIdlePrivateRooms(now = Date.now()) {
  for (const [code, record] of rooms) {
    if (now >= record.lastSeenAt && now - record.lastSeenAt >= PRIVATE_ROOM_IDLE_MS) rooms.delete(code);
  }
}

/** Flag members nobody has heard from; pass host to an active player. Nobody is removed. */
function markAwayMembers(record, now) {
  for (const member of record.members ?? []) {
    member.away = now >= member.lastSeenAt && now - member.lastSeenAt >= PRIVATE_ROOM_MEMBER_TIMEOUT_MS;
  }
  const host = (record.members ?? []).find((member) => member.playerId === record.hostId);
  const active = (record.members ?? []).find((member) => !member.away);
  if ((!host || host.away) && active) record.hostId = active.playerId;
}

export function getPrivateRoom(code, now = Date.now(), viewerId) {
  expireIdlePrivateRooms(now);
  const normalized = normalizePrivateRoomCode(code);
  if (!normalized) return null;
  const record = rooms.get(normalized);
  if (!record) return null;
  markAwayMembers(record, now);
  return publicView(record, viewerId);
}

export function touchPrivateRoom(code, now = Date.now(), identity) {
  const record = rooms.get(normalizePrivateRoomCode(code) ?? "");
  if (!record) return null;
  record.lastSeenAt = now;
  let nameTakenFlag = false;
  if (identity?.playerId) {
    const result = upsertMember(record, identity.playerId, identity.name, now, identity.applyName);
    nameTakenFlag = Boolean(result.nameTaken);
  }
  markAwayMembers(record, now);
  return { ...publicView(record, identity?.playerId), nameTaken: nameTakenFlag };
}

/** The member record for a player in a party, or null for strangers. */
export function privateRoomMember(code, playerId) {
  const record = rooms.get(normalizePrivateRoomCode(code) ?? "");
  if (!record || typeof playerId !== "string" || !playerId) return null;
  const member = (record.members ?? []).find((entry) => entry.playerId === playerId);
  return member ? { playerId: member.playerId, name: member.name } : null;
}

/** Only players already on the roster can score; a vote never joins a party. */
export function addPrivateRoomScore(code, playerId, points, now = Date.now()) {
  const record = rooms.get(normalizePrivateRoomCode(code) ?? "");
  if (!record || typeof playerId !== "string" || !playerId) return null;
  const member = (record.members ?? []).find((entry) => entry.playerId === playerId);
  if (!member) return null;
  member.score = (Number(member.score) || 0) + Math.max(0, Number(points) || 0);
  member.lastSeenAt = now;
  record.lastSeenAt = now;
  return publicView(record, playerId);
}

export function leavePrivateRoom(code, playerId, now = Date.now()) {
  const key = normalizePrivateRoomCode(code) ?? "";
  const record = rooms.get(key);
  if (!record) return null;
  record.members = (record.members ?? []).filter((member) => member.playerId !== playerId);
  record.lastSeenAt = now;
  if (record.members.length === 0) {
    rooms.delete(key);
    return null;
  }
  if (!record.members.some((member) => member.playerId === record.hostId)) {
    record.hostId = record.members[0].playerId;
  }
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
  const names = (record.members ?? []).map((member) => member.name.toLowerCase());
  if (new Set(names).size !== names.length) return { ok: false, reason: "names" };
  if (record.startedAt != null) return { ok: true, alreadyStarted: true, room: publicView(record) };
  record.startedAt = now + PRIVATE_ROOM_COUNTDOWN_MS;
  record.lastSeenAt = now;
  return { ok: true, alreadyStarted: false, room: publicView(record) };
}

/** Chat lines carry the sender's roster name; the client never names itself. */
export function addPrivateRoomMessage(code, { playerId, text, now = Date.now() }) {
  const record = rooms.get(normalizePrivateRoomCode(code) ?? "");
  if (!record) return { ok: false, reason: "missing" };
  const member = (record.members ?? []).find((entry) => entry.playerId === playerId);
  if (!member) return { ok: false, reason: "forbidden" };
  const cleanedText = sanitizeLine(text, PRIVATE_ROOM_MESSAGE_MAX);
  if (!cleanedText) return { ok: false, reason: "empty" };
  const message = {
    id: `m${record.nextMessageId}`,
    name: member.name,
    text: cleanedText,
    at: now,
  };
  record.nextMessageId += 1;
  record.messages.push(message);
  if (record.messages.length > PRIVATE_ROOM_MAX_MESSAGES) {
    record.messages.splice(0, record.messages.length - PRIVATE_ROOM_MAX_MESSAGES);
  }
  member.lastSeenAt = now;
  record.lastSeenAt = now;
  return { ok: true, message, room: publicView(record, playerId) };
}

export function guestDisplayName(playerId) {
  const tail = String(playerId ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-8)
    .toUpperCase();
  return tail ? `Guest-${tail}` : "Guest";
}

export function resetPrivateRoomsForTests() {
  rooms.clear();
}

/**
 * Roster helpers for the party panel. Away players keep their seat and
 * score and stay listed with a tag; only Leave removes anyone.
 */
export function partyPlayerTag(player) {
  if (player.away && !player.self) return "Away";
  if (player.host) return "Host";
  if (player.self) return "You";
  return "";
}

export function rankPartyPlayers(players) {
  return [...players].sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
}

export function partyLobbyRoster(players) {
  return [...players].sort((left, right) => Number(right.self) - Number(left.self));
}
