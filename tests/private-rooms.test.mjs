import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { formatsForRoundGames, PUBLIC_ROUND_FORMATS } from "../src/lib/arcade-games.mjs";
import {
  addPrivateRoomMessage,
  addPrivateRoomScore,
  applyPrivateRoomCrowdBonus,
  flushStalePrivateRoomScores,
  createPrivateRoom,
  getPrivateRoom,
  guestDisplayName,
  isPrivateRoomId,
  leavePrivateRoom,
  normalizePrivateRoomCode,
  partyCodeError,
  partyLobbyRoster,
  partyPlayerTag,
  rankPartyPlayers,
  partyNameError,
  partyNameInputValue,
  partyNameSeed,
  PRIVATE_ROOM_COUNTDOWN_MS,
  PRIVATE_ROOM_MEMBER_TIMEOUT_MS,
  PRIVATE_ROOM_MESSAGE_MAX,
  PRIVATE_ROOM_PLAYER_MAX,
  PRIVATE_ROOM_NAME_NOTICE_MS,
  privateRoomCodeFromRoundId,
  privateRoomCountdownMs,
  privateRoomMember,
  privateRoomWaiting,
  privateRoundTiming,
  resetPrivateRoomsForTests,
  startPrivateRoom,
  storedPartyNameDraft,
  touchPrivateRoom,
  visiblePartyName,
} from "../src/lib/private-rooms.mjs";

const catalog = { gameId: "dota2", contentVersion: "test-version" };
const names = (room) => room?.players?.map((player) => player.name) ?? [];

describe("party codes and names", () => {
  it("normalizes codes to 3-16 uppercase letters or digits", () => {
    expect(normalizePrivateRoomCode("k7q2")).toBe("K7Q2");
    expect(normalizePrivateRoomCode("loda")).toBe("LODA");
    expect(normalizePrivateRoomCode("das")).toBe("DAS");
    expect(normalizePrivateRoomCode("gigachad")).toBe("GIGACHAD");
    expect(normalizePrivateRoomCode("NO")).toBeNull();
    expect(normalizePrivateRoomCode("a".repeat(17))).toBeNull();
  });

  it("explains code and name errors in plain words", () => {
    expect(partyCodeError("")).toBe("Type a party code.");
    expect(partyCodeError("DA")).toBe("Use 3-16 letters or numbers.");
    expect(partyCodeError("DAS")).toBeNull();
    expect(partyNameError("")).toBe("Type a name.");
    expect(partyNameError("Loda")).toBeNull();
    expect(guestDisplayName("player-abcd")).toBe("Guest-AYERABCD");
  });

  it("picks the visible nick in the right order", () => {
    expect(visiblePartyName({ partyName: "", displayName: "", selfName: "Guest-ABCD" })).toBe("Guest-ABCD");
    expect(visiblePartyName({ partyName: "Loda", displayName: "", selfName: "Guest-ABCD" })).toBe("Loda");
    expect(visiblePartyName({ partyName: "", displayName: "baobab", selfName: "baoba" })).toBe("baoba");
    expect(partyNameSeed({ serverName: "baoba", displayName: "baobab" })).toBe("baoba");
    expect(partyNameInputValue({ draft: null, seed: "baobab" })).toBe("baobab");
    expect(partyNameInputValue({ draft: "", seed: "baobab" })).toBe("");
    expect(partyNameInputValue({ draft: "Alex", seed: "baobab" })).toBe("Alex");
    expect(partyNameInputValue({ draft: "b", seed: "baobab" })).toBe("b");
    expect(storedPartyNameDraft("")).toBeNull();
    expect(storedPartyNameDraft("baobab")).toBe("baobab");
    expect(PRIVATE_ROOM_NAME_NOTICE_MS).toBeGreaterThanOrEqual(1500);
    expect(PRIVATE_ROOM_NAME_NOTICE_MS).toBeLessThanOrEqual(4000);
  });

  it("maps ticked games onto the public cadence", () => {
    expect(formatsForRoundGames(["flashback"])).toEqual(["flashback"]);
    expect(formatsForRoundGames([])).toHaveLength(PUBLIC_ROUND_FORMATS.length);
  });

  it("finds the party code inside a private round ID only", () => {
    expect(privateRoomCodeFromRoundId("dota2:7.41e-variety-7-flashback-13:private:LODA:round:12")).toBe("LODA");
    expect(privateRoomCodeFromRoundId("dota2:7.41e-variety-7-flashback-13:private:LODA:round:12:1710000000")).toBe(
      "LODA",
    );
    expect(privateRoomCodeFromRoundId("dota2:7.41e-variety-7-flashback-13:public:round:970927")).toBeNull();
    expect(privateRoomCodeFromRoundId("dota2:x:private:no code:round:1")).toBeNull();
    expect(privateRoomCodeFromRoundId(null)).toBeNull();
    expect(isPrivateRoomId("dota2:content:public")).toBe(false);
  });
});

