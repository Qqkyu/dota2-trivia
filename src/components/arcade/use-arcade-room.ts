import { useCallback, useEffect, useRef, useState } from "react";
import { REPORT_REASONS } from "@/lib/calibration";
import type { AccountSnapshot } from "@/lib/account-contract";
import type { CrowdResult, PlayerIdentity, PublicRoomSettings, RoomSnapshot } from "@/lib/arcade-contract";
import { guestPendingRoundIds, forgetGuestPendingVote, rememberGuestPendingVote } from "@/lib/guest-accuracy.mjs";
import { safeBrowserStorage } from "@/lib/browser-storage.mjs";
import { requestWithRetry } from "@/lib/request-retry.mjs";
import { playerIdentityKey, samePlayerIdentity } from "@/lib/player-identity";
import { PUBLIC_ARCADE_MODE } from "@/lib/arcade-games.mjs";
import { shouldShowEntryWaitLessons, shouldWaitForNextRoundOnEntry } from "@/lib/arcade-entry.mjs";
import { isFlashbackOrderAnswerForQuestion, isFlashbackYearAnswerInRange } from "@/lib/flashback.mjs";
import { ARCADE_LOBBY_PATH, PUBLIC_ARCADE_PATH, arcadeViewForPathname } from "@/lib/arcade-navigation.mjs";
import { DEFAULT_GAME_ID } from "@/lib/game-identity";
import { answerFeedbackKind } from "@/lib/feedback-sounds.mjs";
import { isHeroCatalogKey } from "@/lib/hero-picker";
import { crowdScoreMultiplier, scoreBreakdown } from "@/lib/scoring.mjs";
import { isRecipeAnswerKey, isShopkeeperCatalogKey, recipeItemsFromAnswerKey } from "@/lib/shopkeeper-catalog";
import {
  isPublicBuildResultQuestion,
  isPublicHeroPickerQuestion,
  isPublicKeyedAnswerQuestion,
  isPublicQuestionAnswerCorrect,
  isPublicRecipeBuilderQuestion,
  isPublicFlashbackOrderQuestion,
  isPublicFlashbackYearQuestion,
  isPublicValueOrderQuestion,
  publicCorrectIndex,
  type PublicArcadeQuestion,
} from "@/lib/public-question";
import { isValueOrderAnswerForQuestion } from "@/lib/value-order.mjs";
import { createRoomSyncGate } from "@/lib/room-sync.mjs";
import { normalizeRoomSnapshot, normalizeVoteResult, publicRoomQuery } from "./room-snapshot";
import { ANSWER_DURATION_MS, EMPTY_CROWD, withPlayerId, type GamePhase, type RoundAward } from "./shared";

import type { useArcadeAudio } from "./use-arcade-audio";
import type { usePlayerId } from "./use-player-id";
import type { usePlayerSettings } from "./use-player-settings";
import type { useRoundRefs } from "./use-round-refs";
import { useHeroPreload } from "./use-hero-preload";
import { useQuestionReports } from "./use-question-reports";
import { useRoundFocus } from "./use-round-focus";
import { useAlphaSession } from "./use-alpha-session";
import { useSessionScore } from "./use-session-score";
import { useRoomPolling } from "./use-room-polling";
import { useAnswerShortcuts } from "./use-answer-shortcuts";

