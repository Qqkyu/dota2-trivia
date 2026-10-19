import { useCallback, useRef, useState } from "react";
import type { RoundGame } from "@/lib/trivia";
import type { PlayerIdentity } from "@/lib/arcade-contract";
import {
  applyGuestLifetimeStats,
  forgetGuestPendingVote,
  readGuestLifetimeStats,
  reconcileGuestRunBest,
  markGuestRoundSettled,
} from "@/lib/guest-accuracy.mjs";
import { safeBrowserStorage } from "@/lib/browser-storage.mjs";
import { updateGuestLifetimeStorage } from "@/lib/guest-lifetime-storage.mjs";
import { playerIdentityKey } from "@/lib/player-identity";
import { reconcileSessionResult, sessionResultTotals, type SessionRoundResult } from "@/lib/session-results";
import { type PublicArcadeQuestion } from "@/lib/public-question";
import { STORAGE_KEY, type RoundRecord } from "./shared";

import type { usePlayerSettings } from "./use-player-settings";

import type { RefObject } from "react";

export function useSessionScore({
  playerIdentityRef,
  alphaSessionIdRef,
  setLifetimeStats,
}: {
  playerIdentityRef: RefObject<PlayerIdentity | null>;
  alphaSessionIdRef: RefObject<string>;
  setLifetimeStats: ReturnType<typeof usePlayerSettings>["setLifetimeStats"];
}) {
  const [score, setScore] = useState(0);

  const scoreRef = useRef(0);

  const [streak, setStreak] = useState(0);

  const [correctCount, setCorrectCount] = useState(0);

  const [history, setHistory] = useState<RoundRecord[]>([]);

  const sessionResultsRef = useRef<SessionRoundResult[]>([]);

  const runSavedRef = useRef(false);

  const creditRound = useCallback(
    (
      roundId: string,
      result: {
        correct: boolean;
        points: number;
        category?: PublicArcadeQuestion["category"];
        game?: RoundGame;
        accepted?: boolean;
        identity: PlayerIdentity | null;
      },
    ) => {
      if (!result.identity && playerIdentityRef.current) return false;
      const scope = { playerId: playerIdentityKey(result.identity) ?? "" };
      if (result.accepted !== false && result.identity?.kind === "account") {
        forgetGuestPendingVote(safeBrowserStorage("session"), roundId, scope);
      }
      const records = reconcileSessionResult(sessionResultsRef.current, {
        id: roundId,
        accepted: result.accepted !== false,
        correct: result.correct,
        points: result.points,
        category: result.category,
        game: result.game,
      });
      if (records === sessionResultsRef.current) return false;
      sessionResultsRef.current = records;
      const totals = sessionResultTotals(records);
      const nextScore = totals.score;
      scoreRef.current = nextScore;
      setScore(nextScore);
      setCorrectCount(totals.correctCount);
      setStreak(totals.streak);
      setHistory(
        records.filter((record): record is SessionRoundResult & RoundRecord => Boolean(record.category && record.game)),
      );
      if (result.accepted !== false && result.identity?.kind === "guest") {
        const startedRun = !runSavedRef.current;
        runSavedRef.current = true;
        const runId = alphaSessionIdRef.current;
        const persistLifetime = (storage: {
          getItem: (key: string) => string | null;
          setItem: (key: string, value: string) => void;
        }) => {
          const firstSettlement = markGuestRoundSettled(storage, roundId, scope);
          const latest = readGuestLifetimeStats(storage, STORAGE_KEY);
          const nextStats = firstSettlement
            ? applyGuestLifetimeStats(latest, { correct: result.correct, startedRun, nextScore })
            : latest;
          if (runId) nextStats.bestScore = reconcileGuestRunBest(storage, runId, nextScore, latest.bestScore);
          storage.setItem(STORAGE_KEY, JSON.stringify(nextStats));
          return nextStats;
        };
        void updateGuestLifetimeStorage(safeBrowserStorage("local"), persistLifetime).then(
          ({ value, current, persisted }) => {
            if (persisted) forgetGuestPendingVote(safeBrowserStorage("session"), roundId, scope);
            if (current) setLifetimeStats(value);
          },
        );
      }
      return true;
    },
    [],
  );

  return {
    score,
    setScore,
    scoreRef,
    streak,
    setStreak,
    correctCount,
    setCorrectCount,
    history,
    setHistory,
    sessionResultsRef,
    runSavedRef,
    creditRound,
  };
}
