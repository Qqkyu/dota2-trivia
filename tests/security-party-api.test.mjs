import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ACCOUNT_SESSION_COOKIE } from "../src/lib/steam-auth.mjs";
import {
  getPrivateRoom,
  privateRoomMember,
  resetPrivateRoomsForTests,
  PRIVATE_ROOM_SOURCE_MAX,
  PRIVATE_ROOM_HOST_MAX,
  PRIVATE_ROOM_IDLE_MS,
} from "../src/lib/private-rooms.mjs";

const { sessionUser } = vi.hoisted(() => ({ sessionUser: vi.fn() }));
vi.mock("../src/lib/account-store", () => ({
  getUserBySession: sessionUser,
  createAccountSession: vi.fn(),
  deleteAccountSession: vi.fn(),
}));
vi.mock("../src/lib/game-catalogs", () => ({
  DEFAULT_GAME_ID: "dota2",
  GAME_CATALOGS: { dota2: { id: "dota2", contentVersion: "security-test" } },
  isGameId: (value) => value === "dota2",
}));

import { GET as readRoom, POST as updateRoom } from "../src/app/api/private-rooms/route.ts";
import { POST as leaveRoom } from "../src/app/api/private-rooms/leave/route.ts";
import { POST as startRoom } from "../src/app/api/private-rooms/start/route.ts";
import { POST as sendMessage } from "../src/app/api/private-rooms/messages/route.ts";

const origin = "https://arcade.example";
const code = "SECURITYTEST";
const hostId = "guest-host-123";
const guestId = "guest-visitor-123";

function post(body, headers = {}) {
  return new NextRequest(`${origin}/api/private-rooms`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function createRoom(headers = {}) {
  const response = await updateRoom(post({ code, playerId: hostId, name: "Host", games: ["flashback"] }, headers));
  expect(response.status).toBe(200);
  return response.json();
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("ARCADE_APP_URL", origin);
  sessionUser.mockReset().mockResolvedValue(null);
  resetPrivateRoomsForTests();
});

afterEach(() => {
  resetPrivateRoomsForTests();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("active party creation quotas", () => {
  function createParty(index, playerId = `quota-host-${index}`, address = "192.0.2.10") {
    return updateRoom(post({ code: `QUOTA${index}`, playerId, games: ["flashback"] }, { "x-real-ip": address }));
  }

  it("blocks rotated player IDs at one source without filling global room capacity", async () => {
    vi.stubEnv("ARCADE_TRUST_PROXY", "x-real-ip");
    for (let index = 0; index < PRIVATE_ROOM_SOURCE_MAX; index += 1) {
      const response = await createParty(index);
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(JSON.stringify(payload)).not.toMatch(/sourceKey|creatorId|192\.0\.2\.10/);
    }
    const blocked = await createParty("OVERFLOW");
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/connection/);
    const internal = globalThis.__queueArcadePrivateRooms.get("QUOTA0");
    expect(internal.sourceKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await createParty("OTHER", "other-connection-host", "192.0.2.11")).status).toBe(200);
  });

  it("keeps the creator quota after host handoff and ignores spoofed untrusted addresses", async () => {
    vi.stubEnv("ARCADE_TRUST_PROXY", "none");
    for (let index = 0; index < PRIVATE_ROOM_HOST_MAX; index += 1) {
      expect((await createParty(index, hostId, `192.0.2.${index + 10}`)).status).toBe(200);
    }
    const joined = await updateRoom(post({ action: "join", code: "QUOTA0", playerId: guestId, name: "Guest" }));
    expect(joined.status).toBe(200);
    expect((await leaveRoom(post({ code: "QUOTA0", playerId: hostId }))).status).toBe(200);
    expect(getPrivateRoom("QUOTA0").hostId).toBe(guestId);
    const blocked = await createParty("OVERFLOW", hostId, "198.51.100.10");
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/player/);
    expect((await leaveRoom(post({ code: "QUOTA0", playerId: guestId }))).status).toBe(200);
    expect((await createParty("RELEASED", hostId)).status).toBe(200);
  });

  it("releases source capacity when a party empties or expires", async () => {
    vi.stubEnv("ARCADE_TRUST_PROXY", "x-real-ip");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T00:00:00Z"));
    for (let index = 0; index < PRIVATE_ROOM_SOURCE_MAX; index += 1) {
      expect((await createParty(index)).status).toBe(200);
    }
    expect((await createParty("BLOCKED")).status).toBe(429);
    expect((await leaveRoom(post({ code: "QUOTA0", playerId: "quota-host-0" }))).status).toBe(200);
    expect((await createParty("REPLACEMENT")).status).toBe(200);
    vi.setSystemTime(Date.now() + PRIVATE_ROOM_IDLE_MS);
    expect((await createParty("EXPIRED")).status).toBe(200);
    expect(globalThis.__queueArcadePrivateRooms.size).toBe(1);
  });
});