describe("a party from create to empty", () => {
  const now = Date.now();
  const idleHostAt = now + 60_000;
  let created;

  beforeAll(() => {
    resetPrivateRoomsForTests();
  });

  it("refuses to create without a code or without games", () => {
    expect(() => createPrivateRoom({ ...catalog, hostId: "host-player-1", games: ["flashback"], now })).toThrow(
      /code/i,
    );
    expect(() => createPrivateRoom({ ...catalog, hostId: "host-player-1", games: [], code: "empty", now })).toThrow(
      /game/i,
    );
  });

  it("creates a waiting room with the host on the list", () => {
    created = createPrivateRoom({
      ...catalog,
      hostId: "host-player-1",
      games: ["flashback"],
      code: "loda",
      name: "Loda",
      now,
    });
    expect(created.code).toBe("LODA");
    expect(created.players).toContainEqual(expect.objectContaining({ name: "Loda", host: true }));
    expect(created.startedAt).toBeNull();
    expect(created.formats).toEqual(["flashback"]);
    expect(isPrivateRoomId(created.roomId)).toBe(true);
    expect(getPrivateRoom(created.code)?.code).toBe(created.code);
    expect(getPrivateRoom("zzzz")).toBeNull();
    expect(getPrivateRoom(created.code)?.players).toHaveLength(1);
  });

  it("rejects a taken code without joining that room", () => {
    expect(() =>
      createPrivateRoom({
        ...catalog,
        hostId: "other-host-99",
        games: ["flashback"],
        code: "loda",
        name: "Intruder",
        now: now + 1,
      }),
    ).toThrow("That code is taken.");
    expect(names(getPrivateRoom(created.code))).toEqual(["Loda"]);
  });

  it("lets a joiner appear by name", () => {
    const joined = touchPrivateRoom(created.code, now + 10, { playerId: "guest-player-99", name: "Puppey" });
    expect(joined.players).toContainEqual(expect.objectContaining({ name: "Puppey", host: false }));
  });

  it("keeps background tabs and never kicks the host", () => {
    const idleRoom = touchPrivateRoom(created.code, idleHostAt, { playerId: "host-player-1", name: "Loda" });
    expect(names(idleRoom)).toEqual(expect.arrayContaining(["Puppey", "Loda"]));
    expect(idleRoom.players.find((player) => player.host)?.name).toBe("Loda");
  });

  it("keeps nicknames unique", () => {
    const secondGuest = touchPrivateRoom(created.code, idleHostAt + 1, { playerId: "guest-player-00", name: "" });
    expect(new Set(names(secondGuest).map((name) => name.toLowerCase())).size).toBe(secondGuest.players.length);
    expect(secondGuest.players).toHaveLength(3);
    const steal = touchPrivateRoom(created.code, idleHostAt + 2, { playerId: "guest-player-00", name: "Loda" });
    expect(names(steal).filter((name) => name.toLowerCase() === "loda")).toHaveLength(1);
    expect(steal.nameTaken).toBe(true);
    const copycat = touchPrivateRoom(created.code, idleHostAt + 2.2, { playerId: "guest-player-77", name: "Loda" });
    expect(names(copycat).filter((name) => name.toLowerCase() === "loda")).toHaveLength(1);
    expect(names(copycat).some((name) => /^loda\d+$/i.test(name))).toBe(true);
    const prefixOk = touchPrivateRoom(created.code, idleHostAt + 2.5, { playerId: "guest-player-00", name: "Lodas" });
    expect(names(prefixOk)).toContain("Lodas");
  });

  it("saves a host rename and never lets a presence poll undo it", () => {
    const hostRename = touchPrivateRoom(created.code, idleHostAt + 2.6, { playerId: "host-player-1", name: "x" });
    expect(hostRename.players.find((player) => player.host)?.name).toBe("x");
    expect(hostRename.nameTaken).toBe(false);
    const heartbeat = touchPrivateRoom(created.code, idleHostAt + 2.7, {
      playerId: "host-player-1",
      name: "Loda",
      applyName: false,
    });
    expect(heartbeat.players.find((player) => player.host)?.name).toBe("x");
    expect(
      getPrivateRoom(created.code, idleHostAt + 2.8, "guest-player-00").players.find((player) => player.host)?.name,
    ).toBe("x");
  });

  it("removes a leaver at once and keeps a running score", () => {
    expect(names(leavePrivateRoom(created.code, "guest-player-99", idleHostAt + 3))).not.toContain("Puppey");
    const ranked = addPrivateRoomScore(created.code, "host-player-1", 80, idleHostAt + 4);
    expect(ranked.players.find((player) => player.host)?.score).toBe(80);
  });

  it("adds the crowd-breaker bonus once at reveal", () => {
    const room = createPrivateRoom({
      hostId: "bonus-host-1",
      ...catalog,
      games: ["trivia"],
      code: "BONUS1",
      name: "Host",
      now: now + 5_000,
    });
    addPrivateRoomScore(room.code, "bonus-host-1", 194, now + 5_100, "round-bonus-1");
    expect(getPrivateRoom(room.code, now + 5_150).players[0].score).toBe(0);
    expect(applyPrivateRoomCrowdBonus(room.code, "round-bonus-1", 2, now + 5_200).players[0].score).toBe(388);
    expect(applyPrivateRoomCrowdBonus(room.code, "round-bonus-1", 2, now + 5_300).players[0].score).toBe(388);
  });

  it("keeps base points when a later round starts before reveal settlement", () => {
    const room = createPrivateRoom({
      hostId: "stale-host-1",
      ...catalog,
      games: ["trivia"],
      code: "STALE1",
      name: "Host",
      now: now + 6_000,
    });
    addPrivateRoomScore(room.code, "stale-host-1", 194, now + 6_100, "round-stale-1");
    expect(flushStalePrivateRoomScores(room.code, "round-stale-2", now + 6_200).players[0].score).toBe(194);
  });

  it("credits every member when a missed reveal is flushed", () => {
    const room = createPrivateRoom({
      hostId: "flush-host-1",
      ...catalog,
      games: ["trivia"],
      code: "FLUSH1",
      name: "Host",
      now: now + 7_000,
    });
    touchPrivateRoom(room.code, now + 7_050, { playerId: "flush-guest-1", name: "Guest" });
    addPrivateRoomScore(room.code, "flush-host-1", 100, now + 7_100, "round-flush-1");
    addPrivateRoomScore(room.code, "flush-guest-1", 150, now + 7_110, "round-flush-1");
    const flushed = flushStalePrivateRoomScores(room.code, "round-flush-2", now + 7_200);
    const byName = Object.fromEntries(flushed.players.map((player) => [player.name, player.score]));
    expect(byName.Host).toBe(100);
    expect(byName.Guest).toBe(150);
  });

  it("lets only the host start, with a 3-second countdown", () => {
    expect(startPrivateRoom(created.code, "other-player-1", now + 1_000)).toMatchObject({
      ok: false,
      reason: "forbidden",
    });
    const started = startPrivateRoom(created.code, "host-player-1", now + 2_000);
    expect(started.ok).toBe(true);
    expect(started.room.startedAt).toBe(now + 2_000 + PRIVATE_ROOM_COUNTDOWN_MS);
    expect(privateRoomWaiting(started.room, now + 3_000)).toBe(true);
    expect(privateRoomCountdownMs(started.room, now + 3_000)).toBe(2_000);
    expect(privateRoomWaiting(started.room, now + 2_000 + PRIVATE_ROOM_COUNTDOWN_MS)).toBe(false);
  });

  it("runs rounds on the 15s / 7s clock from start", () => {
    expect(privateRoundTiming(now + 2_000, now + 2_000 + 15_400)).toMatchObject({ roundNumber: 0, phase: "answering" });
    expect(privateRoundTiming(now + 2_000, now + 2_000 + 16_000)).toMatchObject({ roundNumber: 0, phase: "reveal" });
    expect(privateRoundTiming(now + 2_000, now + 2_000 + 22_000)).toMatchObject({ roundNumber: 1, phase: "answering" });
  });

  it("chats under the roster name and rejects strangers", () => {
    const chat = addPrivateRoomMessage(created.code, {
      playerId: "host-player-1",
      text: "  is that balanced?  ",
      now: now + 3_000,
    });
    expect(chat.ok).toBe(true);
    expect(chat.message).toMatchObject({ text: "is that balanced?", name: "x" });
    expect(addPrivateRoomMessage(created.code, { playerId: "host-player-1", text: "   ", now: now + 3_100 }).ok).toBe(
      false,
    );
    const long = addPrivateRoomMessage(created.code, {
      playerId: "host-player-1",
      text: "x".repeat(PRIVATE_ROOM_MESSAGE_MAX + 8),
      now: now + 3_200,
    });
    expect(long.message.text).toHaveLength(PRIVATE_ROOM_MESSAGE_MAX);
    expect(
      addPrivateRoomMessage(created.code, { playerId: "nobody-0000001", text: "gg", now: now + 3_300 }),
    ).toMatchObject({ ok: false, reason: "forbidden" });
    expect(privateRoomMember(created.code, "host-player-1")?.name).toBe("x");
    expect(privateRoomMember(created.code, "nobody-0000001")).toBeNull();
  });

  it("never scores or seats a stranger", () => {
    const before = getPrivateRoom(created.code).players.length;
    expect(addPrivateRoomScore(created.code, "nobody-0000001", 50, now + 3_400)).toBeNull();
    expect(getPrivateRoom(created.code).players).toHaveLength(before);
  });

  it("passes host on leave and frees the code when empty", () => {
    const hostGone = leavePrivateRoom(created.code, "host-player-1", now + 4_000);
    expect(hostGone.players.filter((player) => player.host)).toEqual([expect.objectContaining({ name: "Lodas" })]);
    expect(names(hostGone)).not.toContain("x");
    leavePrivateRoom(created.code, "guest-player-00", now + 4_100);
    expect(leavePrivateRoom(created.code, "guest-player-77", now + 4_200)).toBeNull();
    expect(getPrivateRoom(created.code)).toBeNull();
    const reused = createPrivateRoom({
      ...catalog,
      hostId: "host-player-2",
      games: ["flashback"],
      code: "loda",
      name: "NewHost",
      now: now + 4_300,
    });
    expect(reused.code).toBe("LODA");
    expect(reused.players).toContainEqual(expect.objectContaining({ name: "NewHost", host: true }));
  });
});

