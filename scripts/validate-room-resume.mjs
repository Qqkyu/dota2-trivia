#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOM_SYNC_HEARTBEAT_MS, ROOM_SYNC_REQUEST_TIMEOUT_MS } from "../src/lib/room-sync.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const component = await readFile(join(root, "src", "components", "queue-arcade.tsx"), "utf8");
const failures = [];
for (const requiredIntegration of [
  "roomSyncGateRef",
  "gate.begin(Date.now(), force)",
  "requestRoomSnapshot(settings, ensurePlayerId(), attempt.signal)",
  "gate.isCurrent(attempt.generation)",
  "roomDeadlineSyncDelay(activeDeadline, Date.now())",
  "roomProgressiveClueSyncDeadline(deadline, answerDuration, currentQuestion.clueStage, currentQuestion.game)",
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
  `Validated the live room wires the ${ROOM_SYNC_REQUEST_TIMEOUT_MS}ms sync gate, ${ROOM_SYNC_HEARTBEAT_MS}ms heartbeat, and five browser wake paths (gate logic is unit-tested in tests/room-sync.test.mjs).`,
);