describe("explicit party membership mutations", () => {
  it("a GET cannot join or rename a guest", async () => {
    await createRoom();
    const stranger = await readRoom(
      new NextRequest(`${origin}/api/private-rooms?code=${code}&playerId=${guestId}&name=Injected`),
    );
    expect(stranger.status).toBe(403);
    expect(privateRoomMember(code, guestId)).toBeNull();
    const host = await readRoom(
      new NextRequest(`${origin}/api/private-rooms?code=${code}&playerId=${hostId}&name=Injected`),
    );
    expect(host.status).toBe(200);
    expect(privateRoomMember(code, hostId)?.name).toBe("Host");
  });

  it("a cookie-authenticated GET cannot change the account's party name", async () => {
    sessionUser.mockResolvedValue({ id: "known-account", displayName: "Steam player" });
    const cookie = `${ACCOUNT_SESSION_COOKIE}=${"a".repeat(43)}`;
    await createRoom({ cookie });
    const response = await readRoom(
      new NextRequest(`${origin}/api/private-rooms?code=${code}&name=Injected`, { headers: { cookie } }),
    );
    expect(response.status).toBe(200);
    expect(privateRoomMember(code, "account:known-account")?.name).toBe("Host");
  });

  it("joins explicitly, refreshes without a name change, then renames explicitly", async () => {
    await createRoom();
    expect((await updateRoom(post({ action: "touch", code, playerId: guestId }))).status).toBe(403);
    const joined = await updateRoom(post({ action: "join", code, playerId: guestId, name: "Guest" }));
    expect(joined.status).toBe(200);
    expect(privateRoomMember(code, guestId)?.name).toBe("Guest");
    const touched = await updateRoom(post({ action: "touch", code, playerId: guestId, name: "Injected" }));
    expect(touched.status).toBe(200);
    expect(privateRoomMember(code, guestId)?.name).toBe("Guest");
    const renamed = await updateRoom(post({ action: "rename", code, playerId: guestId, name: "New name" }));
    expect(renamed.status).toBe(200);
    expect(privateRoomMember(code, guestId)?.name).toBe("New name");
    const snapshot = await readRoom(new NextRequest(`${origin}/api/private-rooms?code=${code}&playerId=${guestId}`));
    expect((await snapshot.json()).privateRoom.players.find((player) => player.self)?.name).toBe("New name");
  });

  it.each([updateRoom, startRoom, leaveRoom, sendMessage])("rejects a cross-origin party mutation", async (handler) => {
    await createRoom();
    const before = getPrivateRoom(code);
    const response = await handler(
      post({ code, playerId: hostId, text: "Forged" }, { origin: "https://other.example" }),
    );
    expect(response.status).toBe(403);
    expect(getPrivateRoom(code).players).toEqual(before.players);
    expect(getPrivateRoom(code).messages).toEqual(before.messages);
    expect(getPrivateRoom(code).startedAt).toBeNull();
  });

  it("does not let a guest claim a known account member", async () => {
    sessionUser.mockResolvedValue({ id: "known-account", displayName: "Steam player" });
    await createRoom({ cookie: `${ACCOUNT_SESSION_COOKIE}=${"a".repeat(43)}` });
    sessionUser.mockResolvedValue(null);
    const response = await startRoom(post({ code, playerId: "account:known-account" }));
    expect(response.status).toBe(400);
    expect(getPrivateRoom(code).startedAt).toBeNull();
  });

  it("does not let a stranger remove a member and returns success when the final member leaves", async () => {
    await createRoom();
    expect((await leaveRoom(post({ code, playerId: guestId }))).status).toBe(403);
    expect(privateRoomMember(code, hostId)).not.toBeNull();
    const response = await leaveRoom(post({ code, playerId: hostId }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ left: true });
    expect(getPrivateRoom(code)).toBeNull();
  });

  it("rejects a non-JSON or oversized body before any membership changes", async () => {
    await createRoom();
    const wrongType = await updateRoom(
      post({ action: "join", code, playerId: guestId }, { "content-type": "text/plain" }),
    );
    expect(wrongType.status).toBe(415);
    const oversized = await updateRoom(post({ action: "join", code, playerId: guestId, name: "x".repeat(9_000) }));
    expect(oversized.status).toBe(413);
    expect(privateRoomMember(code, guestId)).toBeNull();
  });

  it("allows a full party to join and keep polling behind one address", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ARCADE_TRUST_PROXY", "none");
    await createRoom();
    const players = [hostId];
    for (let index = 1; index < 100; index += 1) {
      const playerId = `party-player-${index}`;
      players.push(playerId);
      const response = await updateRoom(post({ action: "join", code, playerId, name: `Player ${index}` }));
      expect(response.status).toBe(200);
    }
    for (let poll = 0; poll < 7; poll += 1) {
      for (const playerId of players) {
        const response = await updateRoom(post({ action: "touch", code, playerId }));
        expect(response.status).toBe(200);
      }
    }
    expect(getPrivateRoom(code).players).toHaveLength(100);
  });
});