describe("silent players", () => {
  const at = Date.now() + 100_000;
  let room;

  beforeAll(() => {
    resetPrivateRoomsForTests();
    room = createPrivateRoom({
      ...catalog,
      hostId: "ghost-host-1",
      games: ["trivia"],
      code: "ghost",
      name: "Host",
      now: at,
    });
    touchPrivateRoom(room.code, at + 10, { playerId: "ghost-guest-1", name: "Guest" });
    addPrivateRoomScore(room.code, "ghost-guest-1", 120, at + 11);
  });

  it("outlast a throttled background tab", () => {
    expect(PRIVATE_ROOM_MEMBER_TIMEOUT_MS).toBeGreaterThanOrEqual(75_000);
    const stillHere = touchPrivateRoom(room.code, at + 70_000, { playerId: "ghost-host-1", name: "Host" });
    expect(stillHere.players).toHaveLength(2);
    expect(stillHere.players.every((player) => !player.away)).toBe(true);
  });

  it("are marked away but keep their seat and score", () => {
    const view = touchPrivateRoom(room.code, at + 11 + PRIVATE_ROOM_MEMBER_TIMEOUT_MS, {
      playerId: "ghost-host-1",
      name: "Host",
    });
    expect(view.players).toHaveLength(2);
    expect(view.players.find((player) => player.name === "Guest")).toMatchObject({ away: true, score: 120 });
  });

  it("are present again as soon as their tab returns", () => {
    const view = touchPrivateRoom(room.code, at + 12 + PRIVATE_ROOM_MEMBER_TIMEOUT_MS, {
      playerId: "ghost-guest-1",
      name: "Guest",
    });
    expect(view.players.find((player) => player.name === "Guest")).toMatchObject({ away: false, score: 120 });
  });

  it("hand host duty to an active player", () => {
    const view = touchPrivateRoom(room.code, at + 12 + PRIVATE_ROOM_MEMBER_TIMEOUT_MS * 2, {
      playerId: "ghost-guest-1",
      name: "Guest",
    });
    expect(view.players.find((player) => player.name === "Guest")?.host).toBe(true);
    expect(view.players.find((player) => player.name === "Host")?.away).toBe(true);
  });

  it("never delete a party or a seat", () => {
    expect(getPrivateRoom(room.code, at + PRIVATE_ROOM_MEMBER_TIMEOUT_MS * 5)?.players).toHaveLength(2);
    resetPrivateRoomsForTests();
    expect(getPrivateRoom(room.code)).toBeNull();
  });
});

