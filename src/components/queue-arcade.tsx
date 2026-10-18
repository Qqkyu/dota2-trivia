"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  AudioWaveform,
  Check,
  ChevronRight,
  Clock3,
  Flag,
  Flame,
  Gauge,
  Gamepad2,
  Gem,
  Keyboard,
  ListOrdered,
  MessageSquareQuote,
  Radio,
  ShoppingBag,
  Signal,
  ScanEye,
  Swords,
  Users,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  isReportReason,
  QUESTION_REPORT_GRACE_MS,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type ReportReason,
} from "@/lib/calibration";
import type { AccountSnapshot } from "@/lib/account-contract";
import type { RoundGame } from "@/lib/trivia";
import type {
  CrowdResult,
  PlayerIdentity,
  PublicRoomSettings,
  ReportResult,
  RoomSnapshot,
} from "@/lib/arcade-contract";
import {
  applyGuestLifetimeStats,
  guestPendingRoundIds,
  forgetGuestPendingVote,
  readGuestLifetimeStats,
  reconcileGuestRunBest,
  markGuestRoundSettled,
  rememberGuestPendingVote,
} from "@/lib/guest-accuracy.mjs";
import { safeBrowserStorage } from "@/lib/browser-storage.mjs";
import { updateGuestLifetimeStorage, loadGuestLifetimeStats } from "@/lib/guest-lifetime-storage.mjs";
import { shouldHandleAnswerShortcut } from "@/lib/answer-shortcuts.mjs";
import { requestWithRetry } from "@/lib/request-retry.mjs";
import { playerIdentityKey, samePlayerIdentity } from "@/lib/player-identity";
import { reconcileSessionResult, sessionResultTotals, type SessionRoundResult } from "@/lib/session-results";
import { LIVE_ROUND_GAMES, PUBLIC_ARCADE_MODE } from "@/lib/arcade-games.mjs";
import { PrivateRoomPanel } from "@/components/private-room-panel";
import { LIVE_ROUND_HEADER_LABELS } from "@/lib/round-question-copy.mjs";
import type { FormatPreview } from "@/components/format-look";
import { shouldShowEntryWaitLessons, shouldWaitForNextRoundOnEntry } from "@/lib/arcade-entry.mjs";
import { ENTRY_WAIT_HINT } from "@/lib/entry-wait-tips.mjs";
import { isFlashbackOrderAnswerForQuestion, isFlashbackYearAnswerInRange } from "@/lib/flashback.mjs";
import {
  ARCADE_LOBBY_PATH,
  PARTY_ARCADE_PATH,
  PUBLIC_ARCADE_PATH,
  arcadeViewForPathname,
} from "@/lib/arcade-navigation.mjs";
import { DEFAULT_GAME_ID, type PublicGameInfo } from "@/lib/game-identity";
import { answerFeedbackKind } from "@/lib/feedback-sounds.mjs";
import { createFeedbackPlayer } from "@/lib/feedback-player.mjs";
import { claimAudioTab } from "@/lib/audio-tab.mjs";
import { revealCallout, streakBannerParts } from "@/lib/dota-flavor.mjs";
import { preventQuestionClipboard, shouldBlockQuestionClipboard } from "@/lib/question-guard.mjs";
import { FALLBACK_STEAM_DISPLAY_NAME } from "@/lib/steam-profile.mjs";
import { HERO_PICKER_HEROES, heroPickerPortraitSrc, isHeroCatalogKey } from "@/lib/hero-picker";
import { clueStageAt, crowdScoreMultiplier, scoreBreakdown } from "@/lib/scoring.mjs";
import {
  isRecipeAnswerKey,
  isShopkeeperCatalogKey,
  recipeItemsFromAnswerKey,
  SHOPKEEPER_CATALOG_BY_KEY,
} from "@/lib/shopkeeper-catalog";
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
import {
  ECHO_HUNT_REVEAL_STAGES,
  SOUNDCHECK_REVEAL_STAGES,
  echoHuntCutDuration,
  echoHuntRevealStage,
  soundcheckCutDuration,
  soundcheckRevealStage,
} from "@/lib/soundcheck.mjs";
import { isValueOrderAnswerForQuestion } from "@/lib/value-order.mjs";
import { PUBLIC_VOTE_ACCEPT_GRACE_MS } from "@/lib/round-timing.mjs";
import {
  createRoomSyncGate,
  ROOM_SYNC_HEARTBEAT_MS,
  roomDeadlineSyncDelay,
  roomProgressiveClueSyncDeadline,
} from "@/lib/room-sync.mjs";
import { SteamAvatar } from "./steam-avatar";
import { SteamSignIn } from "./steam-sign-in";
import styles from "./queue-arcade.module.css";
import { QuestionArtwork, AnswerArtwork } from "./arcade/artwork";
import { ChoiceCrowdSplit, KeyedCrowdSplit } from "./arcade/crowd-split";
import { EntryWaitLessons } from "./arcade/entry-wait-lessons";
import { FlashbackOrderBoard, FlashbackYearBoard } from "./arcade/flashback-boards";
import { HERO_ATTRIBUTE_ICONS, HeroPicker } from "./arcade/hero-picker";
import { BrandMark, ModeIcon } from "./arcade/mode-icon";
import { normalizeRoomSnapshot, normalizeVoteResult, publicRoomQuery } from "./arcade/room-snapshot";
import {
  audioUrlStage,
  roundAudioSourceKey,
  waitForAudioCut,
  waitForAudioGap,
  waitForMediaEvent,
} from "./arcade/round-audio";
import {
  accuracy,
  ANSWER_DURATION_MS,
  classicQuestionContext,
  DEFAULT_GAME_VOLUME,
  EMPTY_CROWD,
  EMPTY_STATS,
  gameLabel,
  keyedAnswerLabel,
  LEGACY_SETTINGS_KEY,
  LEGACY_STORAGE_KEY,
  LETTERS,
  MIN_GAME_VOLUME,
  MODE_INFO,
  PLAYER_KEY,
  PREVIEW_QUESTION,
  PREVIOUS_SETTINGS_KEY,
  REVEAL_DURATION_MS,
  ROUND_GAMES,
  SETTINGS_KEY,
  shopkeeperAnswerAction,
  STORAGE_KEY,
  withPlayerId,
  type GamePhase,
  type LifetimeStats,
  type QuestionReportNotice,
  type QuestionReportTarget,
  type RoundAward,
  type RoundRecord,
} from "./arcade/shared";
import { ShopkeeperTray } from "./arcade/shopkeeper-parts";
import { ShopkeeperStore } from "./arcade/shopkeeper-store";
import { ValueOrderBoard } from "./arcade/value-order-board";

