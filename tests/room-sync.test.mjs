import { describe, expect, it } from "vitest";
import {
  createRoomSyncGate,
  ROOM_SYNC_DEADLINE_GRACE_MS,
  ROOM_SYNC_FORCE_REPLACE_AFTER_MS,
  ROOM_SYNC_HEARTBEAT_MS,
  ROOM_SYNC_REQUEST_TIMEOUT_MS,
  roomDeadlineSyncDelay,
  roomProgressiveClueSyncDeadline,
} from "../src/lib/room-sync.mjs";

describe("createRoomSyncGate", () => {
  const startedAt = 10_000;

  it("reuses a healthy in-flight poll, replaces a hung one, and honors wakes and cancels", () => {
    const gate = createRoomSyncGate();
    const hung = gate.begin(startedAt);
    const hungPromise = new Promise(() => undefined);
    gate.attach(hung.generation, hungPromise);

    const reused = gate.begin(startedAt + ROOM_SYNC_REQUEST_TIMEOUT_MS - 1);
    expect(hung.action).toBe("start");
    expect(reused).toMatchObject({ action: "reuse", generation: hung.generation, promise: hungPromise });
    expect(hung.signal.aborted).toBe(false);

    const replacement = gate.begin(startedAt + ROOM_SYNC_REQUEST_TIMEOUT_MS);
    expect(replacement.action).toBe("replace");
    expect(replacement.generation).not.toBe(hung.generation);
    expect(hung.signal.aborted).toBe(true);
    expect(gate.isCurrent(replacement.generation)).toBe(true);

    gate.attach(replacement.generation, new Promise(() => undefined));
    // A forced wake reuses a young poll instead of aborting it.
    const youngWake = gate.begin(startedAt + ROOM_SYNC_REQUEST_TIMEOUT_MS + 1, true);
    expect(youngWake).toMatchObject({ action: "reuse", generation: replacement.generation });
    expect(replacement.signal.aborted).toBe(false);
    const wake = gate.begin(startedAt + ROOM_SYNC_REQUEST_TIMEOUT_MS + ROOM_SYNC_FORCE_REPLACE_AFTER_MS, true);
    gate.finish(replacement.generation);
    const afterStaleFinish = gate.begin(
      startedAt + ROOM_SYNC_REQUEST_TIMEOUT_MS + ROOM_SYNC_FORCE_REPLACE_AFTER_MS + 1,
    );
    expect(wake.action).toBe("replace");
    expect(replacement.signal.aborted).toBe(true);
    expect(gate.isCurrent(wake.generation)).toBe(true);
    expect(afterStaleFinish).toMatchObject({ action: "reuse", generation: wake.generation });

    gate.cancel();
    expect(wake.signal.aborted).toBe(true);
    expect(gate.begin(startedAt + ROOM_SYNC_REQUEST_TIMEOUT_MS + ROOM_SYNC_FORCE_REPLACE_AFTER_MS + 3).action).toBe(
      "start",
    );
  });
});

describe("deadline scheduling", () => {
  it("wakes just after an absolute deadline and never for a missing one", () => {
    expect(roomDeadlineSyncDelay(20_000, 19_000)).toBe(1_000 + ROOM_SYNC_DEADLINE_GRACE_MS);
    expect(roomDeadlineSyncDelay(20_000, 21_000)).toBe(0);
    expect(roomDeadlineSyncDelay(null, 21_000)).toBeNull();
  });

  it("refreshes exactly at the one-third clue boundaries", () => {
    expect(roomProgressiveClueSyncDeadline(25_000, 15_000, 1)).toBe(15_000);
    expect(roomProgressiveClueSyncDeadline(25_000, 15_000, 2)).toBe(20_000);
    expect(roomProgressiveClueSyncDeadline(25_000, 15_000, 3)).toBeNull();
    expect(roomProgressiveClueSyncDeadline(25_000, 0, 1)).toBeNull();
  });

  it("wakes Soundcheck at seven seconds left for the full cut", () => {
    expect(roomProgressiveClueSyncDeadline(25_000, 15_000, 1, "soundcheck")).toBe(15_000);
    expect(roomProgressiveClueSyncDeadline(25_000, 15_000, 2, "soundcheck")).toBe(18_000);
  });

  it("wakes Echo Hunt at seven seconds left for the full line", () => {
    expect(roomProgressiveClueSyncDeadline(25_000, 15_000, 2, "echo-hunt")).toBe(18_000);
  });

  it("keeps the reviewed five-second heartbeat", () => {
    expect(ROOM_SYNC_HEARTBEAT_MS).toBe(5_000);
  });
});
