#!/usr/bin/env node

import { formatsForRoundGames, PUBLIC_ROUND_FORMATS } from "../src/lib/arcade-games.mjs";
import {
  addPrivateRoomMessage,
  createPrivateRoom,
  getPrivateRoom,
  guestDisplayName,
  isPrivateRoomId,
  privateRoomCodeFromRoundId,
  normalizePrivateRoomCode,
  partyCodeError,
  partyNameError,
  PRIVATE_ROOM_MESSAGE_MAX,
  privateRoundTiming,
  resetPrivateRoomsForTests,
  startPrivateRoom,
  touchPrivateRoom,
  leavePrivateRoom,
  visiblePartyName,
  partyNameInputValue,
  partyNameSeed,
  storedPartyNameDraft,
  addPrivateRoomScore,
  PRIVATE_ROOM_NAME_NOTICE_MS,
  PRIVATE_ROOM_COUNTDOWN_MS,
  privateRoomWaiting,
  privateRoomCountdownMs,
} from "../src/lib/private-rooms.mjs";

const failures = [];
const record = (ok, message) => {
  if (!ok) failures.push(message);
};

resetPrivateRoomsForTests();

record(normalizePrivateRoomCode("k7q2") === "K7Q2", "Private room codes should keep a short code.");
record(normalizePrivateRoomCode("loda") === "LODA", "Party codes must allow letters like LODA.");
record(normalizePrivateRoomCode("das") === "DAS", "Party codes must allow a 3-letter name like DAS.");
record(normalizePrivateRoomCode("gigachad") === "GIGACHAD", "Party codes must allow a longer fun name.");
record(normalizePrivateRoomCode("NO") === null, "Codes shorter than 3 characters must be rejected.");
record(normalizePrivateRoomCode("a".repeat(17)) === null, "Codes longer than 16 characters must be rejected.");
record(partyCodeError("") === "Type a party code.", "An empty field should ask for a code.");
record(
  partyCodeError("DA") === "Use 3-16 letters or numbers.",
  "A short code should say the real length rule, not pretend the field is empty.",
);
record(partyCodeError("DAS") === null, "DAS is a valid party code.");
record(partyNameError("") === "Type a name.", "Guests must type a name.");
record(partyNameError("Loda") === null, "A short handle is a valid party name.");
record(guestDisplayName("player-abcd") === "Guest-AYERABCD", "Guests need a unique short display name.");
record(
  formatsForRoundGames(["flashback"]).join(",") === "flashback",
  "A Flashback-only room should schedule only Flashback.",
);
record(formatsForRoundGames([]).length === PUBLIC_ROUND_FORMATS.length, "No ticked games should keep the full mix.");

const now = Date.now();
try {
  createPrivateRoom({
    hostId: "host-player-1",
    gameId: "dota2",
    contentVersion: "test-version",
    games: ["flashback"],
    now,
  });
  record(false, "Create without a code must fail.");
} catch (error) {
  record(/code/i.test(String(error.message)), "Create without a code must ask for a party code.");
}

try {
  createPrivateRoom({
    hostId: "host-player-1",
    gameId: "dota2",
    contentVersion: "test-version",
    games: [],
    code: "empty",
    now,
  });
  record(false, "Create with no games must fail.");
} catch (error) {
  record(/game/i.test(String(error.message)), "Create with no games must ask for a game.");
}

