import { ECHO_HUNT_FINAL_REVEAL_SECONDS, SOUNDCHECK_FINAL_REVEAL_SECONDS } from "./soundcheck.mjs";

export const ROOM_SYNC_REQUEST_TIMEOUT_MS = 5_000;
export const ROOM_SYNC_DEADLINE_GRACE_MS = 75;
export const ROOM_SYNC_HEARTBEAT_MS = 5_000;

export function roomSyncAttemptAction(pendingStartedAt, now, force = false, timeoutMs = ROOM_SYNC_REQUEST_TIMEOUT_MS) {
  if (!Number.isFinite(pendingStartedAt)) return "start";

  const elapsed = now - pendingStartedAt;
  if (force || !Number.isFinite(now) || elapsed < 0 || elapsed >= timeoutMs) return "replace";
  return "reuse";
}

export function roomDeadlineSyncDelay(deadline, now, graceMs = ROOM_SYNC_DEADLINE_GRACE_MS) {
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) return null;
  return Math.max(0, deadline - now + graceMs);
}

export function roomProgressiveClueSyncDeadline(answerDeadline, answerDuration, clueStage, roundGame) {
  if (
    !Number.isFinite(answerDeadline) ||
    !Number.isFinite(answerDuration) ||
    answerDuration <= 0 ||
    (clueStage !== 1 && clueStage !== 2)
  ) {
    return null;
  }

  if (roundGame === "soundcheck" && clueStage === 2) {
    return answerDeadline - SOUNDCHECK_FINAL_REVEAL_SECONDS * 1_000;
  }
  if (roundGame === "echo-hunt" && clueStage === 2) {
    return answerDeadline - ECHO_HUNT_FINAL_REVEAL_SECONDS * 1_000;
  }

  return answerDeadline - (answerDuration * (3 - clueStage)) / 3;
}

export function createRoomSyncGate({ timeoutMs = ROOM_SYNC_REQUEST_TIMEOUT_MS } = {}) {
  let generation = 0;
  let pending = null;

  return {
    begin(now = Date.now(), force = false) {
      const action = roomSyncAttemptAction(pending?.startedAt ?? null, now, force, timeoutMs);
      if (action === "reuse") {
        return {
          action,
          generation: pending.generation,
          promise: pending.promise,
          signal: pending.controller.signal,
        };
      }

      const replaced = pending;
      pending = null;
      replaced?.controller.abort();

      const controller = new AbortController();
      pending = {
        generation: ++generation,
        startedAt: now,
        controller,
        promise: null,
      };

      return {
        action,
        generation: pending.generation,
        promise: null,
        signal: controller.signal,
      };
    },

    attach(attemptGeneration, promise) {
      if (pending?.generation === attemptGeneration) pending.promise = promise;
      return promise;
    },

    isCurrent(attemptGeneration) {
      return pending?.generation === attemptGeneration;
    },

    finish(attemptGeneration) {
      if (pending?.generation === attemptGeneration) pending = null;
    },

    cancel() {
      const cancelled = pending;
      pending = null;
      cancelled?.controller.abort();
    },
  };
}