describe("abandoned party codes", () => {
  const at = Date.now() + 400_000;

  beforeAll(() => {
    resetPrivateRoomsForTests();
  });

  it("stay taken while someone in the party is still active", () => {
    createPrivateRoom({
      ...catalog,
      hostId: "old-host-aaaa",
      games: ["flashback"],
      code: "asd",
      name: "OldHost",
      now: at,
    });
    expect(() =>
      createPrivateRoom({
        ...catalog,
        hostId: "new-host-bbbb",
        games: ["flashback"],
        code: "asd",
        name: "NewHost",
        now: at + 1,
      }),
    ).toThrow("That code is taken.");
    expect(names(getPrivateRoom("asd", at + 1))).toEqual(["OldHost"]);
  });

  it("can be created again after every tab went away", () => {
    const reused = createPrivateRoom({
      ...catalog,
      hostId: "new-host-bbbb",
      games: ["flashback"],
      code: "asd",
      name: "NewHost",
      now: at + PRIVATE_ROOM_MEMBER_TIMEOUT_MS,
    });
    expect(reused.players).toEqual([expect.objectContaining({ name: "NewHost", host: true, away: false })]);
    expect(names(getPrivateRoom("asd", at + PRIVATE_ROOM_MEMBER_TIMEOUT_MS))).toEqual(["NewHost"]);
  });

  it("stay taken when a guest is still in the party", () => {
    const liveAt = at + PRIVATE_ROOM_MEMBER_TIMEOUT_MS * 2;
    const stealAt = liveAt + 10 + PRIVATE_ROOM_MEMBER_TIMEOUT_MS;
    createPrivateRoom({
      ...catalog,
      hostId: "live-host-cccc",
      games: ["flashback"],
      code: "live",
      name: "LiveHost",
      now: liveAt,
    });
    touchPrivateRoom("live", liveAt + 10, { playerId: "live-guest-dddd", name: "LiveGuest" });
    touchPrivateRoom("live", stealAt, { playerId: "live-guest-dddd", name: "LiveGuest" });
    expect(() =>
      createPrivateRoom({
        ...catalog,
        hostId: "thief-eeee",
        games: ["flashback"],
        code: "live",
        name: "Thief",
        now: stealAt,
      }),
    ).toThrow("That code is taken.");
    expect(names(getPrivateRoom("live", stealAt))).toEqual(expect.arrayContaining(["LiveGuest"]));
  });
});