export function QueueArcade({
  autoStart = false,
  partyStart = false,
  roomCode,
  gameInfo,
  formatPreviews = {},
}: {
  autoStart?: boolean;
  partyStart?: boolean;
  roomCode?: string;
  gameInfo: PublicGameInfo;
  formatPreviews?: Record<string, FormatPreview | null | undefined>;
}) {
  const [phase, setPhaseState] = useState<GamePhase>("lobby");
  const [currentQuestion, setCurrentQuestion] = useState<PublicArcadeQuestion | null>(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectedAnswerKey, setSelectedAnswerKey] = useState<string | null>(null);
  const [answerTimeLeft, setAnswerTimeLeft] = useState(0);
  const [crowd, setCrowdState] = useState<CrowdResult>(EMPTY_CROWD);
  const [roundAward, setRoundAward] = useState<RoundAward | null>(null);
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [streak, setStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [history, setHistory] = useState<RoundRecord[]>([]);
  const [deadline, setDeadlineState] = useState<number | null>(null);
  const [revealDeadline, setRevealDeadlineState] = useState<number | null>(null);
  const [entryWaitDeadline, setEntryWaitDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [gameVolume, setGameVolume] = useState(DEFAULT_GAME_VOLUME);
  const [lifetimeStats, setLifetimeStats] = useState<LifetimeStats>(EMPTY_STATS);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const accountRef = useRef<AccountSnapshot | null>(null);
  const accountRequestRef = useRef<AbortController | null>(null);
  const playerIdentityRef = useRef<PlayerIdentity | null>(null);
  const identityGenerationRef = useRef(0);
  const joiningRoomRef = useRef(false);
  const entryRequestRef = useRef<AbortController | null>(null);
  const sessionResultsRef = useRef<SessionRoundResult[]>([]);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState("");
  const [activeRoundId, setActiveRoundId] = useState("");
  const [roundAnnouncement, setRoundAnnouncement] = useState<{ id: string; text: string } | null>(null);
  const [activePlayers, setActivePlayers] = useState(0);
  const [roundAudioState, setRoundAudioState] = useState<"loading" | "ready" | "playing" | "error" | "blocked">(
    "loading",
  );
  const [roundAudioPlayCount, setRoundAudioPlayCount] = useState(0);
  const [roundAudioClipIndex, setRoundAudioClipIndex] = useState(0);
  const [roundAudioDurations, setRoundAudioDurations] = useState<Record<string, number>>({});
  const [reportState, setReportState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [reportedReason, setReportedReason] = useState<ReportReason | null>(null);
  const [reportTarget, setReportTarget] = useState<QuestionReportTarget | null>(null);
  const [reportNotice, setReportNotice] = useState<QuestionReportNotice | null>(null);
  const [privateWaiting, setPrivateWaiting] = useState(Boolean(roomCode));
  const [partyOpen, setPartyOpen] = useState(Boolean(roomCode) || partyStart);
  const [activePrivateCode, setActivePrivateCode] = useState(roomCode ?? "");
  const [partyInviteCode, setPartyInviteCode] = useState(roomCode ?? "");
  const privateCodeRef = useRef(roomCode ?? "");
  const partyMode = partyOpen || privateWaiting;

  const phaseRef = useRef<GamePhase>("lobby");
  const currentQuestionRef = useRef<PublicArcadeQuestion | null>(null);
  const roundIndexRef = useRef(0);
  const selectedIndexRef = useRef<number | null>(null);
  const selectedAnswerKeyRef = useRef<string | null>(null);
  const answerTimeLeftRef = useRef(0);
  const crowdRef = useRef<CrowdResult>(EMPTY_CROWD);
  const deadlineRef = useRef<number | null>(null);
  const finalizedRef = useRef(false);
  const voteRequestSettledRef = useRef(false);
  const participatedRef = useRef(false);
  const runSavedRef = useRef(false);
  const playerIdRef = useRef("");
  const roomSettingsRef = useRef<PublicRoomSettings | null>(null);
  const roomSnapshotRef = useRef<RoomSnapshot | null>(null);
  const roundIdRef = useRef("");
  const roundStageRef = useRef<HTMLDivElement | null>(null);
  const roundHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const lastRoundControlRef = useRef<HTMLElement | null>(null);
  const announcedRoundRef = useRef<string | null>(null);
  const scrollToRoundRef = useRef<string | null>(null);
  const questionRevisionRef = useRef("");
  const entryWaitRoundIdRef = useRef("");
  const entryWaitModeRef = useRef<"lessons" | "silent" | null>(null);
  const [entryWaitMode, setEntryWaitMode] = useState<"lessons" | "silent" | null>(null);
  const roomSyncGateRef = useRef<ReturnType<typeof createRoomSyncGate> | null>(null);
  const feedbackPlayerRef = useRef<ReturnType<typeof createFeedbackPlayer> | null>(null);
  const audioTabRef = useRef<ReturnType<typeof claimAudioTab> | null>(null);
  const roundAudioRefs = useRef<Array<HTMLAudioElement | null>>([]);
  const roundAudioAbortRef = useRef<AbortController | null>(null);
  const autoPlayedAudioKeyRef = useRef("");
  const prewarmedAfterRoundIdRef = useRef("");
  const reportTargetRef = useRef<QuestionReportTarget | null>(null);
  const reportFocusRef = useRef<string | null>(null);
  const reportStateRef = useRef<"idle" | "sending" | "sent" | "error">("idle");
  const autoStartAttemptedRef = useRef(false);
  const alphaSessionIdRef = useRef("");
  const alphaSessionFinishedRef = useRef(false);
  const heroPreloadsRef = useRef<HTMLImageElement[]>([]);

  if (roomSyncGateRef.current === null) roomSyncGateRef.current = createRoomSyncGate();

  useEffect(() => {
    const sources = [
      ...Object.values(HERO_ATTRIBUTE_ICONS),
      ...HERO_PICKER_HEROES.map((hero) => heroPickerPortraitSrc(hero.image)),
    ];
    heroPreloadsRef.current = sources.map((src) => {
      const image = new window.Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.src = src;
      return image;
    });

    return () => {
      heroPreloadsRef.current = [];
    };
  }, []);

  const updateReportTarget = useCallback((target: QuestionReportTarget | null) => {
    reportTargetRef.current = target;
    setReportTarget(target);
  }, []);

  const updateReportState = useCallback((state: "idle" | "sending" | "sent" | "error") => {
    reportStateRef.current = state;
    setReportState(state);
  }, []);

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

  const ensurePlayerId = useCallback(() => {
    if (playerIdRef.current) return playerIdRef.current;

    const tabKey = `${PLAYER_KEY}:tab`;
    const stored = safeBrowserStorage("session").getItem(tabKey);
    const id = stored ?? window.crypto.randomUUID();
    safeBrowserStorage("session").setItem(tabKey, id);
    playerIdRef.current = id;
    return id;
  }, []);

  const resultVoterId = useCallback(() => {
    const known = playerIdentityKey(playerIdentityRef.current);
    if (known) return known;
    const current = accountRef.current;
    return current?.authenticated ? `account:${current.profile.user.id}` : ensurePlayerId();
  }, [ensurePlayerId]);

  const sendAlphaSessionEvent = useCallback(
    async (action: "start" | "finish", sessionId: string) => {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: action === "finish",
        body: JSON.stringify({ action, sessionId, voterId: ensurePlayerId() }),
      });
      if (!response.ok) throw new Error("Alpha session unavailable.");
    },
    [ensurePlayerId],
  );

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

  const finishAlphaSession = useCallback(() => {
    const sessionId = alphaSessionIdRef.current;
    if (!sessionId || alphaSessionFinishedRef.current) return;
    alphaSessionFinishedRef.current = true;
    void sendAlphaSessionEvent("finish", sessionId).catch(() => undefined);
  }, [sendAlphaSessionEvent]);

  const playSound = useCallback(
    (kind: "lock" | "correct" | "wrong" | "start") => {
      if (kind === "lock") audioTabRef.current?.claimFromInput();
      feedbackPlayerRef.current?.play(kind, { enabled: soundEnabled, volume: gameVolume });
    },
    [gameVolume, soundEnabled],
  );

  const playPickSound = useCallback(() => playSound("lock"), [playSound]);

  const stopRoundAudio = useCallback((showReadyState = true) => {
    roundAudioAbortRef.current?.abort();
    roundAudioAbortRef.current = null;
    for (const audio of roundAudioRefs.current) audio?.pause();
    if (showReadyState && phaseRef.current === "answering") setRoundAudioState("ready");
  }, []);

  useEffect(() => {
    const tab = claimAudioTab(() => {
      feedbackPlayerRef.current?.pauseAll();
      stopRoundAudio();
    });
    audioTabRef.current = tab;
    const player = createFeedbackPlayer({ isOwner: tab.isOwner });
    feedbackPlayerRef.current = player;
    return () => {
      player.pauseAll();
      tab.dispose();
      feedbackPlayerRef.current = null;
      audioTabRef.current = null;
    };
  }, [stopRoundAudio]);

  const playRoundAudio = useCallback(
    (enableSound = true, revealStage = 1) => {
      if (!audioTabRef.current?.isOwner()) return;
      stopRoundAudio(false);
      const audios = roundAudioRefs.current.filter((audio): audio is HTMLAudioElement => Boolean(audio));
      if (!audios.length) return;

      const question = currentQuestionRef.current;
      const isSoundcheck = question?.game === "soundcheck";
      const isEchoHunt = question?.game === "echo-hunt";
      const isProgressiveAudio = isSoundcheck || isEchoHunt;
      if (enableSound) setSoundEnabled(true);
      const sourceKey = roundAudioSourceKey(question);
      autoPlayedAudioKeyRef.current = isProgressiveAudio
        ? `${roundIdRef.current}:${revealStage}:${sourceKey}`
        : roundIdRef.current;
      const controller = new AbortController();
      roundAudioAbortRef.current = controller;
      setRoundAudioClipIndex(0);
      setRoundAudioState("loading");

      void (async () => {
        for (const [clipIndex, audio] of audios.entries()) {
          audio.volume = gameVolume;
          audio.currentTime = 0;
          if (audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            const readyResult = await waitForMediaEvent(audio, "canplay", controller.signal);
            if (readyResult !== "complete") {
              if (readyResult === "error") setRoundAudioState("error");
              return;
            }
          }
          if (controller.signal.aborted) return;

          setRoundAudioClipIndex(clipIndex);
          setRoundAudioState("playing");
          try {
            await audio.play();
          } catch (error) {
            if (!controller.signal.aborted) {
              setRoundAudioState(
                error instanceof DOMException && error.name === "NotAllowedError" ? "blocked" : "error",
              );
            }
            return;
          }
          if (clipIndex === 0) setRoundAudioPlayCount((count) => count + 1);

          const sourceAlreadyCut = sourceKey.includes("stage=");
          const sourceDuration = isSoundcheck
            ? question?.soundcheck?.clips[clipIndex]?.duration
            : Number.isFinite(audio.duration)
              ? audio.duration
              : 5;
          const clipDuration = sourceAlreadyCut
            ? 0
            : isSoundcheck
              ? soundcheckCutDuration(sourceDuration ?? 0, revealStage)
              : isEchoHunt
                ? echoHuntCutDuration(sourceDuration ?? 0, revealStage)
                : 0;
          const endedResult =
            isProgressiveAudio && clipDuration
              ? await waitForAudioCut(audio, clipDuration * 1_000, controller.signal)
              : await waitForMediaEvent(audio, "ended", controller.signal);
          if (endedResult !== "complete") {
            if (endedResult === "error") setRoundAudioState("error");
            return;
          }
          if (clipIndex < audios.length - 1 && !(await waitForAudioGap(controller.signal))) return;
        }

        if (!controller.signal.aborted) {
          roundAudioAbortRef.current = null;
          setRoundAudioState("ready");
        }
      })();
    },
    [gameVolume, stopRoundAudio],
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

  const submitQuestionReport = useCallback(
    async (reason: ReportReason) => {
      const target = reportTargetRef.current;
      const settings = roomSettingsRef.current;
      if (!target || !settings || reportStateRef.current === "sending") return;

      const reportIdentityGeneration = identityGenerationRef.current;
      updateReportState("sending");

      try {
        const response = await fetch("/api/reports", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...settings,
            roundId: target.roundId,
            reason,
            voterId: ensurePlayerId(),
          }),
        });
        const payload: unknown = await response.json();
        if (!response.ok || !payload || typeof payload !== "object") throw new Error("REPORT_FAILED");

        const candidate = payload as Partial<ReportResult>;
        if (typeof candidate.accepted !== "boolean" || !isReportReason(candidate.reason)) {
          throw new Error("REPORT_FAILED");
        }

        if (
          reportTargetRef.current?.roundId !== target.roundId ||
          reportIdentityGeneration !== identityGenerationRef.current
        )
          return;

        if (roundIdRef.current === target.roundId) {
          setReportedReason(candidate.reason);
          updateReportState("sent");
        } else {
          const currentReport = roomSnapshotRef.current?.playerReport ?? null;
          setReportedReason(currentReport);
          updateReportState(currentReport ? "sent" : "idle");
        }
        updateReportTarget(null);
        setReportNotice({
          reason: candidate.reason,
          expiresAt: Date.now() + 5_000,
        });
      } catch {
        if (
          reportTargetRef.current?.roundId === target.roundId &&
          reportIdentityGeneration === identityGenerationRef.current
        ) {
          updateReportState("error");
        }
      }
    },
    [ensurePlayerId, updateReportState, updateReportTarget],
  );

  const toggleQuestionReport = useCallback(() => {
    const snapshot = roomSnapshotRef.current;
    const question = currentQuestionRef.current;
    const existingTarget = reportTargetRef.current;

    if (existingTarget?.roundId === snapshot?.round.id) {
      updateReportTarget(null);
      updateReportState("idle");
      return;
    }

    if (
      phaseRef.current !== "reveal" ||
      !snapshot ||
      !question ||
      snapshot.round.phase !== "reveal" ||
      snapshot.round.id !== roundIdRef.current
    ) {
      return;
    }

    updateReportState("idle");
    updateReportTarget({
      roundId: snapshot.round.id,
      prompt: question.prompt,
      answer: question.reveal?.correctAnswerKey
        ? keyedAnswerLabel(question.reveal.correctAnswerKey, question.eyebrow, question)
        : (question.answers[publicCorrectIndex(question)] ?? question.eyebrow),
      expiresAt: Math.max(Date.now() + 1_000, (revealDeadline ?? Date.now()) + QUESTION_REPORT_GRACE_MS),
    });
  }, [revealDeadline, updateReportState, updateReportTarget]);

  const dismissQuestionReport = useCallback(() => {
    updateReportTarget(null);
    const currentReport = roomSnapshotRef.current?.playerReport ?? null;
    setReportedReason(currentReport);
    updateReportState(currentReport ? "sent" : "idle");
  }, [updateReportState, updateReportTarget]);

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

  useEffect(() => {
    if (!reportTarget) return;
    const timeout = window.setTimeout(
      () => {
        if (reportTargetRef.current?.roundId !== reportTarget.roundId) return;
        updateReportTarget(null);
        const currentReport = roomSnapshotRef.current?.playerReport ?? null;
        setReportedReason(currentReport);
        updateReportState(currentReport ? "sent" : "idle");
      },
      Math.max(0, reportTarget.expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [reportTarget, updateReportState, updateReportTarget]);

  useEffect(() => {
    const rememberControl = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target === document.body) return;
      lastRoundControlRef.current =
        roundStageRef.current?.contains(target) && target.matches("button, input, select, textarea") ? target : null;
    };
    const clearOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !roundStageRef.current?.contains(event.target))
        lastRoundControlRef.current = null;
    };
    document.addEventListener("focusin", rememberControl);
    document.addEventListener("pointerdown", clearOutsideClick);
    return () => {
      document.removeEventListener("focusin", rememberControl);
      document.removeEventListener("pointerdown", clearOutsideClick);
    };
  }, []);

  useEffect(() => {
    if (phase === "lobby" || phase === "waiting") {
      announcedRoundRef.current = null;
      return;
    }
    if (phase !== "answering" || !currentQuestion || currentQuestion.id !== activeRoundId) return;
    if (announcedRoundRef.current === activeRoundId) return;
    announcedRoundRef.current = activeRoundId;
    setRoundAnnouncement({ id: activeRoundId, text: `Round ${roundIndex + 1}. ${currentQuestion.prompt}` });
  }, [activeRoundId, currentQuestion, phase, roundIndex]);

  useEffect(() => {
    if (phase !== "answering" || currentQuestion?.id !== activeRoundId || scrollToRoundRef.current !== activeRoundId)
      return;
    scrollToRoundRef.current = null;
    const focused = document.activeElement;
    if (
      focused instanceof HTMLElement &&
      (focused.closest('[data-testid="private-room-play-dock"], [data-testid="report-carryover"]') ||
        (focused.matches('input, textarea, select, [contenteditable="true"]') &&
          !roundStageRef.current?.contains(focused)))
    )
      return;
    if (reportFocusRef.current) return;
    const previousControl = lastRoundControlRef.current;
    if (
      focused === document.body &&
      previousControl &&
      (!previousControl.isConnected || previousControl.matches(":disabled"))
    ) {
      lastRoundControlRef.current = null;
      roundHeadingRef.current?.focus({ preventScroll: true });
    }
    const stage = roundStageRef.current;
    const prompt = stage?.querySelector<HTMLElement>('[data-testid="round-prompt"] h2');
    const timer = stage?.querySelector<HTMLElement>('[data-testid="round-timer"]');
    if (!stage || !prompt || !timer) return;
    const promptBounds = prompt.getBoundingClientRect();
    const timerBounds = timer.getBoundingClientRect();
    if (promptBounds.top < timerBounds.bottom || promptBounds.bottom > window.innerHeight || timerBounds.top < 0) {
      stage.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
    }
  }, [activeRoundId, currentQuestion?.id, phase]);

  useEffect(() => {
    const reason = reportFocusRef.current;
    if (!reason) return;
    const button = document.querySelector<HTMLButtonElement>(
      `[data-testid="report-carryover"] [data-report-reason="${reason}"]`,
    );
    if (button) {
      reportFocusRef.current = null;
      button.focus({ preventScroll: true });
    }
  }, [activeRoundId, reportTarget]);

  useEffect(() => {
    if (!reportNotice) return;
    const timeout = window.setTimeout(
      () => setReportNotice((notice) => (notice?.expiresAt === reportNotice.expiresAt ? null : notice)),
      Math.max(0, reportNotice.expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [reportNotice]);

  useEffect(() => {
    if (phase === "lobby") return;
    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    const replayHiddenResult = () => {
      if (document.visibilityState === "visible") feedbackPlayerRef.current?.resumeIfNeeded();
    };
    document.addEventListener("visibilitychange", replayHiddenResult);
    window.addEventListener("focus", replayHiddenResult);
    window.addEventListener("pointerdown", replayHiddenResult);
    window.addEventListener("keydown", replayHiddenResult);
    return () => {
      document.removeEventListener("visibilitychange", replayHiddenResult);
      window.removeEventListener("focus", replayHiddenResult);
      window.removeEventListener("pointerdown", replayHiddenResult);
      window.removeEventListener("keydown", replayHiddenResult);
    };
  }, []);

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
        }
      } catch {
        // Presence is decorative; room entry must stay independent from it.
      }
    };
    void loadPresence();
    const interval = window.setInterval(() => void loadPresence(), 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [phase]);

  useEffect(() => {
    const handlePageHide = () => finishAlphaSession();
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [finishAlphaSession]);

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

    const timeout = window.setTimeout(() => {
      setNow(Date.now());
      void syncRoom(true);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [answerDuration, currentQuestion, deadline, entryWaitDeadline, phase, revealDeadline, syncRoom]);

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

  useEffect(() => {
    const hydration = window.setTimeout(async () => {
      try {
        const storedStats =
          safeBrowserStorage("local").getItem(STORAGE_KEY) ?? safeBrowserStorage("local").getItem(LEGACY_STORAGE_KEY);
        const currentSettings = safeBrowserStorage("local").getItem(SETTINGS_KEY);
        const storedSettings =
          currentSettings ??
          safeBrowserStorage("local").getItem(PREVIOUS_SETTINGS_KEY) ??
          safeBrowserStorage("local").getItem(LEGACY_SETTINGS_KEY);
        if (storedStats) {
          const storage = safeBrowserStorage("local");
          const statsKey = storage.getItem(STORAGE_KEY) === null ? LEGACY_STORAGE_KEY : STORAGE_KEY;
          const loaded = readGuestLifetimeStats(storage, statsKey);
          if (statsKey === LEGACY_STORAGE_KEY) storage.setItem(STORAGE_KEY, JSON.stringify(loaded));
          setLifetimeStats(loaded);
        }
        if (storedSettings) {
          const settings = JSON.parse(storedSettings) as {
            soundEnabled?: boolean;
            gameVolume?: number;
          };
          if (typeof settings.soundEnabled === "boolean") setSoundEnabled(settings.soundEnabled);
          if (typeof settings.gameVolume === "number" && Number.isFinite(settings.gameVolume)) {
            const stored = Math.min(1, Math.max(MIN_GAME_VOLUME, settings.gameVolume));
            const fromInaudibleDefault = !currentSettings && stored <= 0.1;
            setGameVolume(fromInaudibleDefault ? DEFAULT_GAME_VOLUME : stored);
          }
        }
        ensurePlayerId();
        const { value, current } = await loadGuestLifetimeStats(safeBrowserStorage("local"));
        if (current) setLifetimeStats(value);
      } catch {
        // Corrupt local data should never stop a round from starting.
      } finally {
        setStatsLoaded(true);
      }
    }, 0);

    return () => window.clearTimeout(hydration);
  }, [ensurePlayerId]);

  useEffect(() => {
    const refreshLifetime = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        void loadGuestLifetimeStats(safeBrowserStorage("local")).then(({ value, current }) => {
          if (current) setLifetimeStats(value);
        });
      }
    };
    window.addEventListener("storage", refreshLifetime);
    return () => window.removeEventListener("storage", refreshLifetime);
  }, []);

  useEffect(() => {
    if (!statsLoaded) return;
    safeBrowserStorage("local").setItem(SETTINGS_KEY, JSON.stringify({ soundEnabled, gameVolume }));
  }, [gameVolume, soundEnabled, statsLoaded]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shouldHandleAnswerShortcut(event)) return;

      if (phaseRef.current === "answering") {
        if (currentQuestionRef.current && isPublicKeyedAnswerQuestion(currentQuestionRef.current)) return;
        const keyMap: Record<string, number> = {
          "1": 0,
          a: 0,
          "2": 1,
          b: 1,
          "3": 2,
          c: 2,
          "4": 3,
          d: 3,
        };
        const answerIndex = keyMap[event.key.toLowerCase()];
        if (answerIndex !== undefined) {
          event.preventDefault();
          chooseAnswer(answerIndex);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [chooseAnswer]);

  useEffect(() => {
    if (phase !== "answering") stopRoundAudio(false);
  }, [phase, stopRoundAudio]);

  useEffect(() => {
    if (!shouldBlockQuestionClipboard(phase)) return;
    const block = (event: ClipboardEvent) => preventQuestionClipboard(event);
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    return () => {
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
    };
  }, [phase]);

  useEffect(
    () => () => {
      feedbackPlayerRef.current?.pauseAll();
      stopRoundAudio(false);
    },
    [stopRoundAudio],
  );

  const answerRemaining = deadline ? Math.max(0, deadline - now) : 0;
  const revealRemaining = revealDeadline ? Math.max(0, revealDeadline - now) : 0;
  const entryWaitRemaining = entryWaitDeadline ? Math.max(0, entryWaitDeadline - now) : 0;
  const timerRatio = phase === "answering" ? answerRemaining / answerDuration : revealRemaining / REVEAL_DURATION_MS;
  const selectedWasCorrect =
    selectedIndex !== null && currentQuestion
      ? isPublicQuestionAnswerCorrect(currentQuestion, selectedIndex, selectedAnswerKey ?? undefined)
      : false;
  const resultCallout = revealCallout({
    correct: selectedWasCorrect,
    timedOut: selectedIndex === null,
    firstBlood: false,
    streak: 0,
  });
  const streakCallout = revealCallout({
    correct: selectedWasCorrect,
    timedOut: selectedIndex === null,
    firstBlood: selectedWasCorrect && correctCount === 1,
    streak,
  });
  const isKillStreakCallout =
    streakCallout !== "Correct" && streakCallout !== "Incorrect" && streakCallout !== "Time expired";
  const streakPlayerName =
    account?.authenticated && account.profile.user.displayName !== FALLBACK_STEAM_DISPLAY_NAME
      ? account.profile.user.displayName
      : "";
  const streakBanner = isKillStreakCallout ? streakBannerParts(streakCallout, streakPlayerName) : null;
  const currentGame = currentQuestion?.game ?? "trivia";
  const isRecipeBuilderRound = Boolean(currentQuestion && isPublicRecipeBuilderQuestion(currentQuestion));
  const isOpenShopRound = Boolean(
    currentQuestion && (isPublicBuildResultQuestion(currentQuestion) || isPublicRecipeBuilderQuestion(currentQuestion)),
  );
  const isHeroPickerRound = Boolean(currentQuestion && isPublicHeroPickerQuestion(currentQuestion));
  const isValueOrderRound = Boolean(currentQuestion && isPublicValueOrderQuestion(currentQuestion));
  const isFlashbackOrderRound = Boolean(currentQuestion && isPublicFlashbackOrderQuestion(currentQuestion));
  const isFlashbackYearRound = Boolean(
    currentQuestion && (isPublicFlashbackYearQuestion(currentQuestion) || currentQuestion.flashback?.family === "year"),
  );
  const isSoundcheckRound = currentGame === "soundcheck";
  const isEchoHuntRound = currentGame === "echo-hunt";
  const isProgressiveAudioRound = isSoundcheckRound || isEchoHuntRound;
  const isSoundSequence = isSoundcheckRound && currentQuestion?.soundcheck?.format === "sequence";
  const clueStage =
    phase === "reveal"
      ? 3
      : currentGame === "spell-link" || currentGame === "quote-hunt" || currentGame === "aghanim-lab"
        ? (currentQuestion?.clueStage ?? 1)
        : isSoundcheckRound
          ? soundcheckRevealStage(answerRemaining, answerDuration)
          : isEchoHuntRound
            ? echoHuntRevealStage(answerRemaining, answerDuration)
            : clueStageAt(answerRemaining, answerDuration);
  const firstClueAt = Math.round((answerDuration * 2) / 3_000);
  const finalClueAt = Math.round(answerDuration / 3_000);
  const liveAward = currentQuestion
    ? scoreBreakdown(currentQuestion, selectedIndex === null ? answerRemaining : answerTimeLeft, answerDuration)
    : null;
  const recentHistory = history.slice(phase === "answering" ? -9 : -10);
  const recentHistoryStart = history.length - recentHistory.length + 1;
  const spellHint = currentQuestion?.hint ?? "";
  const activeModeInfo = MODE_INFO[PUBLIC_ARCADE_MODE];
  const aghanimUpgradeLabel =
    currentQuestion?.aghanim?.upgradeType === "scepter"
      ? "Aghanim's Scepter"
      : currentQuestion?.aghanim?.upgradeType === "shard"
        ? "Aghanim's Shard"
        : null;
  const aghanimItem = aghanimUpgradeLabel
    ? SHOPKEEPER_CATALOG_BY_KEY.get(
        currentQuestion?.aghanim?.upgradeType === "scepter" ? "ultimate_scepter" : "aghanims_shard",
      )
    : null;

  useEffect(() => {
    const hasRoundAudio = isProgressiveAudioRound;
    const sourceKey = roundAudioSourceKey(currentQuestion);
    const autoplayKey = isProgressiveAudioRound ? `${activeRoundId}:${clueStage}:${sourceKey}` : activeRoundId;
    const srcStage = audioUrlStage(currentQuestion?.audio?.src ?? currentQuestion?.audio?.clips?.[0]);
    if (
      phase !== "answering" ||
      !hasRoundAudio ||
      !currentQuestion?.audio ||
      !soundEnabled ||
      !roundAudioRefs.current.some(Boolean) ||
      (srcStage !== null && srcStage !== clueStage) ||
      autoPlayedAudioKeyRef.current === autoplayKey
    ) {
      return;
    }

    playRoundAudio(false, isProgressiveAudioRound ? clueStage : 1);
  }, [
    activeRoundId,
    clueStage,
    currentQuestion,
    currentQuestion?.audio,
    currentQuestion?.game,
    currentQuestion?.id,
    isProgressiveAudioRound,
    isSoundcheckRound,
    phase,
    playRoundAudio,
    soundEnabled,
  ]);

  useEffect(() => {
    if (phase !== "answering" || roundAudioState !== "blocked") return;
    const retry = () => playRoundAudio(false, isProgressiveAudioRound ? clueStage : 1);
    window.addEventListener("pointerdown", retry, { once: true });
    window.addEventListener("keydown", retry, { once: true });
    return () => {
      window.removeEventListener("pointerdown", retry);
      window.removeEventListener("keydown", retry);
    };
  }, [clueStage, isProgressiveAudioRound, phase, playRoundAudio, roundAudioState]);

  return (
    <main
      className={styles.shell}
      data-phase={phase}
      data-party={partyMode || activePrivateCode ? "true" : undefined}
      data-party-play={activePrivateCode && phase !== "lobby" ? "true" : undefined}
      data-client-ready={statsLoaded}
      data-account-ready={account !== null}
      data-room-id={activeRoomId || undefined}
      data-round-id={activeRoundId || undefined}
      data-question-kind={currentQuestion?.kind}
    >
      <div className="sr-only" data-testid="round-announcement" aria-live="polite" aria-atomic="true">
        {phase !== "lobby" && phase !== "waiting" && roundAnnouncement?.id === activeRoundId
          ? roundAnnouncement.text
          : ""}
      </div>
      <div className={styles.backdrop} aria-hidden="true">
        <span className={styles.backdropOrbOne} />
        <span className={styles.backdropOrbTwo} />
        <span className={styles.gridTexture} />
      </div>

      <header className={styles.header}>
        <a
          href={ARCADE_LOBBY_PATH}
          className={styles.brand}
          aria-label="Queue Arcade home"
          data-testid="site-home"
          onClick={(event) => {
            event.preventDefault();
            returnToLobby("push");
          }}
        >
          <BrandMark logoUrl={gameInfo.logoUrl} />
          <span>
            <strong>Queue Arcade</strong>
            <small>Side quests, between matches</small>
          </span>
        </a>

        <div className={styles.headerMeta}>
          <span className={styles.patchBadge}>
            {gameInfo.label} · {gameInfo.contentLabel}
          </span>
          <div className={styles.volumeControl} data-muted={!soundEnabled}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => {
                if (soundEnabled) {
                  stopRoundAudio();
                  feedbackPlayerRef.current?.pauseAll();
                }
                setSoundEnabled(!soundEnabled);
              }}
              aria-label={soundEnabled ? "Mute game sounds" : "Enable game sounds"}
              aria-pressed={soundEnabled}
            >
              {soundEnabled ? <Volume2 /> : <VolumeX />}
            </button>
            <input
              className={styles.volumeSlider}
              data-testid="game-volume"
              type="range"
              min={MIN_GAME_VOLUME * 100}
              max="100"
              step="5"
              value={Math.round(gameVolume * 100)}
              onChange={(event) => {
                const nextVolume = Number(event.currentTarget.value) / 100;
                document
                  .querySelectorAll<HTMLAudioElement>('audio[data-testid="round-audio-clip"]')
                  .forEach((audio) => {
                    audio.volume = nextVolume;
                  });
                feedbackPlayerRef.current?.preload();
                feedbackPlayerRef.current?.setVolume(nextVolume);
                setGameVolume(nextVolume);
                setSoundEnabled(true);
              }}
              aria-label="Game volume"
              aria-valuetext={`${Math.round(gameVolume * 100)} percent`}
            />
            <output className={styles.volumeValue}>{Math.round(gameVolume * 100)}%</output>
          </div>
        </div>
      </header>

      {(phase === "lobby" || (phase === "waiting" && entryWaitMode === "silent")) && !partyMode && (
        <section className={styles.lobby} id="arcade">
          <div className={styles.lobbyCopy}>
            <div className={styles.liveLabel}>
              <span />
              {activePlayers > 0
                ? `${activePlayers.toLocaleString("en-US")} playing now · Ten games`
                : "One public room · Ten games"}
            </div>
            <h1>
              Your queue has
              <br />
              <em>side quests.</em>
            </h1>
            <p className={styles.lead}>
              A Dota arcade built for the gap between Find Match and Accept. Everyone plays the same endless rotation;
              the challenge changes every round.
            </p>

            <div className={styles.roundMix} data-testid="round-mix">
              <span className={styles.fieldLabel}>Round mix</span>
              <div className={styles.roundMixRail} role="group" aria-label="Round identities">
                {ROUND_GAMES.map((game) => (
                  <span key={game} data-round-family={game}>
                    <ModeIcon mode={game} />
                    <strong>{MODE_INFO[game].shortLabel}</strong>
                  </span>
                ))}
              </div>
            </div>

            <div className={styles.lobbyActions}>
              <button
                type="button"
                data-testid="start-arcade"
                className={styles.primaryButton}
                onClick={() => {
                  privateCodeRef.current = "";
                  setPartyOpen(false);
                  setPrivateWaiting(false);
                  void startRun(true, "");
                }}
                disabled={phase === "waiting"}
              >
                {phase === "waiting" ? "Joining…" : activeModeInfo.action}
              </button>
              <a
                href={PARTY_ARCADE_PATH}
                className={styles.lobbyFriends}
                data-testid="private-room-open"
                onClick={(event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  returnToLobby("none");
                  privateCodeRef.current = "";
                  setActivePrivateCode("");
                  setPartyInviteCode("");
                  setPrivateWaiting(false);
                  setPartyOpen(true);
                  if (window.location.pathname !== PARTY_ARCADE_PATH) {
                    window.history.pushState({ queueArcadeView: "party" }, "", PARTY_ARCADE_PATH);
                  }
                }}
              >
                Party
              </a>
              <div className={styles.accountActionSlot} data-testid="account-action-slot">
                {account === null ? (
                  <span className={styles.accountLoading} aria-hidden="true" />
                ) : account.authenticated ? (
                  <Link href="/profile" className={styles.profileAction} data-testid="profile-action">
                    <SteamAvatar
                      src={account.profile.user.avatarUrl}
                      name={account.profile.user.displayName}
                      width={34}
                      height={34}
                    />
                    <span>
                      <strong>{account.profile.user.displayName}</strong>
                      <small>{account.profile.stats.accuracy}% accuracy</small>
                    </span>
                  </Link>
                ) : (
                  <SteamSignIn returnTo="/" className={styles.steamSignIn} />
                )}
              </div>
            </div>

            {roomError ? (
              <div className={clsx(styles.roomNotice, styles.roomNoticeError)} role="status">
                <Signal />
                {roomError}
              </div>
            ) : null}

            <div className={styles.featureStrip}>
              <div>
                <strong>{ROUND_GAMES.length}</strong>
                <span>games in the mix</span>
              </div>
              <div>
                <strong>{gameInfo.questionCount}</strong>
                <span>patch-current prompts</span>
              </div>
              <div>
                <strong>2×</strong>
                <span>crowd-breaker bonus</span>
              </div>
              <div>
                <strong>
                  {account?.authenticated
                    ? `${account.profile.stats.accuracy}%`
                    : statsLoaded
                      ? `${accuracy(lifetimeStats.correct, lifetimeStats.answered)}%`
                      : "—"}
                </strong>
                <span>your lifetime accuracy</span>
              </div>
            </div>
          </div>

          <div className={styles.previewColumn}>
            <div className={styles.previewHalo} />
            <div className={styles.previewCard} data-testid="mode-preview">
              <div className={styles.previewHeader}>
                <span>
                  <ModeIcon mode={PUBLIC_ARCADE_MODE} />
                  {activeModeInfo.label}
                </span>
                <strong>00:{String(answerDuration / 1000).padStart(2, "0")}</strong>
              </div>
              <div className={styles.previewQuestion}>
                <QuestionArtwork question={PREVIEW_QUESTION} />
                <span>{activeModeInfo.eyebrow}</span>
                <h2>The next round could be anything.</h2>
                <p>{activeModeInfo.description}</p>
              </div>
              <div className={styles.previewFooter}>
                <Users />
                One synchronized round, deadline, and answer split for everyone
              </div>
            </div>

            <div className={styles.queueToast}>
              <span className={styles.readyIcon}>
                <Gamepad2 />
              </span>
              <span>
                <small>Public room ready</small>
                {activeModeInfo.shortLabel}
              </span>
              <strong>{answerDuration / 1000}s</strong>
            </div>
          </div>
        </section>
      )}

      {(phase === "lobby" || (phase === "waiting" && entryWaitMode === "silent")) && partyMode ? (
        <PrivateRoomPanel
          key={activePrivateCode || "setup"}
          gameOptions={LIVE_ROUND_GAMES.map((game) => ({
            id: game,
            label: LIVE_ROUND_HEADER_LABELS[game as keyof typeof LIVE_ROUND_HEADER_LABELS] ?? game,
            preview: formatPreviews[game] ?? null,
          }))}
          playerId={ensurePlayerId}
          displayName={account?.authenticated ? account.profile.user.displayName : ""}
          initialCode={activePrivateCode || partyInviteCode || undefined}
          playActive={false}
          onWaitingChange={handlePartyWaiting}
          onStarted={(code) => {
            privateCodeRef.current = code;
            setActivePrivateCode(code);
            setPartyInviteCode(code);
            setPrivateWaiting(false);
            void startRun(true, code);
          }}
          onClose={() => {
            setPartyOpen(false);
            setPrivateWaiting(false);
            privateCodeRef.current = "";
            setActivePrivateCode("");
            setPartyInviteCode("");
            if (window.location.pathname !== ARCADE_LOBBY_PATH || window.location.search) {
              window.history.pushState({ queueArcadeView: "lobby" }, "", ARCADE_LOBBY_PATH);
            }
          }}
        />
      ) : null}

      {phase === "waiting" && entryWaitMode === "lessons" && (
        <section
          className={styles.entryWait}
          data-testid="round-entry-wait"
          data-lessons="true"
          aria-label="Waiting for the next round"
        >
          <h1 className="sr-only">Waiting for the next round</h1>
          <div className={styles.entryWaitContent}>
            <strong data-testid="entry-wait-timer">
              00:{String(Math.ceil(entryWaitRemaining / 1_000)).padStart(2, "0")}
            </strong>
            <p className={styles.entryWaitHint} data-testid="entry-wait-hint">
              {ENTRY_WAIT_HINT}
            </p>
            <EntryWaitLessons />
            {roomError && (
              <span className={clsx(styles.entryWaitStatus, styles.entryWaitStatusError)} aria-live="polite">
                <Signal />
                {roomError}
              </span>
            )}
          </div>
        </section>
      )}

      {phase === "reveal" && isKillStreakCallout && (
        <>
          {streakCallout === "First Blood" && <div className={styles.firstBloodSplash} aria-hidden="true" />}
          {streakBanner && (
            <div className={styles.killStreakHud} aria-hidden="true">
              <p
                className={streakCallout === "First Blood" ? styles.firstBloodBanner : styles.killStreakBanner}
                data-testid="kill-streak-banner"
                data-callout={streakCallout}
              >
                {streakBanner.before}
                <em>{streakBanner.accent}</em>
                {streakBanner.after}
              </p>
            </div>
          )}
        </>
      )}

      {(phase === "answering" || phase === "reveal") && currentQuestion && (
        <section
          className={styles.gameLayout}
          data-testid="public-room"
          data-round-game={currentGame}
          data-content-difficulty={currentQuestion.difficulty}
          data-copy-guard={shouldBlockQuestionClipboard(phase) ? "blocked" : "allowed"}
        >
          <h1 className="sr-only" ref={roundHeadingRef} data-testid="round-heading" tabIndex={-1}>
            Round {roundIndex + 1}
          </h1>
          <div
            ref={roundStageRef}
            className={clsx(
              styles.gameStage,
              currentGame === "shopkeeper" && styles.shopkeeperStage,
              currentGame === "spell-link" && styles.spellLinkStage,
              currentGame === "fogged-vision" && styles.foggedStage,
              currentGame === "echo-hunt" && styles.echoStage,
              currentGame === "soundcheck" && styles.soundcheckStage,
              currentGame === "quote-hunt" && styles.quoteStage,
              currentGame === "aghanim-lab" && styles.aghanimStage,
              currentGame === "order-up" && styles.valueOrderStage,
              currentGame === "flashback" && styles.flashbackStage,
            )}
          >
            <div className={styles.timerTrack} aria-hidden="true">
              <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, timerRatio))})` }} />
            </div>

            {voteError ? (
              <p className={styles.voteRetry} data-testid="vote-retry" role="status">
                {voteError}
              </p>
            ) : null}

            <div className={styles.roundHeader}>
              <div>
                <span>Round {String(roundIndex + 1).padStart(3, "0")}</span>
                <i />
                <span className={styles.roundGameLabel}>
                  <ModeIcon mode={currentGame} />
                  {gameLabel(currentGame)}
                </span>
                <i />
                <span>{currentQuestion.category}</span>
              </div>
              <div
                className={styles.timer}
                role="timer"
                aria-live="off"
                aria-label={`${Math.ceil(answerRemaining / 1000)} seconds remaining`}
              >
                <Clock3 />
                <strong data-testid="round-timer">
                  {phase === "answering"
                    ? String(Math.ceil(answerRemaining / 1000)).padStart(2, "0")
                    : String(Math.ceil(revealRemaining / 1000)).padStart(2, "0")}
                </strong>
              </div>
            </div>

            {currentGame === "flashback" ? (
              <div
                className={clsx(styles.questionBlock, styles.flashbackQuestion)}
                data-testid="round-prompt"
                data-flashback-family={currentQuestion.flashback?.family}
                data-reveal-photo={
                  phase === "reveal" && currentQuestion.reveal?.media?.kind === "photo" ? "true" : "false"
                }
              >
                <QuestionArtwork
                  question={currentQuestion}
                  imageOverride={
                    phase === "reveal" && currentQuestion.reveal?.media?.kind === "photo"
                      ? {
                          src: currentQuestion.reveal.media.src,
                          alt: currentQuestion.reveal.media.alt,
                          kind: "hero",
                        }
                      : undefined
                  }
                />
                <div className={styles.questionCopy}>
                  <h2>{currentQuestion.prompt}</h2>
                </div>
              </div>
            ) : currentGame === "order-up" ? (
              <div className={clsx(styles.questionBlock, styles.valueOrderQuestion)} data-testid="round-prompt">
                <div className={styles.valueOrderGlyph} aria-hidden="true">
                  <ListOrdered />
                </div>
                <div className={styles.questionCopy}>
                  <span>{currentQuestion.eyebrow}</span>
                  <h2>{currentQuestion.prompt}</h2>
                </div>
              </div>
            ) : currentGame === "shopkeeper" ? (
              <div
                className={clsx(
                  styles.questionBlock,
                  styles.shopkeeperQuestion,
                  isOpenShopRound && styles.shopkeeperOpenQuestion,
                )}
                data-testid="round-prompt"
                data-shopkeeper-format={currentQuestion.shopkeeper?.format}
              >
                {currentQuestion.shopkeeper?.format === "real-recipe" ? (
                  <div className={styles.recipeTarget}>
                    <QuestionArtwork question={currentQuestion} />
                    <span>Target item</span>
                  </div>
                ) : (
                  <div className={styles.shopkeeperPromptTray}>
                    <ShopkeeperTray
                      items={currentQuestion.shopkeeper?.promptItems ?? []}
                      testId="shopkeeper-prompt-items"
                    />
                  </div>
                )}
                <div className={styles.questionCopy}>
                  <h2>{currentQuestion.prompt}</h2>
                </div>
              </div>
            ) : currentGame === "spell-link" ? (
              <div
                className={clsx(styles.questionBlock, styles.spellQuestion, styles.heroPickerQuestion)}
                data-testid="round-prompt"
              >
                <div className={styles.spellArtwork}>
                  {clueStage >= 3 ? (
                    <QuestionArtwork question={currentQuestion} testId="spell-ability-artwork" />
                  ) : (
                    <div
                      className={clsx(styles.artwork, styles.spellLockedArtwork)}
                      role="img"
                      data-testid="spell-artwork-locked"
                      aria-label={`Ability icon unlocks at ${finalClueAt} seconds`}
                    >
                      <div className={styles.artGlow} />
                      <WandSparkles />
                      <span className={styles.artCorner} />
                    </div>
                  )}
                  <span>
                    Clue {clueStage}
                    <small>/ 3</small>
                  </span>
                </div>
                <div className={styles.questionCopy}>
                  <span>Ability identity</span>
                  <h2>Which hero owns this ability?</h2>
                  <div className={styles.clueList} data-testid="spell-clue-list">
                    <div
                      className={styles.clueUnlocked}
                      data-testid="spell-clue-1"
                      data-density={spellHint.length > 320 ? "dense" : "normal"}
                    >
                      <strong>01</strong>
                      <span data-testid="spell-clue-description">{spellHint}</span>
                    </div>
                    <div
                      className={clueStage >= 2 ? styles.clueUnlocked : styles.clueLocked}
                      data-testid="spell-clue-2"
                    >
                      <strong>02</strong>
                      <span>
                        {clueStage >= 2 ? currentQuestion.eyebrow : `Ability name unlocks at ${firstClueAt}s`}
                      </span>
                    </div>
                    <div
                      className={clueStage >= 3 ? styles.clueUnlocked : styles.clueLocked}
                      data-testid="spell-clue-3"
                    >
                      <strong>03</strong>
                      <span>{clueStage >= 3 ? "Ability icon revealed" : `Icon unlocks at ${finalClueAt}s`}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : currentGame === "aghanim-lab" ? (
              <div
                className={clsx(styles.questionBlock, styles.aghanimQuestion, styles.heroPickerQuestion)}
                data-testid="round-prompt"
                data-aghanim-stage={clueStage}
              >
                <div className={styles.aghanimArtwork} data-testid="aghanim-artwork">
                  {aghanimItem ? (
                    <Image
                      src={aghanimItem.image}
                      alt={aghanimUpgradeLabel ?? "Aghanim upgrade"}
                      fill
                      sizes="128px"
                      unoptimized
                    />
                  ) : (
                    <Gem aria-hidden="true" />
                  )}
                  <span>
                    Clue {clueStage}
                    <small>/ 3</small>
                  </span>
                </div>
                <div className={styles.questionCopy}>
                  <span>Upgrade effect</span>
                  <h2>{currentQuestion.prompt}</h2>
                  <div className={clsx(styles.clueList, styles.aghanimClues)}>
                    <div className={styles.clueUnlocked} data-testid="aghanim-clue-1">
                      <strong>01</strong>
                      <span>{currentQuestion.aghanim?.effect}</span>
                    </div>
                    <div
                      className={clueStage >= 2 ? styles.clueUnlocked : styles.clueLocked}
                      data-testid="aghanim-clue-2"
                    >
                      <strong>02</strong>
                      <span>
                        {clueStage >= 2 && aghanimUpgradeLabel
                          ? `${aghanimUpgradeLabel} · ${
                              currentQuestion.aghanim?.upgradeMode === "new" ? "New ability" : "Existing ability"
                            }`
                          : "Upgrade details"}
                      </span>
                    </div>
                    <div
                      className={clueStage >= 3 ? styles.clueUnlocked : styles.clueLocked}
                      data-testid="aghanim-clue-3"
                    >
                      <strong>03</strong>
                      <span>{clueStage >= 3 ? currentQuestion.aghanim?.abilityName : "Ability name"}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : currentGame === "fogged-vision" ? (
              <div
                key={`${activeRoundId}:fog`}
                className={clsx(styles.questionBlock, styles.fogQuestion, styles.heroPickerQuestion)}
                data-testid="round-prompt"
                data-fog-stage={phase === "reveal" ? "reveal" : clueStage}
                data-fog-source={phase === "answering" ? "server" : undefined}
              >
                <div className={styles.fogArtwork}>
                  <QuestionArtwork question={currentQuestion} concealIdentity />
                  {phase === "reveal" ? null : (
                    <span>
                      <ScanEye />
                      Fog {String(clueStage).padStart(2, "0")}
                      <small>/ 03</small>
                    </span>
                  )}
                </div>
                <div className={styles.questionCopy}>
                  <span>Progressive reveal</span>
                  <h2>Which hero is hiding in the fog?</h2>
                  <div className={styles.fogMeter} role="img" aria-label={`Portrait clarity stage ${clueStage} of 3`}>
                    {Array.from({ length: 3 }, (_, index) => (
                      <span key={index} className={index < clueStage ? styles.fogMeterActive : undefined} />
                    ))}
                  </div>
                </div>
              </div>
            ) : currentGame === "echo-hunt" || isSoundcheckRound ? (
              <div
                className={clsx(
                  styles.questionBlock,
                  styles.echoQuestion,
                  isHeroPickerRound && styles.heroPickerQuestion,
                  isSoundcheckRound && styles.soundcheckQuestion,
                )}
                data-testid="round-prompt"
                data-soundcheck-family={isSoundcheckRound ? currentQuestion.soundcheck?.family : undefined}
                data-soundcheck-scope={isSoundcheckRound ? currentQuestion.soundcheck?.choiceScope : undefined}
                data-soundcheck-format={isSoundcheckRound ? currentQuestion.soundcheck?.format : undefined}
                data-soundcheck-stage={isSoundcheckRound ? clueStage : undefined}
                data-echo-stage={isEchoHuntRound ? clueStage : undefined}
              >
                {(currentQuestion.audio?.clips ?? (currentQuestion.audio?.src ? [currentQuestion.audio.src] : [])).map(
                  (audioSource, clipIndex, audioSources) => (
                    <audio
                      key={`${currentQuestion.id}:${clipIndex}`}
                      ref={(audio) => {
                        roundAudioRefs.current[clipIndex] = audio;
                      }}
                      data-testid="round-audio-clip"
                      data-clip-index={clipIndex + 1}
                      data-cut-duration={
                        isSoundcheckRound
                          ? soundcheckCutDuration(
                              currentQuestion.soundcheck?.clips[clipIndex]?.duration ?? 0,
                              clueStage,
                            )
                          : isEchoHuntRound
                            ? (roundAudioDurations[audioSource] ?? undefined)
                            : undefined
                      }
                      src={withPlayerId(audioSource)}
                      preload="auto"
                      aria-hidden="true"
                      onLoadStart={() => setRoundAudioState("loading")}
                      onCanPlay={(event) => {
                        event.currentTarget.volume = gameVolume;
                        const duration = event.currentTarget.duration;
                        if (Number.isFinite(duration) && roundAudioDurations[audioSource] !== duration) {
                          setRoundAudioDurations((current) =>
                            current[audioSource] === duration ? current : { ...current, [audioSource]: duration },
                          );
                        }
                        const loaded = roundAudioRefs.current
                          .slice(0, audioSources.length)
                          .every((audio) => audio && audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
                        if (loaded && !roundAudioAbortRef.current) setRoundAudioState("ready");
                      }}
                      onError={() => setRoundAudioState("error")}
                    />
                  ),
                )}
                <div
                  className={clsx(
                    styles.echoPlayer,
                    isSoundcheckRound && styles.soundcheckPlayer,
                    isSoundSequence && styles.soundcheckSequencePlayer,
                  )}
                  data-testid={isSoundcheckRound ? "soundcheck-player" : "echo-player"}
                  data-voice-state={roundAudioState}
                  data-audio-state={roundAudioState}
                  role={roundAudioState === "blocked" ? "button" : undefined}
                  tabIndex={roundAudioState === "blocked" ? 0 : undefined}
                  onClick={() => {
                    if (phase === "answering" && roundAudioState === "blocked") {
                      playRoundAudio(false, isProgressiveAudioRound ? clueStage : 1);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (roundAudioState !== "blocked") return;
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    playRoundAudio(false, isProgressiveAudioRound ? clueStage : 1);
                  }}
                  data-play-count={roundAudioPlayCount}
                  data-clip-count={currentQuestion.audio?.clips?.length ?? 1}
                  data-active-clip={roundAudioClipIndex + 1}
                  data-reveal-stage={isProgressiveAudioRound ? clueStage : undefined}
                >
                  <div
                    className={styles.audioAutoplayIcon}
                    data-testid={isSoundcheckRound ? "soundcheck-autoplay" : "echo-autoplay"}
                    aria-hidden="true"
                  >
                    {roundAudioState === "playing" ? <AudioWaveform /> : <Volume2 />}
                  </div>
                  <div className={styles.audioVisualization} aria-hidden="true">
                    <div className={styles.echoWave}>
                      {Array.from({ length: 15 }, (_, index) => (
                        <i key={index} />
                      ))}
                    </div>
                    {isSoundSequence && (
                      <div className={styles.soundSequenceSteps}>
                        <i data-active={roundAudioState === "playing" && roundAudioClipIndex === 0}>01</i>
                        <ArrowRight />
                        <i data-active={roundAudioState === "playing" && roundAudioClipIndex === 1}>02</i>
                      </div>
                    )}
                  </div>
                  <span>
                    {roundAudioState === "blocked"
                      ? "Click to hear this cut"
                      : roundAudioState === "error"
                        ? "Audio unavailable"
                        : roundAudioState === "loading"
                          ? isSoundcheckRound
                            ? "Loading cut"
                            : "Loading voice cut"
                          : roundAudioState === "playing"
                            ? isSoundSequence
                              ? `Sound ${roundAudioClipIndex + 1} of 2`
                              : `Cut ${clueStage} of ${
                                  isSoundcheckRound ? SOUNDCHECK_REVEAL_STAGES : ECHO_HUNT_REVEAL_STAGES
                                }`
                            : `Cut ${clueStage} of ${
                                isSoundcheckRound ? SOUNDCHECK_REVEAL_STAGES : ECHO_HUNT_REVEAL_STAGES
                              }`}
                  </span>
                </div>
                <div className={styles.questionCopy}>
                  <span>
                    {isSoundcheckRound
                      ? isSoundSequence
                        ? "Ordered pair"
                        : currentQuestion.soundcheck?.family === "item"
                          ? "Item activation"
                          : "Ability sound"
                      : "Hero response"}
                  </span>
                  <h2>{isSoundcheckRound ? currentQuestion.prompt : "Whose voice is this?"}</h2>
                  {isProgressiveAudioRound && (
                    <div
                      className={styles.soundRevealMeter}
                      role="img"
                      aria-label={`${isSoundcheckRound ? "Sound" : "Voice"} cut ${clueStage} of ${
                        isSoundcheckRound ? SOUNDCHECK_REVEAL_STAGES : ECHO_HUNT_REVEAL_STAGES
                      }`}
                    >
                      {Array.from(
                        {
                          length: isSoundcheckRound ? SOUNDCHECK_REVEAL_STAGES : ECHO_HUNT_REVEAL_STAGES,
                        },
                        (_, index) => (
                          <span key={index} className={index < clueStage ? styles.soundRevealMeterActive : undefined} />
                        ),
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : currentGame === "quote-hunt" ? (
              <div
                className={clsx(styles.questionBlock, styles.quoteQuestion, styles.heroPickerQuestion)}
                data-testid="round-prompt"
              >
                <div className={styles.quoteCard} data-testid="hero-quote">
                  <MessageSquareQuote />
                  <blockquote>“{currentQuestion.detail}”</blockquote>
                  <span>Hero response</span>
                </div>
                <div className={styles.questionCopy}>
                  <span>Hero quote</span>
                  <h2>Who said it?</h2>
                  <div className={styles.quoteHints} role="group" aria-label={`Identity clue stage ${clueStage} of 3`}>
                    {[0, 1].map((index) => {
                      const hint = currentQuestion.quoteHints?.[index];
                      return (
                        <span
                          key={index}
                          data-testid={`quote-hint-${index + 1}`}
                          data-state={hint ? "revealed" : "locked"}
                        >
                          <b>{String(index + 1).padStart(2, "0")}</b>
                          {hint ?? "?"}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div
                className={clsx(styles.questionBlock, !currentQuestion.image && styles.textQuestion)}
                data-testid="round-prompt"
              >
                {currentQuestion.image ? (
                  <QuestionArtwork question={currentQuestion} />
                ) : (
                  <div className={styles.questionGlyph} aria-hidden="true">
                    {currentQuestion.kind === "hero-stat-duel" ||
                    currentQuestion.kind === "item-price-duel" ||
                    currentQuestion.kind === "hero-move-speed" ? (
                      <Gauge />
                    ) : (
                      <Swords />
                    )}
                  </div>
                )}
                <div className={styles.questionCopy}>
                  {classicQuestionContext(currentQuestion) && <span>{classicQuestionContext(currentQuestion)}</span>}
                  <h2>{currentQuestion.prompt}</h2>
                  {currentQuestion.detail && <p className={styles.questionDetail}>{currentQuestion.detail}</p>}
                </div>
              </div>
            )}

            {isOpenShopRound && (
              <ShopkeeperStore
                key={`${activeRoundId}:${phase}`}
                question={currentQuestion}
                phase={phase}
                selectedKey={selectedAnswerKey}
                crowd={crowd}
                onChoose={chooseKeyedAnswer}
                onPick={playPickSound}
              />
            )}

            {isHeroPickerRound && (
              <HeroPicker
                key={`${activeRoundId}:${phase}`}
                question={currentQuestion}
                phase={phase}
                selectedKey={selectedAnswerKey}
                crowd={crowd}
                onChoose={chooseKeyedAnswer}
              />
            )}

            {isValueOrderRound && (
              <ValueOrderBoard
                key={`${activeRoundId}:${phase}`}
                question={currentQuestion}
                phase={phase}
                selectedKey={selectedAnswerKey}
                onChoose={chooseKeyedAnswer}
                onPick={playPickSound}
              />
            )}

            {isFlashbackOrderRound && (
              <FlashbackOrderBoard
                key={`${activeRoundId}:${phase}`}
                question={currentQuestion}
                phase={phase}
                selectedKey={selectedAnswerKey}
                onChoose={chooseKeyedAnswer}
                onPick={playPickSound}
              />
            )}

            {isFlashbackYearRound && (
              <FlashbackYearBoard
                key={`${activeRoundId}:${phase}`}
                question={currentQuestion}
                phase={phase}
                selectedKey={selectedAnswerKey}
                onChoose={chooseKeyedAnswer}
              />
            )}

            {!isOpenShopRound &&
              !isHeroPickerRound &&
              !isValueOrderRound &&
              !isFlashbackOrderRound &&
              !isFlashbackYearRound && (
                <div
                  className={clsx(
                    styles.answers,
                    isFlashbackYearRound && styles.flashbackYears,
                    currentGame === "shopkeeper" && styles.itemAnswers,
                    (currentQuestion.answerImageKind === "hero" || currentGame === "spell-link") && styles.heroAnswers,
                    currentGame === "fogged-vision" && styles.fogAnswers,
                    currentGame === "echo-hunt" && styles.echoAnswers,
                    currentGame === "soundcheck" && styles.soundcheckAnswers,
                    currentGame === "quote-hunt" && styles.quoteAnswers,
                  )}
                  role="group"
                  aria-label="Answer choices"
                  data-testid="answer-grid"
                >
                  {currentQuestion.answers.map((answer, index) => {
                    const isSelected = selectedIndex === index;
                    const isCorrect = publicCorrectIndex(currentQuestion) === index;
                    const percentage = crowd.total ? Math.round((crowd.counts[index] / crowd.total) * 100) : 0;
                    const answerImagePair = currentQuestion.answerImagePairs?.[index];
                    const shopkeeperAnswerGroup = currentQuestion.shopkeeper?.answerGroups?.[index];
                    const answerPairNames = answerImagePair ? answer.split(" → ") : [];
                    const resultStyle = {
                      "--result-width": `${percentage}%`,
                    } as CSSProperties;

                    return (
                      <button
                        key={`${currentQuestion.id}:${answer}`}
                        type="button"
                        data-testid="arcade-answer"
                        className={clsx(
                          styles.answer,
                          (currentQuestion.answerImages || answerImagePair || shopkeeperAnswerGroup) &&
                            styles.visualAnswer,
                          answerImagePair && styles.sequenceAnswer,
                          shopkeeperAnswerGroup && styles.shopkeeperRecipeAnswer,
                          phase === "answering" && isSelected && styles.answerLocked,
                          phase === "answering" && selectedIndex !== null && !isSelected && styles.answerMuted,
                          phase === "reveal" && isCorrect && styles.answerCorrect,
                          phase === "reveal" && isSelected && !isCorrect && styles.answerWrong,
                        )}
                        onClick={() => chooseAnswer(index)}
                        disabled={phase !== "answering" || selectedIndex !== null}
                        aria-pressed={isSelected}
                        aria-label={
                          answerImagePair
                            ? `${LETTERS[index]}. ${answer}`
                            : shopkeeperAnswerGroup
                              ? `${LETTERS[index]}. ${shopkeeperAnswerGroup
                                  .map((item) => `${item.name}${item.count > 1 ? ` times ${item.count}` : ""}`)
                                  .join(", ")}`
                              : undefined
                        }
                        style={resultStyle}
                      >
                        {phase === "reveal" && <span className={styles.resultFill} />}
                        <span className={styles.answerKey}>{LETTERS[index]}</span>
                        {shopkeeperAnswerGroup ? (
                          <ShopkeeperTray items={shopkeeperAnswerGroup} compact testId="shopkeeper-recipe-choice" />
                        ) : answerImagePair ? (
                          <span className={styles.sequenceAnswerChoice} data-testid="sound-sequence-choice">
                            <AnswerArtwork
                              src={answerImagePair[0]}
                              alt={answerPairNames[0] ?? "First sound"}
                              kind={currentQuestion.answerImageKind ?? "ability"}
                            />
                            <ArrowRight className={styles.sequenceAnswerArrow} aria-hidden="true" />
                            <AnswerArtwork
                              src={answerImagePair[1]}
                              alt={answerPairNames[1] ?? "Second sound"}
                              kind={currentQuestion.answerImageKind ?? "ability"}
                            />
                          </span>
                        ) : currentQuestion.answerImages?.[index] ? (
                          <AnswerArtwork
                            src={currentQuestion.answerImages[index]}
                            alt={answer}
                            kind={
                              currentQuestion.answerImageKind ??
                              (currentGame === "spell-link" ||
                              currentGame === "echo-hunt" ||
                              currentGame === "quote-hunt"
                                ? "hero"
                                : "item")
                            }
                          />
                        ) : null}
                        {!answerImagePair && !shopkeeperAnswerGroup && (
                          <span className={styles.answerText}>
                            {answer}
                            {isSelected && phase === "answering" && <small>Your answer · locked</small>}
                            {isSelected && phase === "reveal" && <small>Your answer</small>}
                          </span>
                        )}
                        {phase === "reveal" ? (
                          <span className={styles.answerResult}>
                            <strong>{percentage}%</strong>
                            {isCorrect ? <Check /> : isSelected ? <X /> : null}
                          </span>
                        ) : (
                          <span className={styles.answerChevron}>
                            <ChevronRight />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

            {phase === "answering" ? (
              <div className={styles.answerHelper} data-testid="answer-helper">
                {selectedIndex === null ? (
                  <>
                    {isOpenShopRound ? (
                      <ShoppingBag />
                    ) : isHeroPickerRound ? (
                      <Users />
                    ) : isValueOrderRound ? (
                      <ListOrdered />
                    ) : (
                      <Keyboard />
                    )}
                    <span className={styles.answerHelperCopy}>
                      {isOpenShopRound
                        ? isRecipeBuilderRound
                          ? shopkeeperAnswerAction(currentQuestion)
                          : isSoundcheckRound
                            ? "Choose the item that made the sound"
                            : "Choose an item from the shop · Enter picks the only match"
                        : isHeroPickerRound
                          ? "Choose a hero · type to search · Enter picks the only match"
                          : isValueOrderRound
                            ? "Choose four in order"
                            : isFlashbackOrderRound
                              ? "Choose four in order · A–D or 1–4"
                              : isFlashbackYearRound
                                ? "Slide to the year, then press Lock · Enter also locks"
                                : currentGame === "shopkeeper"
                                  ? `${shopkeeperAnswerAction(currentQuestion)} · A–D or 1–4`
                                  : currentGame === "spell-link"
                                    ? "Link the spell to a hero · A–D or 1–4"
                                    : currentGame === "fogged-vision"
                                      ? "Name the silhouette · A–D or 1–4"
                                      : currentGame === "echo-hunt"
                                        ? "Match the voice · A–D or 1–4"
                                        : currentGame === "soundcheck"
                                          ? isSoundSequence
                                            ? "Match the order · A–D or 1–4"
                                            : "Match the sound · A–D or 1–4"
                                          : currentGame === "quote-hunt"
                                            ? "Match the line to its hero · A–D or 1–4"
                                            : "Use A–D or 1–4 to answer"}
                    </span>
                    <span className={styles.answerHelperGold}>Correct now: {liveAward?.rawPoints ?? 0} gold</span>
                  </>
                ) : (
                  <>
                    <Signal className={styles.signalIcon} />
                    <span className={styles.answerHelperCopy}>
                      Answer locked with {Math.ceil(answerTimeLeft / 1000)}s left
                    </span>
                    <span className={styles.answerHelperGold}>Worth {liveAward?.rawPoints ?? 0} gold if correct</span>
                  </>
                )}
              </div>
            ) : (
              <div
                className={clsx(styles.revealPanel, selectedWasCorrect ? styles.revealCorrect : styles.revealWrong)}
                data-testid="reveal-panel"
                data-has-media={
                  currentQuestion.reveal?.media && currentQuestion.reveal.media.kind !== "photo" ? "true" : "false"
                }
                data-media-kind={
                  currentQuestion.reveal?.media && currentQuestion.reveal.media.kind !== "photo" ? "mark" : undefined
                }
                aria-live="polite"
              >
                <div className={styles.revealIcon}>{selectedWasCorrect ? <Check /> : <X />}</div>
                {currentQuestion.reveal?.media && currentQuestion.reveal.media.kind !== "photo" && (
                  <figure className={styles.revealMedia} data-kind="mark" data-testid="flashback-reveal-media">
                    <Image
                      src={currentQuestion.reveal.media.src}
                      alt={currentQuestion.reveal.media.alt}
                      width={88}
                      height={88}
                      unoptimized
                    />
                    {currentQuestion.reveal.media.caption ? (
                      <figcaption>{currentQuestion.reveal.media.caption}</figcaption>
                    ) : null}
                  </figure>
                )}
                <div className={styles.revealCopy}>
                  <span data-testid="reveal-callout" data-callout={resultCallout}>
                    {resultCallout}
                  </span>
                  {!isValueOrderRound && <p data-testid="reveal-explanation">{currentQuestion.reveal?.explanation}</p>}
                  <div className={styles.reportControl}>
                    <button
                      type="button"
                      className={styles.reportButton}
                      data-testid="report-question"
                      aria-expanded={reportTarget?.roundId === activeRoundId}
                      onClick={toggleQuestionReport}
                      disabled={reportState === "sending" || reportState === "sent"}
                    >
                      <Flag />
                      {reportedReason
                        ? `Reported · ${REPORT_REASON_LABELS[reportedReason]}`
                        : reportState === "sending"
                          ? "Sending…"
                          : reportState === "error"
                            ? "Try report again"
                            : "Report question"}
                    </button>
                    {reportTarget?.roundId === activeRoundId && !reportedReason && (
                      <div className={styles.reportMenu} role="group" aria-label="Why are you reporting this question?">
                        {REPORT_REASONS.map((reason) => (
                          <button
                            key={reason}
                            type="button"
                            data-testid="report-reason"
                            data-report-reason={reason}
                            onClick={() => void submitQuestionReport(reason)}
                          >
                            {REPORT_REASON_LABELS[reason]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className={styles.pointsAward}>
                  <small>
                    {roundAward?.majorityBonus
                      ? "2× crowd breaker"
                      : roundAward?.correct
                        ? `+${roundAward.speedBonus} speed${roundAward.cluePenalty ? ` · −${roundAward.cluePenalty} hints` : ""}`
                        : "No score"}
                  </small>
                  <strong>+{roundAward?.points ?? 0}</strong>
                  <span>gold</span>
                </div>
              </div>
            )}
          </div>

          <div className={styles.sideRail} role="region" aria-label="Your session">
            <div className={styles.scoreGrid} data-testid="score-grid">
              <div>
                <span>Gold</span>
                <strong>{score.toLocaleString("en-US")}</strong>
                <Gauge />
              </div>
              <div>
                <span>Streak</span>
                <strong>{streak}</strong>
                <Flame />
              </div>
            </div>

            <div className={styles.progressCard}>
              <div className={styles.cardTitle}>
                <span>Recent rounds</span>
                <div className={styles.progressActions}>
                  {roomError && (
                    <span className={styles.roomSyncStatus} title={roomError} role="status">
                      Syncing
                    </span>
                  )}
                  <strong>Round {roundIndex + 1}</strong>
                </div>
              </div>
              <div className={styles.roundPips}>
                {Array.from({ length: 10 }, (_, index) => {
                  const record = recentHistory[index];
                  const isCurrent = phase === "answering" && index === recentHistory.length;
                  const roundNumber = record ? recentHistoryStart + index : roundIndex + 1;

                  return (
                    <span
                      key={`${record?.id ?? "slot"}:${index}`}
                      title={
                        record
                          ? `Round ${roundNumber} · ${gameLabel(record.game)}`
                          : isCurrent
                            ? `Round ${roundNumber} · ${gameLabel(currentGame)}`
                            : undefined
                      }
                      className={clsx(
                        isCurrent && styles.pipCurrent,
                        record?.correct && styles.pipCorrect,
                        record && !record.correct && styles.pipWrong,
                        !record && !isCurrent && styles.pipEmpty,
                      )}
                    >
                      {record ? record.correct ? <Check /> : <X /> : isCurrent ? <ModeIcon mode={currentGame} /> : "·"}
                    </span>
                  );
                })}
              </div>
            </div>

            {phase === "reveal" && (
              <div className={styles.crowdCard} data-testid="crowd-card" data-phase={phase}>
                <div className={styles.cardTitle}>
                  <span>
                    <Radio />
                    Global split
                  </span>
                  <span className={styles.livePill}>Final</span>
                </div>
                <strong>
                  {crowd.total.toLocaleString("en-US")} {crowd.total === 1 ? "answer" : "answers"}
                </strong>
                {crowd.total === 0 && <p>Nobody answered before this room’s deadline.</p>}
                {crowd.total > 0 ? (
                  isPublicKeyedAnswerQuestion(currentQuestion) ? (
                    <KeyedCrowdSplit question={currentQuestion} crowd={crowd} selectedKey={selectedAnswerKey} />
                  ) : (
                    <ChoiceCrowdSplit question={currentQuestion} crowd={crowd} selectedIndex={selectedIndex} />
                  )
                ) : (
                  <div className={styles.crowdSplitEmpty} aria-hidden="true">
                    —
                  </div>
                )}
                {crowd.total > 0 && crowd.scoreSummary && (
                  <div className={styles.crowdScoreSummary} data-testid="crowd-score-summary">
                    <span>
                      <small>You</small>
                      <strong>
                        {crowd.scoreSummary.playerPoints === null ? "—" : `+${crowd.scoreSummary.playerPoints}`}
                      </strong>
                    </span>
                    <span>
                      <small>Correct avg</small>
                      <strong>{crowd.scoreSummary.average === null ? "—" : `+${crowd.scoreSummary.average}`}</strong>
                    </span>
                    <span>
                      <small>Best</small>
                      <strong>{crowd.scoreSummary.best === null ? "—" : `+${crowd.scoreSummary.best}`}</strong>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {reportTarget && reportTarget.roundId !== activeRoundId && (
        <aside className={styles.reportCarryover} data-testid="report-carryover" aria-label="Report previous question">
          <div className={styles.reportCarryoverTitle}>
            <Flag />
            <span>
              <small>Report previous question</small>
              <strong>{reportTarget.prompt}</strong>
              <em>Answer · {reportTarget.answer}</em>
            </span>
            <button type="button" aria-label="Dismiss question report" onClick={dismissQuestionReport}>
              <X />
            </button>
          </div>
          <div className={styles.reportCarryoverReasons} role="group" aria-label="Why are you reporting this question?">
            {REPORT_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                data-testid="report-reason"
                data-report-reason={reason}
                onClick={() => void submitQuestionReport(reason)}
                disabled={reportState === "sending"}
              >
                {reportState === "sending" ? "Sending…" : REPORT_REASON_LABELS[reason]}
              </button>
            ))}
          </div>
          {reportState === "error" && <small className={styles.reportCarryoverError}>Couldn’t send · try again</small>}
        </aside>
      )}

      {activePrivateCode && phase !== "lobby" ? (
        <PrivateRoomPanel
          gameOptions={LIVE_ROUND_GAMES.map((game) => ({
            id: game,
            label: LIVE_ROUND_HEADER_LABELS[game as keyof typeof LIVE_ROUND_HEADER_LABELS] ?? game,
            preview: formatPreviews[game] ?? null,
          }))}
          playerId={ensurePlayerId}
          displayName={account?.authenticated ? account.profile.user.displayName : ""}
          initialCode={activePrivateCode}
          playActive
          onStarted={ignorePartyStart}
          onWaitingChange={handlePartyWaiting}
        />
      ) : null}

      {reportNotice && (
        <div className={styles.reportNotice} data-testid="report-confirmation" aria-live="polite">
          <Check />
          Report sent · {REPORT_REASON_LABELS[reportNotice.reason]}
        </div>
      )}

      <footer className={styles.footer}>
        <span>
          <BrandMark logoUrl={gameInfo.logoUrl} />
          Queue Arcade · Built for the seconds between “Find Match” and “Accept”
        </span>
        <span className={styles.footerMeta}>
          <Link href="/profile">Profile</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/calibration">Calibration lab</Link>
          <span>
            Dota 2 is a trademark of Valve Corporation. Game assets belong to their respective rights holders. This
            project is not affiliated with Valve.
          </span>
        </span>
      </footer>
    </main>
  );
}