export function useArcadeRoom({
  autoStart,
  partyStart,
  roomCode,
  refs,
  playerId,
  settings,
  audio,
}: {
  autoStart: boolean;
  partyStart: boolean;
  roomCode?: string;
  refs: ReturnType<typeof useRoundRefs>;
  playerId: ReturnType<typeof usePlayerId>;
  settings: ReturnType<typeof usePlayerSettings>;
  audio: ReturnType<typeof useArcadeAudio>;
}) {
  const { phaseRef, currentQuestionRef, roundIdRef } = refs;
  const { ensurePlayerId } = playerId;
  const { setLifetimeStats } = settings;
  const {
    feedbackPlayerRef,
    playSound,
    stopRoundAudio,
    setRoundAudioState,
    setRoundAudioPlayCount,
    setRoundAudioClipIndex,
  } = audio;
  const [phase, setPhaseState] = useState<GamePhase>("lobby");

  const [currentQuestion, setCurrentQuestion] = useState<PublicArcadeQuestion | null>(null);

  const [roundIndex, setRoundIndex] = useState(0);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const [selectedAnswerKey, setSelectedAnswerKey] = useState<string | null>(null);

  const [answerTimeLeft, setAnswerTimeLeft] = useState(0);

  const [crowd, setCrowdState] = useState<CrowdResult>(EMPTY_CROWD);

  const [roundAward, setRoundAward] = useState<RoundAward | null>(null);

  const [deadline, setDeadlineState] = useState<number | null>(null);

  const [revealDeadline, setRevealDeadlineState] = useState<number | null>(null);

  const [entryWaitDeadline, setEntryWaitDeadline] = useState<number | null>(null);

  const [now, setNow] = useState(0);

  const [account, setAccount] = useState<AccountSnapshot | null>(null);

  const accountRef = useRef<AccountSnapshot | null>(null);

  const accountRequestRef = useRef<AbortController | null>(null);

  const playerIdentityRef = useRef<PlayerIdentity | null>(null);

  const identityGenerationRef = useRef(0);

  const joiningRoomRef = useRef(false);

  const entryRequestRef = useRef<AbortController | null>(null);

  const [roomError, setRoomError] = useState<string | null>(null);

  const [voteError, setVoteError] = useState<string | null>(null);

  const [activeRoomId, setActiveRoomId] = useState("");

  const [activeRoundId, setActiveRoundId] = useState("");

  const [activePlayers, setActivePlayers] = useState(0);

  const [privateWaiting, setPrivateWaiting] = useState(Boolean(roomCode));

  const [partyOpen, setPartyOpen] = useState(Boolean(roomCode) || partyStart);

  const [activePrivateCode, setActivePrivateCode] = useState(roomCode ?? "");

  const [partyInviteCode, setPartyInviteCode] = useState(roomCode ?? "");

  const privateCodeRef = useRef(roomCode ?? "");

  const partyMode = partyOpen || privateWaiting;

  const roundIndexRef = useRef(0);

  const selectedIndexRef = useRef<number | null>(null);

  const selectedAnswerKeyRef = useRef<string | null>(null);

  const answerTimeLeftRef = useRef(0);

  const crowdRef = useRef<CrowdResult>(EMPTY_CROWD);

  const deadlineRef = useRef<number | null>(null);

  const finalizedRef = useRef(false);

  const voteRequestSettledRef = useRef(false);

  const participatedRef = useRef(false);

  const roomSettingsRef = useRef<PublicRoomSettings | null>(null);

  const roomSnapshotRef = useRef<RoomSnapshot | null>(null);

  const roundStageRef = useRef<HTMLDivElement | null>(null);

  const roundHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const questionRevisionRef = useRef("");

  const entryWaitRoundIdRef = useRef("");

  const entryWaitModeRef = useRef<"lessons" | "silent" | null>(null);

  const [entryWaitMode, setEntryWaitMode] = useState<"lessons" | "silent" | null>(null);

  const roomSyncGateRef = useRef<ReturnType<typeof createRoomSyncGate> | null>(null);

  const prewarmedAfterRoundIdRef = useRef("");

  const autoStartAttemptedRef = useRef(false);

  if (roomSyncGateRef.current === null) roomSyncGateRef.current = createRoomSyncGate();

  useHeroPreload();
  const reports = useQuestionReports({
    phaseRef,
    currentQuestionRef,
    roundIdRef,
    identityGenerationRef,
    roomSettingsRef,
    roomSnapshotRef,
    ensurePlayerId,
    revealDeadline,
    activeRoundId,
  });
  const {
    reportState,
    reportedReason,
    setReportedReason,
    reportTarget,
    reportNotice,
    setReportNotice,
    reportTargetRef,
    reportFocusRef,
    updateReportTarget,
    updateReportState,
    submitQuestionReport,
    toggleQuestionReport,
    dismissQuestionReport,
  } = reports;
  const { roundAnnouncement, scrollToRoundRef } = useRoundFocus({
    phase,
    currentQuestion,
    activeRoundId,
    roundIndex,
    roundStageRef,
    roundHeadingRef,
    reportFocusRef,
  });

  const answerDuration = ANSWER_DURATION_MS;

  const loadAccount = useCallback(async () => {
    accountRequestRef.current?.abort();
    const controller = new AbortController();
    accountRequestRef.current = controller;
    const generation = identityGenerationRef.current;
    try {
      const response = await fetch("/api/me", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Profile request failed.");
      const next = (await response.json()) as AccountSnapshot;
      if (
        controller.signal.aborted ||
        accountRequestRef.current !== controller ||
        generation !== identityGenerationRef.current
      )
        return;
      const identity = playerIdentityRef.current;
      if (
        identity &&
        (next.authenticated
          ? identity.kind !== "account" || identity.id !== next.profile.user.id
          : identity.kind !== "guest")
      )
        return;
      accountRef.current = next;
      setAccount(next);
    } catch {
      // A temporary profile failure does not change the server's session cookie.
    }
  }, []);

  const setPhase = useCallback((nextPhase: GamePhase) => {
    phaseRef.current = nextPhase;
    setPhaseState(nextPhase);
  }, []);

  const setCrowd = useCallback((nextCrowd: CrowdResult) => {
    crowdRef.current = nextCrowd;
    setCrowdState(nextCrowd);
  }, []);

  const setDeadline = useCallback((nextDeadline: number | null) => {
    deadlineRef.current = nextDeadline;
    setDeadlineState(nextDeadline);
  }, []);

  const resultVoterId = useCallback(() => {
    const known = playerIdentityKey(playerIdentityRef.current);
    if (known) return known;
    const current = accountRef.current;
    return current?.authenticated ? `account:${current.profile.user.id}` : ensurePlayerId();
  }, [ensurePlayerId]);

  const { alphaSessionIdRef, alphaSessionFinishedRef, sendAlphaSessionEvent, finishAlphaSession } = useAlphaSession({
    ensurePlayerId,
  });
  const {
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
  } = useSessionScore({ playerIdentityRef, alphaSessionIdRef, setLifetimeStats });

  const adoptPlayerIdentity = useCallback(
    (identity: PlayerIdentity | null) => {
      if (!identity || samePlayerIdentity(playerIdentityRef.current, identity)) return false;
      const changed = playerIdentityRef.current !== null || sessionResultsRef.current.length > 0;
      playerIdentityRef.current = identity;
      identityGenerationRef.current += 1;
      accountRequestRef.current?.abort();
      if (identity.kind === "guest") {
        accountRef.current = { authenticated: false };
        setAccount(accountRef.current);
      } else if (!accountRef.current?.authenticated || accountRef.current.profile.user.id !== identity.id) {
        accountRef.current = null;
        setAccount(null);
        void loadAccount();
      }
      if (changed) {
        sessionResultsRef.current = [];
        scoreRef.current = 0;
        setScore(0);
        setCorrectCount(0);
        setStreak(0);
        setHistory([]);
        setRoundAward(null);
        roundIndexRef.current = 0;
        setRoundIndex(0);
        runSavedRef.current = false;
        finalizedRef.current = false;
        voteRequestSettledRef.current = false;
        selectedIndexRef.current = null;
        selectedAnswerKeyRef.current = null;
        setSelectedIndex(null);
        setSelectedAnswerKey(null);
        participatedRef.current = false;
        setVoteError(null);
        setReportedReason(null);
        updateReportTarget(null);
        updateReportState("idle");
        setReportNotice(null);
        reportFocusRef.current = null;
        alphaSessionIdRef.current = window.crypto.randomUUID();
        alphaSessionFinishedRef.current = false;
        void sendAlphaSessionEvent("start", alphaSessionIdRef.current).catch(() => undefined);
      }
      return changed;
    },
    [loadAccount, sendAlphaSessionEvent, updateReportState, updateReportTarget],
  );

  const requestRoomSnapshot = useCallback(
    async (settings: PublicRoomSettings, playerId: string, signal?: AbortSignal) => {
      const requestedAt = Date.now();
      const identityGeneration = identityGenerationRef.current;
      const response = await fetch(
        `/api/rounds?${publicRoomQuery(settings, playerId, questionRevisionRef.current, guestPendingRoundIds(safeBrowserStorage("session"), { playerId: resultVoterId(), roomId: roomSnapshotRef.current?.room.id }))}`,
        {
          cache: "no-store",
          signal,
        },
      );
      const payload: unknown = await response.json();
      const receivedAt = Date.now();

      if (!response.ok) throw new Error("Public room unavailable.");
      const snapshot = normalizeRoomSnapshot(payload);
      if (!snapshot) throw new Error("Public room returned an invalid round.");

      return {
        snapshot,
        identityGeneration,
        receivedAt,
        clockOffset: (requestedAt + receivedAt) / 2 - snapshot.serverNow,
      };
    },
    [resultVoterId],
  );

  const finalizeRound = useCallback(
    (snapshot: RoomSnapshot, localRevealDeadline: number) => {
      const question = currentQuestionRef.current;
      if (!question || !participatedRef.current || snapshot.round.id !== roundIdRef.current) {
        return;
      }

      setDeadline(null);
      if (localRevealDeadline > 0) setRevealDeadlineState(localRevealDeadline);
      setPhase("reveal");
      setCrowd(snapshot.crowd);

      const voted = Boolean(snapshot.playerVote);
      const locked = selectedIndexRef.current !== null || Boolean(selectedAnswerKeyRef.current);
      const pendingVote = locked && !voted && !voteRequestSettledRef.current;
      if (pendingVote) return;

      const firstFinalization = !finalizedRef.current;
      finalizedRef.current = true;
      const pickedCorrect = locked
        ? isPublicQuestionAnswerCorrect(
            question,
            selectedIndexRef.current ?? -1,
            selectedAnswerKeyRef.current ?? undefined,
          )
        : false;
      const isCorrect = voted && pickedCorrect;
      const correctIndex = publicCorrectIndex(question);
      if (correctIndex < 0) throw new Error("The reveal did not include a correct answer.");
      const correctVotes = snapshot.crowd.counts[correctIndex];
      const crowdCorrectCount = snapshot.crowd.scoreSummary?.correctCount ?? correctVotes;
      const majorityBonus = isCorrect && crowdScoreMultiplier(crowdCorrectCount, snapshot.crowd.total) === 2;
      const {
        speedBonus,
        cluePenalty,
        rawPoints: correctPoints,
      } = scoreBreakdown(question, answerTimeLeftRef.current, snapshot.round.answerDuration);
      const rawPoints = isCorrect ? correctPoints : 0;
      const localPoints = majorityBonus ? rawPoints * 2 : rawPoints;
      const points = voted ? (snapshot.crowd.scoreSummary?.playerPoints ?? localPoints) : 0;

      setRoundAward({
        points,
        majorityBonus,
        correct: isCorrect,
        speedBonus,
        cluePenalty,
      });
      creditRound(snapshot.round.id, {
        identity: snapshot.playerIdentity,
        correct: isCorrect,
        points,
        category: question.category,
        game: question.game,
        accepted: voted,
      });

      if (firstFinalization) {
        if (voted) playSound(answerFeedbackKind(isCorrect));
        else if (!pickedCorrect) playSound(answerFeedbackKind(false));
      }
    },
    [creditRound, playSound, setCrowd, setDeadline, setPhase],
  );

  const applyRoomSnapshot = useCallback(
    (snapshot: RoomSnapshot, clockOffset: number, receivedAt: number) => {
      const localAnswerDeadline = snapshot.round.answerDeadline + clockOffset;
      const localRevealDeadline = snapshot.round.revealDeadline + clockOffset;
      const identityChanged = adoptPlayerIdentity(snapshot.playerIdentity);
      const isNewRound = roundIdRef.current !== snapshot.round.id || identityChanged;
      const hadRound = Boolean(roundIdRef.current) && !identityChanged;
      if (hadRound && roundIdRef.current !== snapshot.round.id && snapshot.round.phase === "answering") {
        scrollToRoundRef.current = snapshot.round.id;
      }
      if (isNewRound && reportTargetRef.current) {
        const focused = document.activeElement;
        if (
          focused instanceof HTMLElement &&
          (focused.dataset.testid === "report-reason" || focused.dataset.testid === "report-question")
        ) {
          reportFocusRef.current = focused.dataset.reportReason ?? REPORT_REASONS[0];
        }
      }

      roomSnapshotRef.current = snapshot;
      setActiveRoomId(snapshot.room.id);
      setActiveRoundId(snapshot.round.id);
      setActivePlayers(snapshot.presence.activePlayers);
      setCrowd(snapshot.crowd);
      setRoomError(null);
      setNow(receivedAt);

      if (snapshot.round.phase === "reveal" && prewarmedAfterRoundIdRef.current !== snapshot.round.id) {
        prewarmedAfterRoundIdRef.current = snapshot.round.id;
        void fetch(withPlayerId(`/api/round-audio?roundId=${encodeURIComponent(snapshot.round.id)}`), {
          method: "HEAD",
          cache: "no-store",
        }).catch(() => undefined);
      }

      if (entryWaitRoundIdRef.current && !privateCodeRef.current) {
        const waitingForRoundId = entryWaitRoundIdRef.current;
        const nextRoundIsStillTooLate = shouldWaitForNextRoundOnEntry(snapshot.round, snapshot.serverNow);
        const keepWaiting = snapshot.round.id === waitingForRoundId || nextRoundIsStillTooLate;

        if (keepWaiting) {
          entryWaitRoundIdRef.current = snapshot.round.id;
          if (entryWaitModeRef.current === null) {
            const remaining = localRevealDeadline - receivedAt;
            const mode = shouldShowEntryWaitLessons(remaining) ? "lessons" : "silent";
            entryWaitModeRef.current = mode;
            setEntryWaitMode(mode);
          }
          currentQuestionRef.current = null;
          setCurrentQuestion(null);
          setDeadline(null);
          setRevealDeadlineState(null);
          setEntryWaitDeadline(localRevealDeadline);
          setPhase("waiting");
          return;
        }

        entryWaitRoundIdRef.current = "";
        entryWaitModeRef.current = null;
        setEntryWaitMode(null);
        setEntryWaitDeadline(null);
      }

      const question = snapshot.question ?? currentQuestionRef.current;
      if (
        !question ||
        question.id !== snapshot.round.id ||
        question.game !== snapshot.round.game ||
        (snapshot.question === null && questionRevisionRef.current !== snapshot.questionRevision)
      ) {
        throw new Error("The synchronized round did not include its public question payload.");
      }
      if (snapshot.question) questionRevisionRef.current = snapshot.questionRevision;
      if (snapshot.playerVote && snapshot.playerIdentity) {
        rememberGuestPendingVote(safeBrowserStorage("session"), snapshot.round.id, {
          playerId: playerIdentityKey(snapshot.playerIdentity) ?? "",
          roomId: snapshot.room.id,
        });
      }

      for (const missed of snapshot.previousResults) {
        creditRound(missed.roundId, {
          identity: snapshot.playerIdentity,
          correct: missed.correct,
          points: missed.points,
          category:
            missed.category ??
            (currentQuestionRef.current?.id === missed.roundId ? currentQuestionRef.current.category : undefined),
          game:
            missed.game ??
            (currentQuestionRef.current?.id === missed.roundId ? currentQuestionRef.current.game : undefined),
        });
      }

      if (isNewRound) {
        roundIdRef.current = snapshot.round.id;
        currentQuestionRef.current = question;
        setCurrentQuestion(question);
        setRoundAward(null);
        setRoundAudioState("loading");
        setRoundAudioPlayCount(0);
        setRoundAudioClipIndex(0);
        setReportedReason(snapshot.playerReport);
        if (!reportTargetRef.current) {
          updateReportState(snapshot.playerReport ? "sent" : "idle");
        }

        const nextRoundIndex = hadRound ? roundIndexRef.current + 1 : 0;
        roundIndexRef.current = nextRoundIndex;
        setRoundIndex(nextRoundIndex);

        const playerVote = snapshot.playerVote;
        const nextSelectedIndex = playerVote?.answerIndex ?? null;
        const nextSelectedAnswerKey = playerVote?.answerKey ?? null;
        const nextAnswerTimeLeft = playerVote ? Math.max(0, snapshot.round.answerDeadline - playerVote.submittedAt) : 0;
        selectedIndexRef.current = nextSelectedIndex;
        selectedAnswerKeyRef.current = nextSelectedAnswerKey;
        answerTimeLeftRef.current = nextAnswerTimeLeft;
        setSelectedIndex(nextSelectedIndex);
        setSelectedAnswerKey(nextSelectedAnswerKey);
        setAnswerTimeLeft(nextAnswerTimeLeft);
        setVoteError(null);

        participatedRef.current = snapshot.round.phase === "answering" || Boolean(playerVote);
        finalizedRef.current = false;
        voteRequestSettledRef.current = Boolean(playerVote);
        if (snapshot.round.phase === "answering") feedbackPlayerRef.current?.clearPending();

        if (snapshot.round.phase === "answering") {
          setDeadline(localAnswerDeadline);
          setRevealDeadlineState(null);
          setPhase("answering");
          return;
        }

        setDeadline(null);
        setRevealDeadlineState(localRevealDeadline);
        setPhase("reveal");
        finalizeRound(snapshot, localRevealDeadline);
        return;
      }

      currentQuestionRef.current = question;
      setCurrentQuestion(question);

      if (snapshot.playerReport) {
        setReportedReason(snapshot.playerReport);
        updateReportState("sent");
        if (reportTargetRef.current?.roundId === snapshot.round.id) {
          updateReportTarget(null);
        }
      }

      if (snapshot.playerVote) {
        voteRequestSettledRef.current = true;
        const nextAnswerTimeLeft = Math.max(0, snapshot.round.answerDeadline - snapshot.playerVote.submittedAt);
        selectedIndexRef.current = snapshot.playerVote.answerIndex;
        selectedAnswerKeyRef.current = snapshot.playerVote.answerKey ?? null;
        answerTimeLeftRef.current = nextAnswerTimeLeft;
        setSelectedIndex(snapshot.playerVote.answerIndex);
        setSelectedAnswerKey(snapshot.playerVote.answerKey ?? null);
        setAnswerTimeLeft(nextAnswerTimeLeft);
      }

      if (snapshot.round.phase === "answering") {
        feedbackPlayerRef.current?.clearPending();
        setDeadline(localAnswerDeadline);
        setRevealDeadlineState(null);
        setPhase("answering");
        return;
      }

      setRevealDeadlineState(localRevealDeadline);
      finalizeRound(snapshot, localRevealDeadline);
    },
    [
      adoptPlayerIdentity,
      creditRound,
      finalizeRound,
      setCrowd,
      setDeadline,
      setPhase,
      updateReportState,
      updateReportTarget,
    ],
  );

  const syncRoom = useCallback(
    (force = false) => {
      const settings = roomSettingsRef.current;
      if (!settings) return Promise.resolve();
      const gate = roomSyncGateRef.current;
      if (!gate) return Promise.resolve();

      const attempt = gate.begin(Date.now(), force);
      if (attempt.action === "reuse") return attempt.promise ?? Promise.resolve();

      const task = (async () => {
        try {
          const result = await requestRoomSnapshot(settings, ensurePlayerId(), attempt.signal);
          if (
            !gate.isCurrent(attempt.generation) ||
            roomSettingsRef.current !== settings ||
            result.identityGeneration !== identityGenerationRef.current
          )
            return;
          applyRoomSnapshot(result.snapshot, result.clockOffset, result.receivedAt);
        } catch {
          if (gate.isCurrent(attempt.generation) && roomSettingsRef.current === settings) {
            setRoomError("Connection interrupted · retrying automatically");
          }
        } finally {
          gate.finish(attempt.generation);
        }
      })();

      return gate.attach(attempt.generation, task);
    },
    [applyRoomSnapshot, ensurePlayerId, requestRoomSnapshot],
  );

  const handlePartyWaiting = useCallback(
    (waiting: boolean) => {
      setPrivateWaiting(waiting);
      if (!waiting) return;
      setPartyOpen(true);
      if (phaseRef.current === "lobby") return;
      roomSyncGateRef.current?.cancel();
      roomSettingsRef.current = null;
      joiningRoomRef.current = false;
      roundIdRef.current = "";
      currentQuestionRef.current = null;
      setCurrentQuestion(null);
      setDeadline(null);
      setRevealDeadlineState(null);
      setPhase("lobby");
    },
    [setDeadline, setPhase],
  );

  const ignorePartyStart = useCallback(() => undefined, []);

  const startRun = useCallback(
    async (updateHistory = true, privateCode = privateCodeRef.current) => {
      if (joiningRoomRef.current) return;

      const settings: PublicRoomSettings = {
        gameId: DEFAULT_GAME_ID,
        mode: PUBLIC_ARCADE_MODE,
        filter: "Mixed",
        ...(privateCode ? { privateCode } : {}),
      };
      joiningRoomRef.current = true;
      const controller = new AbortController();
      entryRequestRef.current = controller;
      setRoomError(null);
      roomSyncGateRef.current?.cancel();
      roomSettingsRef.current = settings;
      questionRevisionRef.current = "";
      feedbackPlayerRef.current?.preload();
      playSound("start");

      try {
        const result = await requestWithRetry(
          (signal: AbortSignal) => requestRoomSnapshot(settings, ensurePlayerId(), signal),
          { signal: controller.signal, onRetry: () => setRoomError("Could not connect · retrying.") },
        );
        if (
          controller.signal.aborted ||
          roomSettingsRef.current !== settings ||
          result.identityGeneration !== identityGenerationRef.current
        )
          return;

        roundIdRef.current = "";
        entryWaitRoundIdRef.current = "";
        entryWaitModeRef.current = null;
        setEntryWaitMode(null);
        prewarmedAfterRoundIdRef.current = "";
        currentQuestionRef.current = null;
        roundIndexRef.current = 0;
        runSavedRef.current = false;
        sessionResultsRef.current = [];
        finalizedRef.current = false;
        participatedRef.current = false;
        feedbackPlayerRef.current?.clearPending();
        setCurrentQuestion(null);
        selectedIndexRef.current = null;
        selectedAnswerKeyRef.current = null;
        setSelectedIndex(null);
        setSelectedAnswerKey(null);
        setRoundIndex(0);
        scoreRef.current = 0;
        setScore(0);
        setStreak(0);
        setCorrectCount(0);
        setHistory([]);
        setEntryWaitDeadline(null);
        const alphaSessionId = window.crypto.randomUUID();
        alphaSessionIdRef.current = alphaSessionId;
        alphaSessionFinishedRef.current = false;
        updateReportTarget(null);
        setReportNotice(null);
        setReportedReason(null);
        updateReportState("idle");
        if (!privateCode) {
          entryWaitRoundIdRef.current = result.snapshot.round.id;
        }
        applyRoomSnapshot(result.snapshot, result.clockOffset, result.receivedAt);
        void sendAlphaSessionEvent("start", alphaSessionId).catch(() => undefined);
        const playHref = privateCode ? `${PUBLIC_ARCADE_PATH}?room=${privateCode}` : PUBLIC_ARCADE_PATH;
        if (updateHistory && `${window.location.pathname}${window.location.search}` !== playHref) {
          window.history.pushState({ queueArcadeView: "play" }, "", playHref);
        }
      } catch {
        if (!controller.signal.aborted && roomSettingsRef.current === settings) {
          roomSettingsRef.current = null;
          setRoomError(
            privateCode
              ? "Could not join that party. Retry or return to the lobby."
              : "Could not join the public room. Press Play to retry.",
          );
        }
      } finally {
        if (entryRequestRef.current === controller) {
          entryRequestRef.current = null;
          joiningRoomRef.current = false;
        }
      }
    },
    [
      applyRoomSnapshot,
      ensurePlayerId,
      playSound,
      requestRoomSnapshot,
      sendAlphaSessionEvent,
      updateReportState,
      updateReportTarget,
    ],
  );

  useEffect(() => {
    if (roomCode || !autoStart || window.location.pathname !== PUBLIC_ARCADE_PATH || autoStartAttemptedRef.current) {
      return;
    }
    const timeout = window.setTimeout(() => {
      autoStartAttemptedRef.current = true;
      void startRun(false);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [autoStart, roomCode, startRun]);

  const submitVote = useCallback(
    async (answerIndex: number, options?: { answerKey?: string }) => {
      const snapshot = roomSnapshotRef.current;
      const settings = roomSettingsRef.current;
      if (!snapshot || !settings || snapshot.round.id !== roundIdRef.current) return;
      const voteScope = { playerId: resultVoterId(), roomId: snapshot.room.id };
      const voteIdentityGeneration = identityGenerationRef.current;
      // Keep recovery metadata before sending: the server can commit after this round ends.
      rememberGuestPendingVote(safeBrowserStorage("session"), snapshot.round.id, voteScope);

      try {
        const response = await fetch("/api/votes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...settings,
            roundId: snapshot.round.id,
            answerIndex,
            ...(options?.answerKey ? { answerKey: options.answerKey } : {}),
            voterId: ensurePlayerId(),
            ...(alphaSessionIdRef.current ? { sessionId: alphaSessionIdRef.current } : {}),
          }),
        });
        const payload: unknown = await response.json();

        if (!response.ok) {
          throw new Error(response.status === 409 ? "ROUND_CLOSED" : "VOTE_FAILED");
        }

        const result = normalizeVoteResult(payload);
        if (!result) throw new Error("VOTE_FAILED");
        const returnedIdentity = playerIdentityKey(result.playerIdentity);
        if (result.playerVote && returnedIdentity && returnedIdentity !== voteScope.playerId) {
          forgetGuestPendingVote(safeBrowserStorage("session"), snapshot.round.id, voteScope);
          rememberGuestPendingVote(safeBrowserStorage("session"), snapshot.round.id, {
            playerId: returnedIdentity,
            roomId: snapshot.room.id,
          });
        }
        if (voteIdentityGeneration !== identityGenerationRef.current) {
          void syncRoom(true);
          return;
        }
        const identityChanged = adoptPlayerIdentity(result.playerIdentity);
        const matchesIdentity =
          samePlayerIdentity(result.playerIdentity, playerIdentityRef.current) ||
          (!result.playerIdentity && !playerIdentityRef.current);
        if (roundIdRef.current !== snapshot.round.id || !matchesIdentity) {
          void syncRoom(true);
          return;
        }

        if (roundIdRef.current === snapshot.round.id) {
          voteRequestSettledRef.current = true;
          const nextCrowd =
            !identityChanged && phaseRef.current === "reveal" && !result.scoreSummary
              ? (roomSnapshotRef.current?.crowd ?? crowdRef.current)
              : {
                  counts: result.counts,
                  total: result.total,
                  keyCounts: result.keyCounts,
                  scoreSummary: result.scoreSummary,
                };
          setCrowd(nextCrowd);
          if (result.playerVote) {
            const serverTimeLeft = Math.max(0, snapshot.round.answerDeadline - result.playerVote.submittedAt);
            selectedIndexRef.current = result.playerVote.answerIndex;
            selectedAnswerKeyRef.current = result.playerVote.answerKey ?? null;
            answerTimeLeftRef.current = serverTimeLeft;
            setSelectedIndex(result.playerVote.answerIndex);
            setSelectedAnswerKey(result.playerVote.answerKey ?? null);
            setAnswerTimeLeft(serverTimeLeft);
            if (roomSnapshotRef.current?.round.id === snapshot.round.id) {
              roomSnapshotRef.current = {
                ...roomSnapshotRef.current,
                playerVote: result.playerVote,
                playerIdentity: result.playerIdentity,
                playerReport: identityChanged ? null : roomSnapshotRef.current.playerReport,
                crowd: nextCrowd,
              };
              participatedRef.current = true;
            }
          }
          setRoomError(null);
          setVoteError(null);
          if (phaseRef.current === "reveal" && roomSnapshotRef.current) {
            if (identityChanged && !result.scoreSummary) void syncRoom(true);
            else finalizeRound(roomSnapshotRef.current, 0);
          }
        }
      } catch (cause) {
        if (roundIdRef.current === snapshot.round.id && voteIdentityGeneration === identityGenerationRef.current) {
          const roundClosed = cause instanceof Error && cause.message === "ROUND_CLOSED";
          if (!roundClosed && phaseRef.current === "answering") {
            voteRequestSettledRef.current = false;
            selectedIndexRef.current = null;
            selectedAnswerKeyRef.current = null;
            setSelectedIndex(null);
            setSelectedAnswerKey(null);
            setVoteError("Vote failed · try again");
          } else {
            voteRequestSettledRef.current = true;
            setRoomError("Vote confirmation delayed · checking the room");
            if (phaseRef.current === "reveal" && roomSnapshotRef.current) {
              finalizeRound(roomSnapshotRef.current, 0);
            }
          }
        }
        void syncRoom();
      }
    },
    [adoptPlayerIdentity, ensurePlayerId, finalizeRound, resultVoterId, setCrowd, syncRoom],
  );

  const chooseAnswer = useCallback(
    (answerIndex: number) => {
      const question = currentQuestionRef.current;
      if (
        phaseRef.current !== "answering" ||
        !question ||
        isPublicKeyedAnswerQuestion(question) ||
        selectedIndexRef.current !== null ||
        !deadlineRef.current ||
        Date.now() >= deadlineRef.current
      ) {
        return;
      }

      const timeLeft = Math.max(0, deadlineRef.current - Date.now());
      playSound("lock");
      selectedIndexRef.current = answerIndex;
      answerTimeLeftRef.current = timeLeft;
      voteRequestSettledRef.current = false;
      setSelectedIndex(answerIndex);
      setAnswerTimeLeft(timeLeft);
      void submitVote(answerIndex);
    },
    [playSound, submitVote],
  );

  const chooseKeyedAnswer = useCallback(
    (answerKey: string) => {
      const question = currentQuestionRef.current;
      if (
        phaseRef.current !== "answering" ||
        !question ||
        !isPublicKeyedAnswerQuestion(question) ||
        (isPublicBuildResultQuestion(question) && !isShopkeeperCatalogKey(answerKey)) ||
        (isPublicRecipeBuilderQuestion(question) &&
          (!isRecipeAnswerKey(answerKey) ||
            recipeItemsFromAnswerKey(answerKey)?.length !== question.shopkeeper?.recipeSize)) ||
        (isPublicHeroPickerQuestion(question) && !isHeroCatalogKey(answerKey)) ||
        (isPublicValueOrderQuestion(question) && !isValueOrderAnswerForQuestion(question, answerKey)) ||
        (isPublicFlashbackOrderQuestion(question) && !isFlashbackOrderAnswerForQuestion(question, answerKey)) ||
        (isPublicFlashbackYearQuestion(question) &&
          !isFlashbackYearAnswerInRange(answerKey, question.flashback?.yearMin, question.flashback?.yearMax)) ||
        selectedIndexRef.current !== null ||
        !deadlineRef.current ||
        Date.now() >= deadlineRef.current
      ) {
        return;
      }

      // The browser intentionally does not know which catalog entry is correct.
      // The vote service resolves this opaque key against the private question.
      const answerIndex = 0;
      const timeLeft = Math.max(0, deadlineRef.current - Date.now());
      playSound("lock");
      selectedIndexRef.current = answerIndex;
      selectedAnswerKeyRef.current = answerKey;
      answerTimeLeftRef.current = timeLeft;
      voteRequestSettledRef.current = false;
      setSelectedIndex(answerIndex);
      setSelectedAnswerKey(answerKey);
      setAnswerTimeLeft(timeLeft);
      void submitVote(answerIndex, { answerKey });
    },
    [playSound, submitVote],
  );

  const returnToLobby = useCallback(
    (historyAction: "push" | "replace" | "none" = "push") => {
      entryRequestRef.current?.abort();
      entryRequestRef.current = null;
      joiningRoomRef.current = false;
      if (phaseRef.current !== "lobby") finishAlphaSession();
      roomSyncGateRef.current?.cancel();
      roomSettingsRef.current = null;
      roomSnapshotRef.current = null;
      playerIdentityRef.current = null;
      identityGenerationRef.current += 1;
      roundIdRef.current = "";
      scrollToRoundRef.current = null;
      questionRevisionRef.current = "";
      entryWaitRoundIdRef.current = "";
      entryWaitModeRef.current = null;
      setEntryWaitMode(null);
      prewarmedAfterRoundIdRef.current = "";
      autoStartAttemptedRef.current = false;
      feedbackPlayerRef.current?.pauseAll();
      stopRoundAudio(false);
      updateReportTarget(null);
      setReportNotice(null);
      updateReportState("idle");
      setDeadline(null);
      setRevealDeadlineState(null);
      setEntryWaitDeadline(null);
      setActiveRoomId("");
      setActiveRoundId("");
      setPhase("lobby");
      void loadAccount();
      setPartyOpen(false);
      setPrivateWaiting(false);
      const leavingCode = privateCodeRef.current || new URLSearchParams(window.location.search).get("room") || "";
      privateCodeRef.current = "";
      setActivePrivateCode("");
      setPartyInviteCode("");
      if (leavingCode) {
        const body = JSON.stringify({ code: leavingCode, playerId: ensurePlayerId() });
        const blob = new Blob([body], { type: "application/json" });
        if (!(typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/private-rooms/leave", blob))) {
          void fetch("/api/private-rooms/leave", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
          }).catch(() => undefined);
        }
      }

      if (historyAction !== "none" && (window.location.pathname !== ARCADE_LOBBY_PATH || window.location.search)) {
        const method = historyAction === "replace" ? "replaceState" : "pushState";
        window.history[method]({ queueArcadeView: "lobby" }, "", ARCADE_LOBBY_PATH);
      }
    },
    [
      ensurePlayerId,
      finishAlphaSession,
      loadAccount,
      setDeadline,
      setPhase,
      stopRoundAudio,
      updateReportState,
      updateReportTarget,
    ],
  );

  useEffect(() => {
    const handlePopState = () => {
      const view = arcadeViewForPathname(window.location.pathname);
      const room = new URLSearchParams(window.location.search).get("room");
      if (view === "play") {
        if (room) {
          privateCodeRef.current = room;
          setActivePrivateCode(room);
          setPartyInviteCode(room);
          setPartyOpen(true);
          if (phaseRef.current === "lobby") setPrivateWaiting(true);
          return;
        }
        setPartyOpen(false);
        setPrivateWaiting(false);
        privateCodeRef.current = "";
        setActivePrivateCode("");
        setPartyInviteCode("");
        if (phaseRef.current === "lobby") void startRun(false);
        return;
      }
      if (view === "party") {
        returnToLobby("none");
        setPartyOpen(true);
        setPrivateWaiting(false);
        privateCodeRef.current = "";
        setActivePrivateCode("");
        setPartyInviteCode("");
        return;
      }
      returnToLobby("none");
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [returnToLobby, startRun]);

  useRoomPolling({
    phase,
    syncRoom,
    setNow,
    setActivePlayers,
    deadline,
    revealDeadline,
    entryWaitDeadline,
    currentQuestion,
    answerDuration,
  });

  useEffect(
    () => () => {
      roomSyncGateRef.current?.cancel();
      entryRequestRef.current?.abort();
      accountRequestRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadAccount(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadAccount]);

  useAnswerShortcuts({ phase, phaseRef, currentQuestionRef, chooseAnswer });

  return {
    phase,
    currentQuestion,
    roundIndex,
    selectedIndex,
    selectedAnswerKey,
    answerTimeLeft,
    crowd,
    roundAward,
    score,
    streak,
    correctCount,
    history,
    deadline,
    revealDeadline,
    entryWaitDeadline,
    now,
    account,
    roomError,
    voteError,
    activeRoomId,
    activeRoundId,
    roundAnnouncement,
    activePlayers,
    reportState,
    reportedReason,
    reportTarget,
    reportNotice,
    privateWaiting,
    setPrivateWaiting,
    partyOpen,
    setPartyOpen,
    activePrivateCode,
    setActivePrivateCode,
    partyInviteCode,
    setPartyInviteCode,
    privateCodeRef,
    partyMode,
    entryWaitMode,
    roundStageRef,
    roundHeadingRef,
    answerDuration,
    startRun,
    returnToLobby,
    chooseAnswer,
    chooseKeyedAnswer,
    handlePartyWaiting,
    ignorePartyStart,
    submitQuestionReport,
    toggleQuestionReport,
    dismissQuestionReport,
  };
}