describe("party roster", () => {
  const players = [
    { name: "Zed", host: false, self: false, score: 40, away: true },
    { name: "Amy", host: true, self: false, score: 40, away: false },
    { name: "Me", host: false, self: true, score: 10, away: false },
    { name: "Bo", host: false, self: false, score: 90, away: true },
  ];

  it("keeps away players in the ranking and tags them", () => {
    const ranked = rankPartyPlayers(players);
    expect(ranked.map((player) => player.name)).toEqual(["Bo", "Amy", "Zed", "Me"]);
    expect(ranked.map(partyPlayerTag)).toEqual(["Away", "Host", "Away", "You"]);
  });

  it("never tags the viewer as away and prefers Away over Host", () => {
    expect(partyPlayerTag({ name: "Me", host: true, self: true, score: 0, away: true })).toBe("Host");
    expect(partyPlayerTag({ name: "Me", host: false, self: true, score: 0, away: true })).toBe("You");
    expect(partyPlayerTag({ name: "Host", host: true, self: false, score: 0, away: true })).toBe("Away");
    expect(partyPlayerTag({ name: "Guest", host: false, self: false, score: 0, away: false })).toBe("");
  });

  it("puts the viewer first in the lobby and keeps away players", () => {
    expect(partyLobbyRoster(players).map((player) => player.name)).toEqual(["Me", "Zed", "Amy", "Bo"]);
  });
});

