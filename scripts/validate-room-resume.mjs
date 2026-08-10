#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRoomSyncGate,
  ROOM_SYNC_DEADLINE_GRACE_MS,
  ROOM_SYNC_HEARTBEAT_MS,
  ROOM_SYNC_REQUEST_TIMEOUT_MS,
  roomDeadlineSyncDelay,
  roomProgressiveClueSyncDeadline,
} from "../src/lib/room-sync.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const component = await readFile(join(root, "src", "components", "queue-arcade.tsx"), "utf8");
const failures = [];
const startedAt = 10_000;
const gate = createRoomSyncGate();

const hung = gate.begin(startedAt);
const hungPromise = new Promise(() => undefined);
gate.attach(hung.generation, hungPromise);

const reused = gate.begin(startedAt + ROOM_SYNC_REQUEST_TIMEOUT_MS - 1);
if (
  hung.action !== "start" ||
  reused.action !== "reuse" ||
  reused.generation !== hung.generation ||
  reused.promise !== hungPromise ||
  hung.signal.aborted
) {
  failures.push("A healthy in-flight room poll is no longer reused safely.");
}

const timeoutReplacement = gate.begin(startedAt + ROOM_SYNC_REQUEST_TIMEOUT_MS);
if (
  timeoutReplacement.action !== "replace" ||
  timeoutReplacement.generation === hung.generation ||
  !hung.signal.aborted ||
  !gate.isCurrent(timeoutReplacement.generation)
) {
  failures.push("A room poll that outlives the watchdog is not aborted and replaced.");
}

const replacementPromise = new Promise(() => undefined);
gate.attach(timeoutReplacement.generation, replacementPromise);
const wakeReplacement = gate.begin(startedAt + ROOM_SYNC_REQUEST_TIMEOUT_MS + 1, true);
gate.finish(timeoutReplacement.generation);
const afterStaleFinish = gate.begin(startedAt + ROOM_SYNC_REQUEST_TIMEOUT_MS + 2);
if (
  wakeReplacement.action !== "replace" ||
  !timeoutReplacement.signal.aborted ||
  !gate.isCurrent(wakeReplacement.generation) ||
  afterStaleFinish.action !== "reuse" ||
  afterStaleFinish.generation !== wakeReplacement.generation
) {
  failures.push("A browser wake does not supersede a pending poll without letting stale cleanup win.");
}

gate.cancel();
if (!wakeReplacement.signal.aborted || gate.begin(startedAt + ROOM_SYNC_REQUEST_TIMEOUT_MS + 3).action !== "start") {
  failures.push("Leaving or restarting a room does not cancel its pending synchronization request.");
}

if (
  roomDeadlineSyncDelay(20_000, 19_000) !== 1_000 + ROOM_SYNC_DEADLINE_GRACE_MS ||
  roomDeadlineSyncDelay(20_000, 21_000) !== 0 ||
  roomDeadlineSyncDelay(null, 21_000) !== null
) {
  failures.push("Absolute round deadlines no longer schedule immediate recovery after a delayed timer.");
}

if (
  roomProgressiveClueSyncDeadline(25_000, 15_000, 1) !== 15_000 ||
  roomProgressiveClueSyncDeadline(25_000, 15_000, 2) !== 20_000 ||
  roomProgressiveClueSyncDeadline(25_000, 15_000, 3) !== null ||
  roomProgressiveClueSyncDeadline(25_000, 0, 1) !== null
) {
  failures.push("Progressive server clues no longer schedule exact one-third round-boundary refreshes.");
}

if (ROOM_SYNC_HEARTBEAT_MS !== 5_000) {
  failures.push("The low-frequency room recovery heartbeat drifted from its reviewed five-second cadence.");
}

for (const requiredIntegration of [
  "roomSyncGateRef",
  "gate.begin(Date.now(), force)",
  "requestRoomSnapshot(settings, ensurePlayerId(), attempt.signal)",
  "gate.isCurrent(attempt.generation)",
  "roomDeadlineSyncDelay(activeDeadline, Date.now())",
  "roomProgressiveClueSyncDeadline(deadline, answerDuration, currentQuestion.clueStage)",
  "window.setInterval(() => void syncRoom(), ROOM_SYNC_HEARTBEAT_MS)",
  "void syncRoom(true)",
  'window.addEventListener("focus", wakeRoom)',
  'window.addEventListener("pageshow", wakeRoom)',
  'window.addEventListener("online", wakeRoom)',
  'document.addEventListener("visibilitychange", handleVisibility)',
  'document.addEventListener("resume", wakeRoom)',
]) {
  if (!component.includes(requiredIntegration)) {
    failures.push(`The live room is missing its AFK recovery integration: ${requiredIntegration}`);
  }
}

if (component.includes("syncPromiseRef")) {
  failures.push("The unbounded single-promise room lock returned.");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  `Validated ${ROOM_SYNC_REQUEST_TIMEOUT_MS}ms stale-request replacement, ${ROOM_SYNC_HEARTBEAT_MS}ms recovery heartbeats, exact phase/clue deadlines, and five browser wake paths.`,
);