const created = createPrivateRoom({
  hostId: "host-player-1",
  gameId: "dota2",
  contentVersion: "test-version",
  games: ["flashback"],
  code: "loda",
  name: "Loda",
  now,
});
record(created.code === "LODA", "Create should keep the host's party code.");
record(
  created.players?.some((player) => player.name === "Loda" && player.host),
  "The wait list must show the host by name.",
);
record(created.startedAt === null, "A new private room must wait for the host.");
record(created.formats.join(",") === "flashback", "Create should store the selected formats.");
record(isPrivateRoomId(created.roomId), "Private room IDs must not collide with the public room.");
record(getPrivateRoom(created.code)?.code === created.code, "Created rooms must be readable by code.");
record(getPrivateRoom("zzzz") === null, "Join of a missing code must not invent a room.");
const peekCount = getPrivateRoom(created.code)?.players?.length;
record(
  peekCount === 1 && getPrivateRoom(created.code)?.players?.length === peekCount,
  "Reading a room must not add a player.",
);
try {
  createPrivateRoom({
    hostId: "other-host-99",
    gameId: "dota2",
    contentVersion: "test-version",
    games: ["flashback"],
    code: "loda",
    name: "Intruder",
    now: now + 1,
  });
  record(false, "Create with a taken code must fail.");
} catch (error) {
  record(String(error.message) === "That code is taken.", "Create with a taken code must say the code is taken.");
}
record(
  getPrivateRoom(created.code)?.players?.length === 1 &&
    getPrivateRoom(created.code)?.players?.every((player) => player.name !== "Intruder"),
  "A failed create must not join the taken room.",
);
const joined = touchPrivateRoom(created.code, now + 10, { playerId: "guest-player-99", name: "Puppey" });
record(
  joined?.players?.some((player) => player.name === "Puppey" && !player.host),
  "Joiners must appear on the wait list by name.",
);
record(
  visiblePartyName({ partyName: "", displayName: "", selfName: "Guest-ABCD" }) === "Guest-ABCD",
  "A guest must see the auto name the server gave them.",
);
record(
  visiblePartyName({ partyName: "Loda", displayName: "", selfName: "Guest-ABCD" }) === "Loda",
  "A typed name must win over the auto guest name.",
);
record(
  visiblePartyName({ partyName: "", displayName: "baobab", selfName: "baoba" }) === "baoba",
  "The room name must win over the Steam name so every screen shows the same nick.",
);
record(
  partyNameSeed({ serverName: "baoba", displayName: "baobab" }) === "baoba",
  "An idle name field must show the room nick, not the Steam nick.",
);
record(
  PRIVATE_ROOM_NAME_NOTICE_MS >= 1500 && PRIVATE_ROOM_NAME_NOTICE_MS <= 4000,
  "A taken-name notice must hide after a short wait.",
);
record(
  partyNameInputValue({ draft: null, seed: "baobab" }) === "baobab",
  "An untouched field can show the Steam name.",
);
record(partyNameInputValue({ draft: "", seed: "baobab" }) === "", "Clearing the name must not snap back to Steam.");
record(
  partyNameInputValue({ draft: "Alex", seed: "baobab" }) === "Alex",
  "A new name must not be forced to start like Steam.",
);
record(
  partyNameInputValue({ draft: "b", seed: "baobab" }) === "b",
  "Deleting down to one letter must keep that letter.",
);
record(storedPartyNameDraft("") === null, "An empty saved nickname must not block the Steam or guest seed.");
record(storedPartyNameDraft("baobab") === "baobab", "A saved nickname must load.");

const idleHostAt = now + 60_000;
const idleRoom = touchPrivateRoom(created.code, idleHostAt, {
  playerId: "host-player-1",
  name: "Loda",
});
record(
  idleRoom?.players?.some((player) => player.name === "Puppey") &&
    idleRoom?.players?.some((player) => player.host && player.name === "Loda"),
  "A minimized or background tab must not drop a player, and must never kick the host.",
);
const secondGuest = touchPrivateRoom(created.code, idleHostAt + 1, {
  playerId: "guest-player-00",
  name: "",
});
record(
  new Set(secondGuest?.players?.map((player) => player.name.toLowerCase()) ?? []).size === secondGuest?.players?.length,
  "Two guests must not share one auto nickname.",
);
record(secondGuest?.players?.length === 3, "Host plus two guests must show three players.");
const steal = touchPrivateRoom(created.code, idleHostAt + 2, {
  playerId: "guest-player-00",
  name: "Loda",
});
record(
  steal?.players?.filter((player) => player.name.toLowerCase() === "loda").length === 1 && steal?.nameTaken === true,
  "A player must not take a nickname that is already in the party.",
);
const copycat = touchPrivateRoom(created.code, idleHostAt + 2.2, {
  playerId: "guest-player-77",
  name: "Loda",
});
record(
  copycat?.players?.filter((player) => player.name.toLowerCase() === "loda").length === 1 &&
    copycat?.players?.some((player) => /^loda\d+$/i.test(player.name)),
  "A new joiner cannot take the host nickname.",
);
const prefixOk = touchPrivateRoom(created.code, idleHostAt + 2.5, {
  playerId: "guest-player-00",
  name: "Lodas",
});
record(
  prefixOk?.players?.some((player) => player.name === "Lodas"),
  "A longer nickname that only starts like a taken name must still be allowed.",
);
const hostRename = touchPrivateRoom(created.code, idleHostAt + 2.6, {
  playerId: "host-player-1",
  name: "x",
});
record(
  hostRename?.players?.some((player) => player.host && player.name === "x") && hostRename?.nameTaken !== true,
  "A host nick change must save on the room.",
);
const heartbeat = touchPrivateRoom(created.code, idleHostAt + 2.7, {
  playerId: "host-player-1",
  name: "Loda",
  applyName: false,
});
record(
  heartbeat?.players?.some((player) => player.host && player.name === "x"),
  "A presence poll must not restore the old nick.",
);
const otherView = getPrivateRoom(created.code, idleHostAt + 2.8, "guest-player-00");
record(
  otherView?.players?.some((player) => player.host && player.name === "x"),
  "Other players must see the new nick.",
);
const afterLeave = leavePrivateRoom(created.code, "guest-player-99", idleHostAt + 3);
record(
  afterLeave?.players?.every((player) => player.name !== "Puppey"),
  "Leave must remove the player at once, not after a timeout.",
);
const ranked = addPrivateRoomScore(created.code, "host-player-1", 80, idleHostAt + 4);
record(
  ranked?.players?.some((player) => player.host && player.score === 80),
  "Private rooms must keep a running score per player.",
);

