import { formatsForRoundGames, isLiveRoundGame, isPublicRoundFormat, PUBLIC_ROUND_FORMATS } from "./arcade-games.mjs";
import { roundPhaseAt } from "./round-timing.mjs";

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
/** One private room keeps at most this many seats. Leave frees a seat. */
export const PRIVATE_ROOM_PLAYER_MAX = 100;
export const PRIVATE_ROOM_MAX = 500;
export const PRIVATE_ROOM_SOURCE_MAX = 20;
export const PRIVATE_ROOM_HOST_MAX = 5;
/** Retain recent awards so a late commit can revise the round's crowd bonus. */
export const PRIVATE_ROOM_AWARD_HISTORY_MAX = 128;
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

/** Round IDs look like `<game>:<version>:private:<CODE>:round:<n>` or `…:round:<n>:<startedAt>`. */
export function privateRoomCodeFromRoundId(roundId) {
  if (typeof roundId !== "string") return null;
  const match = /:private:([0-9A-Za-z]{3,16}):round:\d+(?::\d+)?$/.exec(roundId);
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
    phase: roundPhaseAt(now, answerDeadline),
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
  if ((record.members ?? []).length >= PRIVATE_ROOM_PLAYER_MAX) {
    return { full: true };
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
  expireIdlePrivateRooms(now);
  const record = rooms.get(normalizePrivateRoomCode(code) ?? "");
  if (!record) return null;
  record.lastSeenAt = now;
  let nameTakenFlag = false;
  if (identity?.playerId) {
    const result = upsertMember(record, identity.playerId, identity.name, now, identity.applyName);
    if (result.full) {
      markAwayMembers(record, now);
      return { ...publicView(record, identity.playerId), nameTaken: false, full: true };
    }
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
export function addPrivateRoomScore(code, playerId, points, now = Date.now(), roundId = "") {
  const record = rooms.get(normalizePrivateRoomCode(code) ?? "");
  if (!record || typeof playerId !== "string" || !playerId) return null;
  const member = (record.members ?? []).find((entry) => entry.playerId === playerId);
  if (!member) return null;
  const awarded = Math.max(0, Number(points) || 0);
  if (roundId) {
    const pending = Array.isArray(member.pendingAwards) ? member.pendingAwards : [];
    if (!pending.some((entry) => entry.roundId === roundId)) {
      record.awardVersion = (record.awardVersion ?? 0) + 1;
      const history = [...pending, { roundId, points: awarded, version: record.awardVersion }];
      while (history.length > PRIVATE_ROOM_AWARD_HISTORY_MAX) {
        const oldest = history.shift();
        // Keep the accepted base score even if no reveal was read for 128 rounds.
        if (oldest.appliedPoints === undefined) member.score = (Number(member.score) || 0) + oldest.points;
      }
      member.pendingAwards = history;
    }
  } else {
    member.score = (Number(member.score) || 0) + awarded;
  }
  member.lastSeenAt = now;
  record.lastSeenAt = now;
  return publicView(record, playerId);
}

/** Capture before reading votes, so an older read cannot settle a newer award. */
export function privateRoomAwardVersion(code) {
  return rooms.get(normalizePrivateRoomCode(code) ?? "")?.awardVersion ?? 0;
}

/** Reconcile committed awards, including a late vote that changes the crowd bonus. */
export function applyPrivateRoomCrowdBonus(code, roundId, multiplier, now = Date.now(), snapshot) {
  const record = rooms.get(normalizePrivateRoomCode(code) ?? "");
  if (!record || typeof roundId !== "string" || !roundId) return null;
  const factor = Math.max(1, Math.floor(Number(multiplier) || 1));
  for (const member of record.members ?? []) {
    const pending = Array.isArray(member.pendingAwards) ? member.pendingAwards : [];
    const award = pending.find((entry) => entry.roundId === roundId);
    if (!award) continue;
    if (snapshot && (award.version > snapshot.awardVersion || (award.settledTotal ?? 0) > snapshot.total)) continue;
    const points = (Number(award.points) || 0) * factor;
    member.score = (Number(member.score) || 0) + points - (award.appliedPoints ?? 0);
    award.appliedPoints = points;
    if (snapshot) award.settledTotal = snapshot.total;
  }
  record.lastSeenAt = now;
  return publicView(record);
}

/** Unsettled awards from earlier rounds, excluding the round that is still open. */
export function pendingPrivateRoomRoundIds(code, currentRoundId) {
  const record = rooms.get(normalizePrivateRoomCode(code) ?? "");
  if (!record) return [];
  const ids = new Set();
  for (const member of record.members ?? []) {
    for (const award of member.pendingAwards ?? []) {
      if (!award?.roundId || award.roundId === currentRoundId || award.appliedPoints !== undefined) continue;
      ids.add(award.roundId);
    }
  }
  return [...ids];
}

/** Keep base points when a later round starts before this round was settled. */
export function flushStalePrivateRoomScores(code, currentRoundId, now = Date.now()) {
  const record = rooms.get(normalizePrivateRoomCode(code) ?? "");
  if (!record || typeof currentRoundId !== "string" || !currentRoundId) return null;
  for (const roundId of pendingPrivateRoomRoundIds(code, currentRoundId)) {
    applyPrivateRoomCrowdBonus(code, roundId, 1, now);
  }
  record.lastSeenAt = now;
  return publicView(record);
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
  sourceKey = "",
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
  if (rooms.size >= PRIVATE_ROOM_MAX) throw new Error("Private room capacity reached.");
  let hostRooms = 0;
  let sourceRooms = 0;
  for (const active of rooms.values()) {
    if ((active.creatorId ?? active.hostId) === hostId) hostRooms += 1;
    if (sourceKey && active.sourceKey === sourceKey) sourceRooms += 1;
  }
  if (hostRooms >= PRIVATE_ROOM_HOST_MAX) throw new Error("Too many active parties for this player.");
  if (sourceRooms >= PRIVATE_ROOM_SOURCE_MAX) throw new Error("Too many active parties for this connection.");

  const record = {
    code,
    gameId,
    contentVersion,
    roomId: privateRoomId(gameId, contentVersion, code),
    games: selectedGames,
    formats: selectedFormats,
    hostId,
    // Creation quotas stay with the creator when host duties change.
    creatorId: hostId,
    sourceKey,
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
