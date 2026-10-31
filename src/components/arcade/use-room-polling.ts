import { useEffect } from "react";
import { type PublicArcadeQuestion } from "@/lib/public-question";
import { PUBLIC_VOTE_ACCEPT_GRACE_MS } from "@/lib/round-timing.mjs";
import { ROOM_SYNC_HEARTBEAT_MS, roomDeadlineSyncDelay, roomProgressiveClueSyncDeadline } from "@/lib/room-sync.mjs";
import { type GamePhase, type LobbyPulse, normalizeLobbyPulse } from "./shared";

import type { Dispatch, SetStateAction } from "react";

export function useRoomPolling({
  phase,
  syncRoom,
  setNow,
  setActivePlayers,
  setLobbyPulse,
  deadline,
  revealDeadline,
  entryWaitDeadline,
  currentQuestion,
  answerDuration,
  lastSnapshotRequestedAt,
}: {
  phase: GamePhase;
  syncRoom: (force?: boolean) => Promise<void>;
  setNow: Dispatch<SetStateAction<number>>;
  setActivePlayers: Dispatch<SetStateAction<number>>;
  setLobbyPulse: Dispatch<SetStateAction<LobbyPulse | null>>;
  deadline: number | null;
  revealDeadline: number | null;
  entryWaitDeadline: number | null;
  currentQuestion: PublicArcadeQuestion | null;
  answerDuration: number;
  lastSnapshotRequestedAt: number;
}) {
  useEffect(() => {
    if (phase === "lobby") return;
    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase === "lobby") return;

    const interval = window.setInterval(() => void syncRoom(), ROOM_SYNC_HEARTBEAT_MS);
    const wakeRoom = () => {
      setNow(Date.now());
      void syncRoom(true);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") wakeRoom();
    };

    window.addEventListener("focus", wakeRoom);
    window.addEventListener("pageshow", wakeRoom);
    window.addEventListener("online", wakeRoom);
    document.addEventListener("visibilitychange", handleVisibility);
    document.addEventListener("resume", wakeRoom);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", wakeRoom);
      window.removeEventListener("pageshow", wakeRoom);
      window.removeEventListener("online", wakeRoom);
      document.removeEventListener("visibilitychange", handleVisibility);
      document.removeEventListener("resume", wakeRoom);
    };
  }, [phase, syncRoom]);

  useEffect(() => {
    if (phase !== "lobby") return;
    let active = true;
    let boundary: number | undefined;
    const loadPresence = async () => {
      try {
        const response = await fetch("/api/presence", { cache: "no-store" });
        const payload: unknown = await response.json();
        if (
          active &&
          response.ok &&
          payload &&
          typeof payload === "object" &&
          "activePlayers" in payload &&
          typeof payload.activePlayers === "number" &&
          Number.isInteger(payload.activePlayers) &&
          payload.activePlayers >= 0
        ) {
          setActivePlayers(payload.activePlayers);
          const pulse = normalizeLobbyPulse(payload);
          setLobbyPulse(pulse);
          // Refetch right after this round ends so the next format shows up at the boundary, not on the next tick.
          if (pulse?.round) {
            window.clearTimeout(boundary);
            const wait = pulse.round.revealDeadline - (Date.now() + pulse.serverOffset) + 300;
            boundary = window.setTimeout(() => void loadPresence(), Math.max(300, wait));
          }
        }
      } catch {
        // Presence is decorative; room entry must stay independent from it.
      }
    };
    void loadPresence();
    const interval = window.setInterval(() => void loadPresence(), 5_000);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.clearTimeout(boundary);
    };
  }, [phase]);

  useEffect(() => {
    const phaseDeadline =
      phase === "answering"
        ? deadline == null
          ? null
          : deadline + PUBLIC_VOTE_ACCEPT_GRACE_MS
        : phase === "reveal"
          ? revealDeadline
          : phase === "waiting"
            ? entryWaitDeadline
            : null;
    const progressiveClueDeadline =
      phase === "answering" &&
      currentQuestion &&
      (currentQuestion.game === "spell-link" ||
        currentQuestion.game === "quote-hunt" ||
        currentQuestion.game === "aghanim-lab" ||
        currentQuestion.game === "soundcheck" ||
        currentQuestion.game === "echo-hunt" ||
        currentQuestion.game === "fogged-vision")
        ? roomProgressiveClueSyncDeadline(deadline, answerDuration, currentQuestion.clueStage, currentQuestion.game)
        : null;
    const activeDeadline =
      phaseDeadline !== null && progressiveClueDeadline !== null
        ? Math.min(phaseDeadline, progressiveClueDeadline)
        : (progressiveClueDeadline ?? phaseDeadline);
    const delay = roomDeadlineSyncDelay(activeDeadline, Date.now());
    if (delay === null) return;
    // The deadline has passed and the room already answered a request sent after
    // it with this same phase: the clocks disagree. Leave that to the heartbeat
    // rather than polling in a tight loop. A snapshot requested before the
    // deadline is simply stale, so sync again now.
    if (delay === 0 && activeDeadline !== null && lastSnapshotRequestedAt > activeDeadline) return;

    const timeout = window.setTimeout(() => {
      setNow(Date.now());
      void syncRoom(true);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [
    answerDuration,
    currentQuestion,
    deadline,
    entryWaitDeadline,
    lastSnapshotRequestedAt,
    phase,
    revealDeadline,
    syncRoom,
  ]);
}
