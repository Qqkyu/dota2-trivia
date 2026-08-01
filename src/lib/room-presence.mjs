import { createHash } from "node:crypto";

export const ROOM_PRESENCE_TTL_MS = 45_000;

const globalPresence = globalThis;
globalPresence.__queueArcadeRoomPresence ??= new Map();

function presenceHash(roomId, voterId) {
  const salt = process.env.ARCADE_VOTER_SALT || "queue-arcade-local-v1";
  return createHash("sha256").update(`${salt}:presence:${roomId}:${voterId}`).digest("base64url");
}

function activeRoom(roomId, now) {
  const room = globalPresence.__queueArcadeRoomPresence.get(roomId);
  if (!room) return null;
  const expiresBefore = now - ROOM_PRESENCE_TTL_MS;
  for (const [playerHash, lastSeenAt] of room) {
    if (lastSeenAt < expiresBefore) room.delete(playerHash);
  }
  if (!room.size) {
    globalPresence.__queueArcadeRoomPresence.delete(roomId);
    return null;
  }
  return room;
}

export function getRoomPresence(roomId, now = Date.now()) {
  return activeRoom(roomId, now)?.size ?? 0;
}

export function touchRoomPresence(roomId, voterId, now = Date.now()) {
  const room = activeRoom(roomId, now) ?? new Map();
  room.set(presenceHash(roomId, voterId), now);
  globalPresence.__queueArcadeRoomPresence.set(roomId, room);
  return room.size;
}