const stranger = startPrivateRoom(created.code, "other-player-1", now + 1_000);
record(stranger.ok === false && stranger.reason === "forbidden", "Only the host can start the room.");

const started = startPrivateRoom(created.code, "host-player-1", now + 2_000);
record(
  started.ok === true && started.room.startedAt === now + 2_000 + PRIVATE_ROOM_COUNTDOWN_MS,
  "Start must wait 3s before the first round.",
);
record(
  privateRoomWaiting(started.room, now + 2_000 + 1_000) === true &&
    privateRoomCountdownMs(started.room, now + 2_000 + 1_000) === 2_000,
  "Players must still wait during the start countdown.",
);
record(
  privateRoomWaiting(started.room, now + 2_000 + PRIVATE_ROOM_COUNTDOWN_MS) === false,
  "The first round must begin when the countdown hits 0.",
);

const timing = privateRoundTiming(now + 2_000, now + 2_000 + 16_000);
record(
  timing.roundNumber === 0 && timing.phase === "reveal",
  "Private rounds should use the 15s / 7s clock from Start.",
);
const nextRound = privateRoundTiming(now + 2_000, now + 2_000 + 22_000);
record(
  nextRound.roundNumber === 1 && nextRound.phase === "answering",
  "The next private round should begin after reveal.",
);

const chat = addPrivateRoomMessage(created.code, { name: "Loda", text: "  is that balanced?  ", now: now + 3_000 });
record(chat.ok === true && chat.message.text === "is that balanced?", "Chat should trim and keep a short line.");
const empty = addPrivateRoomMessage(created.code, { name: "Loda", text: "   ", now: now + 3_100 });
record(empty.ok === false, "Empty chat must not land.");
const long = addPrivateRoomMessage(created.code, {
  name: "Loda",
  text: "x".repeat(PRIVATE_ROOM_MESSAGE_MAX + 8),
  now: now + 3_200,
});
record(long.ok === true && long.message.text.length === PRIVATE_ROOM_MESSAGE_MAX, "Chat should cap at 80 characters.");

const hostGone = leavePrivateRoom(created.code, "host-player-1", now + 4_000);
record(
  hostGone?.players?.some((player) => player.host && player.name === "Lodas") &&
    hostGone.players.filter((player) => player.host).length === 1 &&
    hostGone.players.every((player) => player.name !== "x"),
  "When the host leaves, the next player becomes host.",
);
leavePrivateRoom(created.code, "guest-player-00", now + 4_100);
const lastGone = leavePrivateRoom(created.code, "guest-player-77", now + 4_200);
record(lastGone === null && getPrivateRoom(created.code) === null, "An empty party must die at once.");
const reused = createPrivateRoom({
  hostId: "host-player-2",
  gameId: "dota2",
  contentVersion: "test-version",
  games: ["flashback"],
  code: "loda",
  name: "NewHost",
  now: now + 4_300,
});
record(
  reused.code === "LODA" && reused.players?.some((player) => player.host && player.name === "NewHost"),
  "The party code must be free after the last player leaves.",
);

const publicId = "dota2:content:public";
record(!isPrivateRoomId(publicId), "The public room ID must stay public.");
record(
  privateRoomCodeFromRoundId("dota2:7.41e-variety-7-flashback-13:private:LODA:round:12") === "LODA" &&
    privateRoomCodeFromRoundId("dota2:7.41e-variety-7-flashback-13:public:round:970927") === null &&
    privateRoomCodeFromRoundId("dota2:x:private:no code:round:1") === null &&
    privateRoomCodeFromRoundId(null) === null,
  "Round audio must find the party code inside a private round ID and ignore public rounds.",
);

resetPrivateRoomsForTests();
record(getPrivateRoom(created.code) === null, "Tests must be able to clear private rooms.");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Validated private rooms, host start, isolated clock, and chat.");