describe("party size cap", () => {
  const at = Date.now() + 400_000;

  beforeAll(() => {
    resetPrivateRoomsForTests();
  });

  it(`lets ${PRIVATE_ROOM_PLAYER_MAX} people in and blocks the next`, () => {
    const room = createPrivateRoom({
      ...catalog,
      hostId: "cap-host",
      games: ["trivia"],
      code: "crowd",
      name: "Host",
      now: at,
    });
    for (let index = 1; index < PRIVATE_ROOM_PLAYER_MAX; index += 1) {
      const joined = touchPrivateRoom(room.code, at + index, {
        playerId: `cap-guest-${index}`,
        name: `P${index}`,
      });
      expect(joined.full).toBeFalsy();
    }
    expect(getPrivateRoom(room.code, at + PRIVATE_ROOM_PLAYER_MAX).players).toHaveLength(PRIVATE_ROOM_PLAYER_MAX);
    const blocked = touchPrivateRoom(room.code, at + PRIVATE_ROOM_PLAYER_MAX + 1, {
      playerId: "cap-guest-late",
      name: "Nope",
    });
    expect(blocked.full).toBe(true);
    expect(blocked.players).toHaveLength(PRIVATE_ROOM_PLAYER_MAX);
    expect(names(blocked)).not.toContain("Nope");
    const heartbeat = touchPrivateRoom(room.code, at + PRIVATE_ROOM_PLAYER_MAX + 2, {
      playerId: "cap-host",
      name: "Host",
    });
    expect(heartbeat.full).toBeFalsy();
    expect(heartbeat.players).toHaveLength(PRIVATE_ROOM_PLAYER_MAX);
    leavePrivateRoom(room.code, "cap-guest-1", at + PRIVATE_ROOM_PLAYER_MAX + 3);
    const late = touchPrivateRoom(room.code, at + PRIVATE_ROOM_PLAYER_MAX + 4, {
      playerId: "cap-guest-late",
      name: "Nope",
    });
    expect(late.full).toBeFalsy();
    expect(late.players).toHaveLength(PRIVATE_ROOM_PLAYER_MAX);
    expect(names(late)).toContain("Nope");
    expect(names(late)).not.toContain("P1");
  });
});

describe("party lobby polling", () => {
  it("does not restart the room poll when parent callbacks change", () => {
    const source = readFileSync(new URL("../src/components/private-room-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain("onStartedRef");
    expect(source).toContain("onWaitingChangeRef");
    expect(source).not.toMatch(/\[onStarted, onWaitingChange, playActive\]/);
    expect(source).toContain("[initialCode, requestRoom, trackedCode]");
  });
});
