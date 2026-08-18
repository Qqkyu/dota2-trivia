"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  AudioLines,
  AudioWaveform,
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Crosshair,
  Flag,
  Flame,
  Gauge,
  Gamepad2,
  Gem,
  History,
  Keyboard,
  ListOrdered,
  MapPin,
  MessageSquareQuote,
  Radio,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Shuffle,
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
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  isReportReason,
  QUESTION_REPORT_GRACE_MS,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type ReportReason,
} from "@/lib/calibration";
import type { AccountSnapshot } from "@/lib/account-contract";
import { type ArcadeMode, type RoundGame, type ShopkeeperItemReference, type TriviaArtworkKind } from "@/lib/trivia";
import type { CrowdResult, PublicRoomSettings, ReportResult, RoomSnapshot, VoteResult } from "@/lib/arcade-contract";
import { LIVE_ROUND_GAMES, PUBLIC_ARCADE_MODE } from "@/lib/arcade-games.mjs";
import { LIVE_ROUND_HEADER_LABELS } from "@/lib/round-question-copy.mjs";
import { RoundMark } from "@/components/round-mark";
import { shouldShowEntryWaitLessons, shouldWaitForNextRoundOnEntry } from "@/lib/arcade-entry.mjs";
import {
  DOTA_SHOP_SEARCH_PLACEHOLDER,
  ENTRY_WAIT_HINT,
  ENTRY_WAIT_TIP_LABEL,
  ENTRY_WAIT_TIPS,
  shuffleEntryWaitTips,
} from "@/lib/entry-wait-tips.mjs";
import {
  flashbackYearAnswerKey,
  flashbackYearFromAnswerKey,
  isFlashbackOrderAnswerForQuestion,
  isFlashbackYearAnswerInRange,
  isFlashbackYearAnswerKey,
} from "@/lib/flashback.mjs";
import { ARCADE_LOBBY_PATH, PUBLIC_ARCADE_PATH } from "@/lib/arcade-navigation.mjs";
import { crowdPercentage, keyedCrowdSplitRows } from "@/lib/crowd-split.mjs";
import { DEFAULT_GAME_ID, GAME_IDS, type PublicGameInfo } from "@/lib/game-identity";
import { answerFeedbackKind } from "@/lib/feedback-sounds.mjs";
import { createFeedbackPlayer } from "@/lib/feedback-player.mjs";
import { accuracyRate, revealCallout, streakBannerParts } from "@/lib/dota-flavor.mjs";
import { preventQuestionClipboard, shouldBlockQuestionClipboard } from "@/lib/question-guard.mjs";
import { FALLBACK_STEAM_DISPLAY_NAME } from "@/lib/steam-profile.mjs";
import {
  HERO_PICKER_BY_KEY,
  HERO_PICKER_CATALOG,
  HERO_PICKER_HEROES,
  isHeroCatalogKey,
  type HeroPickerHero,
} from "@/lib/hero-picker";
import { MAP_SENSE_BAND_LABELS, MAP_SENSE_IMAGE, mapAnswerIndex, mapDistance, isMapPosition } from "@/lib/map-sense";
import type { MapBounds, MapChoiceChallenge, MapCrop, MapPosition, MapViewport } from "@/lib/map-types";
import { clueStageAt, crowdScoreMultiplier, scoreBreakdown } from "@/lib/scoring.mjs";
import {
  isRecipeAnswerKey,
  isShopkeeperCatalogKey,
  SHOPKEEPER_RECIPE_IMAGE,
  recipeAnswerKeyForItems,
  recipeItemsFromAnswerKey,
  SHOPKEEPER_CATALOG,
  SHOPKEEPER_CATALOG_BY_KEY,
  SHOPKEEPER_CATALOG_ITEMS,
  type ShopkeeperCatalogItem,
} from "@/lib/shopkeeper-catalog";
import {
  isPublicArcadeQuestion,
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
  SOUNDCHECK_SEQUENCE_GAP_SECONDS,
  echoHuntCutDuration,
  soundcheckCutDuration,
  soundcheckRevealStage,
} from "@/lib/soundcheck.mjs";
import {
  isValueOrderAnswerForQuestion,
  isValueOrderAnswerKey,
  valueOrderAnswerKey,
  valueOrderKeysFromAnswerKey,
} from "@/lib/value-order.mjs";
import {
  createRoomSyncGate,
  ROOM_SYNC_HEARTBEAT_MS,
  roomDeadlineSyncDelay,
  roomProgressiveClueSyncDeadline,
} from "@/lib/room-sync.mjs";
import { SteamAvatar } from "./steam-avatar";
import { SteamSignIn } from "./steam-sign-in";
import styles from "./queue-arcade.module.css";

const REVEAL_DURATION_MS = 7_000;
const ANSWER_DURATION_MS = 15_000;
const DEFAULT_GAME_VOLUME = 0.1;
const MIN_GAME_VOLUME = 0.1;
const LETTERS = ["A", "B", "C", "D"] as const;
const EMPTY_CROWD: CrowdResult = {
  counts: [0, 0, 0, 0],
  total: 0,
  positions: [],
  keyCounts: [],
  scoreSummary: null,
};
const STORAGE_KEY = "queue-arcade:stats:v2";
const PLAYER_KEY = "queue-arcade:player:v2";
const SETTINGS_KEY = "queue-arcade:settings:v3";
const PREVIOUS_SETTINGS_KEY = "queue-arcade:settings:v2";
const LEGACY_STORAGE_KEY = "queue-trivia:stats:v1";
const LEGACY_PLAYER_KEY = "queue-trivia:player:v1";
const LEGACY_SETTINGS_KEY = "queue-trivia:settings:v1";
const ROUND_GAMES: RoundGame[] = [...LIVE_ROUND_GAMES] as RoundGame[];
const WAIT_CHOICE_QUESTION: PublicArcadeQuestion = {
  id: "wait-tip-keys",
  game: "trivia",
  kind: "item-cost",
  category: "Items",
  difficulty: 1,
  eyebrow: "Blink Dagger",
  prompt: "How much does Blink Dagger cost?",
  image: {
    src: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/blink.png?t=1593393829403",
    alt: "Blink Dagger item icon",
    kind: "item",
  },
  answers: ["2,250 gold", "1,775 gold", "2,600 gold", "2,875 gold"],
  clueStage: 1,
  reveal: null,
};
const WAIT_HERO_QUESTION: PublicArcadeQuestion = {
  id: "wait-tip-heroes",
  game: "quote-hunt",
  kind: "hero-quote",
  category: "Heroes",
  difficulty: 1,
  eyebrow: "Hero grid",
  prompt: "Type a hero name.",
  answers: ["", "", "", ""],
  answerMode: "hero-grid",
  clueStage: 1,
  reveal: null,
};
const WAIT_SHOP_QUESTION: PublicArcadeQuestion = {
  id: "wait-tip-shop",
  game: "shopkeeper",
  kind: "shopkeeper-build-result",
  category: "Recipes",
  difficulty: 1,
  eyebrow: "Shop",
  prompt: "Search items.",
  answers: ["", "", "", ""],
  answerMode: "item-grid",
  clueStage: 1,
  reveal: null,
};
const PREVIEW_QUESTION: PublicArcadeQuestion = {
  id: "preview",
  game: "trivia",
  kind: "cooldown",
  category: "Abilities",
  difficulty: 2,
  eyebrow: "Endless rotation",
  prompt: "The next round could be anything.",
  image: {
    src: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/lina_dragon_slave.png",
    alt: "Dota ability artwork",
    kind: "ability",
  },
  answers: ["", "", "", ""],
  clueStage: 1,
  reveal: null,
};

function waitForMediaEvent(
  audio: HTMLAudioElement,
  eventName: "canplay" | "ended",
  signal: AbortSignal,
): Promise<"complete" | "error" | "cancelled"> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve("cancelled");
      return;
    }

    const settle = (result: "complete" | "error" | "cancelled") => {
      audio.removeEventListener(eventName, onComplete);
      audio.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onComplete = () => settle("complete");
    const onError = () => settle("error");
    const onAbort = () => settle("cancelled");

    audio.addEventListener(eventName, onComplete, { once: true });
    audio.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function waitForAudioGap(signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, SOUNDCHECK_SEQUENCE_GAP_SECONDS * 1_000);
    const onAbort = () => {
      window.clearTimeout(timeout);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function waitForAudioCut(
  audio: HTMLAudioElement,
  durationMs: number,
  signal: AbortSignal,
): Promise<"complete" | "error" | "cancelled"> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve("cancelled");
      return;
    }

    const settle = (result: "complete" | "error" | "cancelled") => {
      window.clearInterval(progressCheck);
      window.clearTimeout(stallTimeout);
      audio.removeEventListener("timeupdate", onProgress);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const cutAt = durationMs / 1_000;
    const onProgress = () => {
      if (audio.currentTime + 0.01 < cutAt) return;
      audio.pause();
      settle("complete");
    };
    const onEnded = () => settle("complete");
    const onError = () => settle("error");
    const onAbort = () => settle("cancelled");
    const progressCheck = window.setInterval(onProgress, 20);
    const stallTimeout = window.setTimeout(() => {
      audio.pause();
      settle("error");
    }, durationMs + 2_000);

    audio.addEventListener("timeupdate", onProgress);
    audio.addEventListener("ended", onEnded, { once: true });
    audio.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
    onProgress();
  });
}
type GamePhase = "lobby" | "waiting" | "answering" | "reveal";

interface RoundAward {
  points: number;
  majorityBonus: boolean;
  correct: boolean;
  speedBonus: number;
  cluePenalty: number;
  precisionBonus: number;
  mapDistance: number | null;
}

interface RoundRecord {
  id: string;
  category: PublicArcadeQuestion["category"];
  game: RoundGame;
  correct: boolean;
  points: number;
}

interface QuestionReportTarget {
  roundId: string;
  prompt: string;
  answer: string;
  expiresAt: number;
}

interface QuestionReportNotice {
  reason: ReportReason;
  expiresAt: number;
}

interface LifetimeStats {
  runs: number;
  answered: number;
  correct: number;
  bestScore: number;
}

const EMPTY_STATS: LifetimeStats = {
  runs: 0,
  answered: 0,
  correct: 0,
  bestScore: 0,
};

const MODE_INFO: Record<
  ArcadeMode,
  {
    label: string;
    shortLabel: string;
    eyebrow: string;
    description: string;
    action: string;
  }
> = {
  mixed: {
    label: "Queue Arcade",
    shortLabel: "Public Arcade",
    eyebrow: "One room · Endless",
    description: "Dota facts, recipes, spells, history, TI, fog, voices, sounds, and quotes—one round at a time.",
    action: "Play Dota",
  },
  trivia: {
    label: "Classic Trivia",
    shortLabel: "Classic Trivia",
    eyebrow: "The original",
    description: "Mana, damage, cooldowns, heroes, and items—the classic global-results loop.",
    action: "Enter classic trivia",
  },
  shopkeeper: {
    label: "Shopkeeper Rush",
    shortLabel: "Shopkeeper",
    eyebrow: "Recipe knowledge",
    description: "Build items, spot exact recipes, find shared parts, and trace direct upgrades.",
    action: "Open the secret shop",
  },
  "spell-link": {
    label: "Spell Link",
    shortLabel: "Spell Link",
    eyebrow: "Icon recognition",
    description: "Match an ability to its hero from mechanics, name, and icon.",
    action: "Link some spells",
  },
  "fogged-vision": {
    label: "Fogged Vision",
    shortLabel: "Fogged",
    eyebrow: "Progressive reveal",
    description: "Recognize a hero through heavy fog before the portrait sharpens and the easy points disappear.",
    action: "Enter the fog",
  },
  "echo-hunt": {
    label: "Echo Hunt",
    shortLabel: "Echo",
    eyebrow: "Hero voices",
    description: "Identify a hero response as its opening fragment grows into a longer line.",
    action: "Hunt some echoes",
  },
  soundcheck: {
    label: "Soundcheck",
    shortLabel: "Soundcheck",
    eyebrow: "Audio recognition",
    description: "Identify real effects and item activations as short audio cuts grow longer.",
    action: "Enter soundcheck",
  },
  "quote-hunt": {
    label: "Quote Hunt",
    shortLabel: "Quotes",
    eyebrow: "Hero responses",
    description: "Read a real hero response and identify the speaker from their attitude, diction, and worldview.",
    action: "Read between the lines",
  },
  "aghanim-lab": {
    label: "Aghanim's Lab",
    shortLabel: "Aghanim's Lab",
    eyebrow: "Upgrade knowledge",
    description: "Match current Scepter and Shard effects to their heroes before the ability name appears.",
    action: "Enter the lab",
  },
  "order-up": {
    label: "Order Up",
    shortLabel: "Order Up",
    eyebrow: "Sort the facts",
    description: "Put four audited items or abilities in the right order before the clock runs out.",
    action: "Sort the cards",
  },
  flashback: {
    label: "Flashback",
    shortLabel: "Flashback",
    eyebrow: "History and TI",
    description: "Years, champions, cities, and the old map—nostalgia in 15 seconds.",
    action: "Open the archives",
  },
  "map-sense": {
    label: "Map Sense",
    shortLabel: "Map Sense",
    eyebrow: "Pinpoint the play",
    description: "Read map calls, block camps, stack neutrals, and solve compact battlefield decisions.",
    action: "Read the map",
  },
  counterplay: {
    label: "Counterplay",
    shortLabel: "Counterplay",
    eyebrow: "Mechanics check",
    description: "Read BKB, dispels, Linken's, Lotus, and Nullifier interactions before the fight is decided.",
    action: "Test your mechanics",
  },
};

function ModeIcon({ mode }: { mode: ArcadeMode | RoundGame }) {
  if (mode === "mixed") return <Shuffle />;
  if (mode === "shopkeeper") return <ShoppingBag />;
  if (mode === "spell-link") return <WandSparkles />;
  if (mode === "fogged-vision") return <ScanEye />;
  if (mode === "echo-hunt") return <AudioLines />;
  if (mode === "soundcheck") return <AudioWaveform />;
  if (mode === "quote-hunt") return <MessageSquareQuote />;
  if (mode === "aghanim-lab") return <Gem />;
  if (mode === "order-up") return <ListOrdered />;
  if (mode === "flashback") return <History />;
  if (mode === "map-sense") return <MapPin />;
  if (mode === "counterplay") return <ShieldCheck />;
  return <Brain />;
}

function gameLabel(game: RoundGame) {
  return MODE_INFO[game].label;
}

function normalizeCrowd(value: unknown): CrowdResult | null {
  if (!value || typeof value !== "object" || !("counts" in value) || !("total" in value)) return null;
  const { counts, total } = value;
  const positions =
    "positions" in value && Array.isArray(value.positions) ? value.positions.filter(isMapPosition).slice(-400) : [];
  const keyCounts =
    "keyCounts" in value && Array.isArray(value.keyCounts)
      ? value.keyCounts
          .filter((entry): entry is { answerKey: string; count: number } =>
            Boolean(
              entry &&
                typeof entry === "object" &&
                "answerKey" in entry &&
                typeof entry.answerKey === "string" &&
                (isShopkeeperCatalogKey(entry.answerKey) ||
                  isRecipeAnswerKey(entry.answerKey) ||
                  isHeroCatalogKey(entry.answerKey) ||
                  isValueOrderAnswerKey(entry.answerKey) ||
                  isFlashbackYearAnswerKey(entry.answerKey)) &&
                "count" in entry &&
                typeof entry.count === "number" &&
                Number.isInteger(entry.count) &&
                entry.count > 0,
            ),
          )
          .slice(0, SHOPKEEPER_CATALOG_ITEMS.length + HERO_PICKER_HEROES.length)
      : [];
  const rawScoreSummary = "scoreSummary" in value ? value.scoreSummary : undefined;
  const scoreSummary =
    rawScoreSummary === null
      ? null
      : rawScoreSummary &&
          typeof rawScoreSummary === "object" &&
          "correctCount" in rawScoreSummary &&
          typeof rawScoreSummary.correctCount === "number" &&
          Number.isInteger(rawScoreSummary.correctCount) &&
          rawScoreSummary.correctCount >= 0 &&
          "average" in rawScoreSummary &&
          (rawScoreSummary.average === null ||
            (typeof rawScoreSummary.average === "number" && Number.isInteger(rawScoreSummary.average))) &&
          "best" in rawScoreSummary &&
          (rawScoreSummary.best === null ||
            (typeof rawScoreSummary.best === "number" && Number.isInteger(rawScoreSummary.best))) &&
          "playerPoints" in rawScoreSummary &&
          (rawScoreSummary.playerPoints === null ||
            (typeof rawScoreSummary.playerPoints === "number" && Number.isInteger(rawScoreSummary.playerPoints)))
        ? {
            correctCount: rawScoreSummary.correctCount,
            average: rawScoreSummary.average,
            best: rawScoreSummary.best,
            playerPoints: rawScoreSummary.playerPoints,
          }
        : undefined;

  if (
    !Array.isArray(counts) ||
    counts.length !== 4 ||
    !counts.every((count) => typeof count === "number" && count >= 0) ||
    typeof total !== "number" ||
    total < 0 ||
    scoreSummary === undefined
  ) {
    return null;
  }

  return {
    counts: [counts[0], counts[1], counts[2], counts[3]],
    total,
    positions,
    keyCounts,
    scoreSummary,
  };
}

function normalizePlayerVote(value: unknown) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || !("answerIndex" in value) || !("submittedAt" in value)) {
    return undefined;
  }

  const { answerIndex, submittedAt } = value;
  const mapPosition = "mapPosition" in value ? value.mapPosition : undefined;
  const answerKey = "answerKey" in value ? value.answerKey : undefined;
  if (
    typeof answerIndex !== "number" ||
    !Number.isInteger(answerIndex) ||
    answerIndex < 0 ||
    answerIndex > 3 ||
    typeof submittedAt !== "number" ||
    !Number.isFinite(submittedAt) ||
    (answerKey !== undefined &&
      (typeof answerKey !== "string" ||
        (!isShopkeeperCatalogKey(answerKey) &&
          !isRecipeAnswerKey(answerKey) &&
          !isHeroCatalogKey(answerKey) &&
          !isValueOrderAnswerKey(answerKey) &&
          !isFlashbackYearAnswerKey(answerKey)))) ||
    (mapPosition !== undefined && !isMapPosition(mapPosition))
  ) {
    return undefined;
  }

  return {
    answerIndex,
    submittedAt,
    ...(answerKey ? { answerKey } : {}),
    ...(mapPosition ? { mapPosition } : {}),
  };
}

function normalizeRoomSnapshot(value: unknown): RoomSnapshot | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("serverNow" in value) ||
    !("room" in value) ||
    !("round" in value) ||
    !("questionRevision" in value) ||
    !("question" in value) ||
    !("presence" in value) ||
    !("crowd" in value) ||
    !("playerVote" in value) ||
    !("playerReport" in value)
  ) {
    return null;
  }

  const candidate = value as Partial<RoomSnapshot>;
  const room = candidate.room;
  const round = candidate.round;
  const question = candidate.question;
  const presence = candidate.presence;
  const crowd = normalizeCrowd(candidate.crowd);
  const playerVote = normalizePlayerVote(candidate.playerVote);
  const playerReport =
    candidate.playerReport === null
      ? null
      : isReportReason(candidate.playerReport)
        ? candidate.playerReport
        : undefined;

  if (
    typeof candidate.serverNow !== "number" ||
    !room ||
    typeof room.id !== "string" ||
    !GAME_IDS.includes(room.gameId) ||
    typeof room.contentVersion !== "string" ||
    room.mode !== PUBLIC_ARCADE_MODE ||
    room.filter !== "Mixed" ||
    !round ||
    typeof round.id !== "string" ||
    typeof round.number !== "number" ||
    (round.phase !== "answering" && round.phase !== "reveal") ||
    !ROUND_GAMES.includes(round.game) ||
    typeof round.startedAt !== "number" ||
    typeof round.answerDeadline !== "number" ||
    typeof round.revealDeadline !== "number" ||
    typeof round.answerDuration !== "number" ||
    typeof candidate.questionRevision !== "string" ||
    (question !== null && !isPublicArcadeQuestion(question)) ||
    (question !== null && (question.id !== round.id || question.game !== round.game)) ||
    (question !== null && round.phase === "answering" && question.reveal !== null) ||
    (question !== null && round.phase === "reveal" && question.reveal === null) ||
    !presence ||
    typeof presence.activePlayers !== "number" ||
    !Number.isInteger(presence.activePlayers) ||
    presence.activePlayers < 0 ||
    !crowd ||
    playerVote === undefined ||
    playerReport === undefined
  ) {
    return null;
  }

  return {
    serverNow: candidate.serverNow,
    room,
    round,
    questionRevision: candidate.questionRevision,
    question,
    presence,
    crowd,
    playerVote,
    playerReport,
  };
}

function normalizeVoteResult(value: unknown): VoteResult | null {
  if (!value || typeof value !== "object" || !("accepted" in value) || !("playerVote" in value)) return null;
  const crowd = normalizeCrowd(value);
  const playerVote = normalizePlayerVote(value.playerVote);
  if (typeof value.accepted !== "boolean" || playerVote === undefined || !crowd) return null;

  return {
    accepted: value.accepted,
    ...crowd,
    playerVote,
  };
}

function publicRoomQuery(settings: PublicRoomSettings, playerId: string, questionRevision?: string) {
  return new URLSearchParams({
    gameId: settings.gameId,
    mode: settings.mode,
    filter: settings.filter,
    playerId,
    ...(questionRevision ? { questionRevision } : {}),
  });
}

function accuracy(correct: number, answered: number) {
  return accuracyRate(correct, answered);
}

function QuestionArtwork({
  question,
  concealIdentity = false,
  imageOverride,
  testId = "question-artwork",
  className,
  fallbackLabel,
}: {
  question: PublicArcadeQuestion;
  concealIdentity?: boolean;
  imageOverride?: PublicArcadeQuestion["image"];
  testId?: string;
  className?: string;
  fallbackLabel?: string;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const image = imageOverride ?? question.image;
  const source = image?.src ?? "";
  const failed = failedSource === source;
  const loaded = loadedSource === source;

  if (!image) return null;

  return (
    <div
      data-testid={testId}
      data-artwork-state={failed ? "fallback" : loaded ? "loaded" : "loading"}
      className={clsx(
        styles.artwork,
        image.kind === "hero" && styles.heroArtwork,
        image.kind === "item" && styles.itemArtwork,
        className,
      )}
    >
      <div className={styles.artGlow} />
      {failed ? (
        <span className={styles.artFallback}>
          {concealIdentity ? "?" : (fallbackLabel ?? question.eyebrow).slice(0, 2).toUpperCase()}
        </span>
      ) : (
        <Image
          src={image.src}
          alt={concealIdentity ? "" : image.alt}
          fill
          sizes="(max-width: 700px) 112px, 150px"
          className={styles.artImage}
          onLoad={() => setLoadedSource(image.src)}
          onError={() => setFailedSource(image.src)}
          unoptimized
          priority
        />
      )}
      <span className={styles.artCorner} />
    </div>
  );
}

function AnswerArtwork({ src, alt, kind }: { src: string; alt: string; kind: TriviaArtworkKind }) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className={clsx(
        styles.answerArtwork,
        kind === "hero" && styles.answerHeroArtwork,
        kind === "ability" && styles.answerAbilityArtwork,
      )}
    >
      {failed ? (
        <span>{alt.slice(0, 2).toUpperCase()}</span>
      ) : (
        <Image
          src={src}
          alt=""
          fill
          sizes="(max-width: 680px) 62px, 88px"
          className={styles.answerArtworkImage}
          onError={() => setFailed(true)}
          unoptimized
        />
      )}
    </span>
  );
}

function ShopkeeperItem({ item, compact = false }: { item: ShopkeeperItemReference; compact?: boolean }) {
  return (
    <span className={clsx(styles.shopkeeperItem, compact && styles.shopkeeperItemCompact)}>
      <span className={styles.shopkeeperItemArt}>
        <Image src={item.image} alt="" fill sizes={compact ? "54px" : "82px"} unoptimized />
        {item.count > 1 && <b>×{item.count}</b>}
      </span>
      <strong>{item.name}</strong>
    </span>
  );
}

function ShopkeeperTray({
  items,
  compact = false,
  testId,
}: {
  items: ShopkeeperItemReference[];
  compact?: boolean;
  testId?: string;
}) {
  return (
    <span
      className={clsx(styles.shopkeeperTray, compact && styles.shopkeeperTrayCompact)}
      data-testid={testId}
      data-item-count={items.length}
      style={{ "--shopkeeper-item-count": Math.max(1, items.length) } as CSSProperties}
      aria-label={items.map((item) => `${item.name}${item.count > 1 ? ` times ${item.count}` : ""}`).join(", ")}
    >
      {items.map((item) => (
        <ShopkeeperItem key={item.key} item={item} compact={compact} />
      ))}
    </span>
  );
}

function ShopkeeperPick({ item, label }: { item: ShopkeeperCatalogItem | undefined; label: string }) {
  return (
    <span className={styles.shopkeeperPick}>
      <small>{label}</small>
      {item ? (
        <span>
          <Image src={item.image} alt="" width={54} height={40} unoptimized />
          <strong>{item.name}</strong>
        </span>
      ) : (
        <strong>No pick</strong>
      )}
    </span>
  );
}

function shopkeeperReferencesForKeys(itemKeys: string[]): ShopkeeperItemReference[] {
  const references: ShopkeeperItemReference[] = [];
  const referenceByKey = new Map<string, ShopkeeperItemReference>();

  for (const itemKey of itemKeys) {
    const item = SHOPKEEPER_CATALOG_BY_KEY.get(itemKey);
    if (!item) continue;
    const existing = referenceByKey.get(itemKey);
    if (existing) {
      existing.count += 1;
      continue;
    }
    const reference = { key: item.key, name: item.name, image: item.image, count: 1 };
    referenceByKey.set(itemKey, reference);
    references.push(reference);
  }

  return references;
}

function valueOrderAnswerLabel(question: PublicArcadeQuestion, answerKey: string) {
  const keys = valueOrderKeysFromAnswerKey(answerKey);
  if (!keys || !question.valueOrder) return null;
  const cardByKey = new Map(question.valueOrder.cards.map((card) => [card.key, card]));
  const cards = keys.map((key) => cardByKey.get(key));
  return cards.every(Boolean) ? cards.map((card) => card?.name).join(" → ") : null;
}

function keyedAnswerLabel(answerKey: string, fallback: string, question?: PublicArcadeQuestion) {
  const year = flashbackYearFromAnswerKey(answerKey);
  if (year !== null) return String(year);
  const recipeItems = recipeItemsFromAnswerKey(answerKey);
  if (recipeItems) {
    return shopkeeperReferencesForKeys(recipeItems)
      .map((item) => `${item.name}${item.count > 1 ? ` ×${item.count}` : ""}`)
      .join(", ");
  }
  if (question) {
    const orderLabel = valueOrderAnswerLabel(question, answerKey);
    if (orderLabel) return orderLabel;
  }
  return SHOPKEEPER_CATALOG_BY_KEY.get(answerKey)?.name ?? HERO_PICKER_BY_KEY.get(answerKey)?.name ?? fallback;
}

function CrowdSplitBar({
  marker,
  label,
  count,
  total,
  correct = false,
  selected = false,
}: {
  marker: ReactNode;
  label: string;
  count: number;
  total: number;
  correct?: boolean;
  selected?: boolean;
}) {
  const percentage = crowdPercentage(count, total);
  const status = [correct ? "correct answer" : "", selected ? "your pick" : ""].filter(Boolean).join(", ");

  return (
    <div
      className={styles.crowdSplitRow}
      data-testid="crowd-split-row"
      data-count={count}
      data-percentage={percentage}
      data-correct={correct ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
      style={{ "--crowd-share": `${percentage}%` } as CSSProperties}
      aria-label={`${label}: ${percentage}%${status ? `, ${status}` : ""}`}
    >
      <span className={styles.crowdSplitMeta}>
        <i className={styles.crowdSplitMarker}>{marker}</i>
        <strong title={label}>{label}</strong>
        {selected && <em>You</em>}
        {correct && <Check aria-label="Correct answer" />}
        <small>{percentage}%</small>
      </span>
      <span className={styles.crowdSplitTrack} aria-hidden="true">
        <i />
      </span>
    </div>
  );
}

function ChoiceCrowdSplit({
  question,
  crowd,
  selectedIndex,
}: {
  question: PublicArcadeQuestion;
  crowd: CrowdResult;
  selectedIndex: number | null;
}) {
  const correctIndex = publicCorrectIndex(question);

  return (
    <div className={styles.crowdSplit} data-testid="crowd-split" data-split-kind="choices" data-total={crowd.total}>
      {question.answers.map((answer, index) => (
        <CrowdSplitBar
          key={`${index}:${answer}`}
          marker={LETTERS[index]}
          label={answer}
          count={crowd.counts[index]}
          total={crowd.total}
          correct={correctIndex === index}
          selected={selectedIndex === index}
        />
      ))}
    </div>
  );
}

function KeyedCrowdSplit({
  question,
  crowd,
  selectedKey,
}: {
  question: PublicArcadeQuestion;
  crowd: CrowdResult;
  selectedKey: string | null;
}) {
  const correctKey = question.reveal?.correctAnswerKey ?? null;
  const split = keyedCrowdSplitRows(crowd.keyCounts, crowd.total, {
    correctKey,
    selectedKey,
    maxChoices: 4,
  });

  return (
    <div className={styles.crowdSplit} data-testid="crowd-split" data-split-kind="open-grid" data-total={crowd.total}>
      {split.rows.map(({ answerKey, count }) => {
        const hero = HERO_PICKER_BY_KEY.get(answerKey);
        const item = SHOPKEEPER_CATALOG_BY_KEY.get(answerKey);
        const recipeKeys = recipeItemsFromAnswerKey(answerKey);
        const recipeItems = recipeKeys ? shopkeeperReferencesForKeys(recipeKeys) : [];
        const orderKeys = valueOrderKeysFromAnswerKey(answerKey);
        const orderCards = orderKeys
          ?.map((key) => question.valueOrder?.cards.find((card) => card.key === key))
          .filter((card) => Boolean(card));
        const label = keyedAnswerLabel(answerKey, "Unknown pick", question);
        const marker =
          hero || item ? (
            <Image src={(hero ?? item)?.image ?? ""} alt="" fill sizes="34px" unoptimized />
          ) : orderCards?.length === 4 ? (
            <span className={styles.crowdSplitOrder} aria-hidden="true">
              {orderCards.map((card) => (
                <Image key={card?.key} src={card?.image ?? ""} alt="" width={18} height={18} unoptimized />
              ))}
            </span>
          ) : recipeItems.length ? (
            <span className={styles.crowdSplitRecipe} aria-hidden="true">
              {recipeItems.slice(0, 3).map((recipeItem) => (
                <Image key={recipeItem.key} src={recipeItem.image} alt="" width={20} height={15} unoptimized />
              ))}
            </span>
          ) : (
            "?"
          );

        return (
          <CrowdSplitBar
            key={answerKey}
            marker={marker}
            label={label}
            count={count}
            total={crowd.total}
            correct={answerKey === correctKey}
            selected={answerKey === selectedKey}
          />
        );
      })}
      {split.otherCount > 0 && (
        <CrowdSplitBar marker="…" label="Other picks" count={split.otherCount} total={crowd.total} />
      )}
    </div>
  );
}

type PublicValueOrderCard = NonNullable<PublicArcadeQuestion["valueOrder"]>["cards"][number];
const EMPTY_VALUE_ORDER_CARDS: PublicValueOrderCard[] = [];

function ValueOrderSequence({
  question,
  cardKeys,
  label,
  showValues = false,
}: {
  question: PublicArcadeQuestion;
  cardKeys: string[];
  label: string;
  showValues?: boolean;
}) {
  const cardByKey = new Map(question.valueOrder?.cards.map((card) => [card.key, card]) ?? []);
  const valueByKey = new Map(question.reveal?.orderValues?.map((entry) => [entry.key, entry.label]) ?? []);

  return (
    <div className={styles.valueOrderSequence} data-testid="value-order-sequence">
      <small>{label}</small>
      <div>
        {cardKeys.map((key, index) => {
          const card = cardByKey.get(key);
          if (!card) return null;
          return (
            <span key={key} className={styles.valueOrderSequenceCard} data-card-kind={card.kind}>
              <i>{index + 1}</i>
              <Image src={card.image} alt="" width={46} height={46} unoptimized />
              <strong>{card.name}</strong>
              {showValues && <em>{valueByKey.get(key) ?? "—"}</em>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ValueOrderBoard({
  question,
  phase,
  selectedKey,
  onChoose,
}: {
  question: PublicArcadeQuestion;
  phase: GamePhase;
  selectedKey: string | null;
  onChoose: (answerKey: string) => void;
}) {
  const submittedKeys = selectedKey ? valueOrderKeysFromAnswerKey(selectedKey) : null;
  const [draftKeys, setDraftKeys] = useState<string[]>(() => submittedKeys ?? []);
  const draftKeysRef = useRef(submittedKeys ?? []);
  const cards = question.valueOrder?.cards ?? EMPTY_VALUE_ORDER_CARDS;
  const activeKeys = submittedKeys ?? draftKeys;
  const locked = Boolean(selectedKey) || phase !== "answering";

  const submitOrder = useCallback(
    (keys: string[]) => {
      const answerKey = valueOrderAnswerKey(keys);
      if (answerKey && isValueOrderAnswerForQuestion(question, answerKey)) onChoose(answerKey);
    },
    [onChoose, question],
  );

  const toggleCard = useCallback(
    (card: PublicValueOrderCard) => {
      if (locked) return;
      const current = draftKeysRef.current;
      const next = current.includes(card.key)
        ? current.filter((key) => key !== card.key)
        : current.length < 4
          ? [...current, card.key]
          : current;
      draftKeysRef.current = next;
      setDraftKeys(next);
      if (next.length === 4 && current.length === 3) submitOrder(next);
    },
    [locked, submitOrder],
  );

  const undoLastCard = useCallback(() => {
    if (locked) return;
    const next = draftKeysRef.current.slice(0, -1);
    draftKeysRef.current = next;
    setDraftKeys(next);
  }, [locked]);

  useEffect(() => {
    if (phase !== "answering" || locked) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const cardIndex = Number(event.key) - 1;
      if (cardIndex >= 0 && cardIndex < cards.length) {
        event.preventDefault();
        toggleCard(cards[cardIndex]);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        undoLastCard();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cards, locked, phase, toggleCard, undoLastCard]);

  if (phase === "reveal") {
    const correctKeys = valueOrderKeysFromAnswerKey(question.reveal?.correctAnswerKey) ?? [];
    const selectedWasCorrect = Boolean(selectedKey && selectedKey === question.reveal?.correctAnswerKey);
    return (
      <div className={styles.valueOrderReveal} data-testid="value-order-board" data-phase="reveal">
        <ValueOrderSequence question={question} cardKeys={correctKeys} label="Correct order" showValues />
        {submittedKeys && !selectedWasCorrect && (
          <ValueOrderSequence question={question} cardKeys={submittedKeys} label="Your order" />
        )}
      </div>
    );
  }

  return (
    <div
      className={styles.valueOrderBoard}
      data-testid="value-order-board"
      data-phase="answering"
      data-locked={selectedKey ? "true" : "false"}
    >
      <div className={styles.valueOrderSlots} aria-label="Your order">
        {Array.from({ length: 4 }, (_, index) => {
          const key = activeKeys[index];
          const card = cards.find((candidate) => candidate.key === key);
          return (
            <span key={index} data-filled={card ? "true" : "false"} data-card-kind={card?.kind}>
              <i>{index + 1}</i>
              {card ? (
                <>
                  <Image src={card.image} alt="" width={42} height={42} unoptimized />
                  <strong>{card.name}</strong>
                </>
              ) : (
                <em>—</em>
              )}
            </span>
          );
        })}
      </div>

      <div className={styles.valueOrderCards} role="group" aria-label="Cards to order">
        {cards.map((card, cardIndex) => {
          const position = activeKeys.indexOf(card.key);
          return (
            <button
              key={card.key}
              type="button"
              data-testid="value-order-card"
              data-card-kind={card.kind}
              data-selected={position >= 0 ? "true" : "false"}
              disabled={locked}
              onClick={() => toggleCard(card)}
              aria-label={`${cardIndex + 1}. ${card.context ? `${card.context}, ` : ""}${card.name}`}
              aria-pressed={position >= 0}
            >
              {position >= 0 && <i>{position + 1}</i>}
              <Image src={card.image} alt="" width={72} height={72} unoptimized />
              <span>
                {card.context && <small>{card.context}</small>}
                <strong>{card.name}</strong>
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.valueOrderControls}>
        <button
          type="button"
          onClick={undoLastCard}
          disabled={locked || draftKeys.length === 0}
          aria-label="Undo last card"
        >
          <RotateCcw />
          Undo
        </button>
      </div>
    </div>
  );
}

function FlashbackYearBoard({
  question,
  phase,
  selectedKey,
  onChoose,
}: {
  question: PublicArcadeQuestion;
  phase: GamePhase;
  selectedKey: string | null;
  onChoose: (answerKey: string) => void;
}) {
  const yearMin = Number(question.flashback?.yearMin);
  const yearMax = Number(question.flashback?.yearMax);
  const hasRange = Number.isInteger(yearMin) && Number.isInteger(yearMax) && yearMax >= yearMin;
  const lockedYear = selectedKey ? flashbackYearFromAnswerKey(selectedKey) : null;
  const correctYear = phase === "reveal" ? flashbackYearFromAnswerKey(question.reveal?.correctAnswerKey) : null;
  const locked = Boolean(selectedKey) || phase !== "answering";
  const midpoint = hasRange ? yearMin + Math.floor((yearMax - yearMin) / 2) : null;
  const [cursorYear, setCursorYear] = useState<number | null>(lockedYear ?? midpoint);

  const commitYear = useCallback(
    (year: number) => {
      if (locked || !Number.isInteger(year)) return;
      const answerKey = flashbackYearAnswerKey(year);
      if (!answerKey) return;
      setCursorYear(year);
      onChoose(answerKey);
    },
    [locked, onChoose],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (locked || !hasRange) return;
      if (event.key === "Enter" || event.key === " ") {
        const year = cursorYear ?? midpoint;
        if (year === null) return;
        event.preventDefault();
        commitYear(year);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commitYear, cursorYear, hasRange, locked, midpoint]);

  const shownYear = lockedYear ?? cursorYear ?? midpoint;

  return (
    <div
      className={styles.flashbackYearBoard}
      data-testid="flashback-year-board"
      data-phase={phase}
      data-locked={locked ? "true" : "false"}
      data-correct-year={correctYear ?? ""}
    >
      <strong data-testid="flashback-year-readout">{shownYear ?? "Year"}</strong>
      {hasRange ? (
        <>
          <input
            className={styles.flashbackYearSlider}
            type="range"
            min={yearMin}
            max={yearMax}
            step={1}
            value={shownYear ?? midpoint ?? yearMin}
            disabled={locked}
            aria-label="Year"
            data-testid="flashback-year-slider"
            onInput={(event) => setCursorYear(Number(event.currentTarget.value))}
          />
          <div className={styles.flashbackYearEnds}>
            <span>{yearMin}</span>
            <span>{yearMax}</span>
          </div>
          <button
            type="button"
            className={styles.flashbackYearLock}
            data-testid="flashback-year-lock"
            disabled={locked || shownYear == null}
            onClick={() => {
              if (shownYear != null) commitYear(shownYear);
            }}
          >
            Lock year
          </button>
        </>
      ) : null}
    </div>
  );
}

function FlashbackOrderBoard({
  question,
  phase,
  selectedKey,
  onChoose,
}: {
  question: PublicArcadeQuestion;
  phase: GamePhase;
  selectedKey: string | null;
  onChoose: (answerKey: string) => void;
}) {
  const submittedKeys = selectedKey ? valueOrderKeysFromAnswerKey(selectedKey) : null;
  const [draftKeys, setDraftKeys] = useState<string[]>(() => submittedKeys ?? []);
  const draftKeysRef = useRef(submittedKeys ?? []);
  const cards = question.flashback?.cards ?? [];
  const activeKeys = submittedKeys ?? draftKeys;
  const locked = Boolean(selectedKey) || phase !== "answering";

  const submitOrder = useCallback(
    (keys: string[]) => {
      const answerKey = valueOrderAnswerKey(keys);
      if (answerKey && isFlashbackOrderAnswerForQuestion(question, answerKey)) onChoose(answerKey);
    },
    [onChoose, question],
  );

  const toggleCard = useCallback(
    (cardKey: string) => {
      if (locked) return;
      const current = draftKeysRef.current;
      const next = current.includes(cardKey)
        ? current.filter((key) => key !== cardKey)
        : current.length < 4
          ? [...current, cardKey]
          : current;
      draftKeysRef.current = next;
      setDraftKeys(next);
      if (next.length === 4 && current.length === 3) submitOrder(next);
    },
    [locked, submitOrder],
  );

  const undoLastCard = useCallback(() => {
    if (locked) return;
    const next = draftKeysRef.current.slice(0, -1);
    draftKeysRef.current = next;
    setDraftKeys(next);
  }, [locked]);

  if (phase === "reveal") {
    const correctKeys = valueOrderKeysFromAnswerKey(question.reveal?.correctAnswerKey) ?? [];
    const selectedWasCorrect = Boolean(selectedKey && selectedKey === question.reveal?.correctAnswerKey);
    return (
      <div className={styles.flashbackOrderBoard} data-testid="flashback-order-board" data-phase="reveal">
        <ol className={styles.flashbackOrderList} data-testid="flashback-order-sequence">
          {correctKeys.map((key, index) => {
            const card = cards.find((candidate) => candidate.key === key);
            return (
              <li key={key} data-correct="true">
                <i>{index + 1}</i>
                {card?.image ? <Image src={card.image} alt="" width={36} height={36} unoptimized /> : null}
                <span>
                  <strong>{card?.name ?? key}</strong>
                  {card?.context ? <small>{card.context}</small> : null}
                </span>
              </li>
            );
          })}
        </ol>
        {submittedKeys && !selectedWasCorrect && (
          <ol className={styles.flashbackOrderList} data-yours="true">
            {submittedKeys.map((key, index) => {
              const card = cards.find((candidate) => candidate.key === key);
              return (
                <li key={key}>
                  <i>{index + 1}</i>
                  {card?.image ? <Image src={card.image} alt="" width={36} height={36} unoptimized /> : null}
                  <span>
                    <strong>{card?.name ?? key}</strong>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    );
  }

  return (
    <div
      className={styles.flashbackOrderBoard}
      data-testid="flashback-order-board"
      data-phase="answering"
      data-locked={selectedKey ? "true" : "false"}
    >
      <div className={styles.flashbackOrderSlots} aria-label="Your order">
        {Array.from({ length: 4 }, (_, index) => {
          const key = activeKeys[index];
          const card = cards.find((candidate) => candidate.key === key);
          return (
            <span key={index} data-filled={card ? "true" : "false"}>
              <i>{index + 1}</i>
              {card?.image ? (
                <Image src={card.image} alt="" width={28} height={28} unoptimized />
              ) : (
                <span className={styles.flashbackOrderSlotArt} aria-hidden="true" />
              )}
              {card ? <strong>{card.name}</strong> : <em>—</em>}
            </span>
          );
        })}
      </div>
      <div className={styles.flashbackOrderCards} role="group" aria-label="Events to order">
        {cards.map((card) => {
          const position = activeKeys.indexOf(card.key);
          return (
            <button
              key={card.key}
              type="button"
              data-testid="flashback-order-card"
              data-selected={position >= 0 ? "true" : "false"}
              disabled={locked}
              onClick={() => toggleCard(card.key)}
              aria-pressed={position >= 0}
            >
              <i data-empty={position < 0 ? "true" : "false"}>{position >= 0 ? position + 1 : ""}</i>
              {card.image ? (
                <span className={styles.flashbackOrderCardArt}>
                  <Image src={card.image} alt="" width={72} height={72} unoptimized />
                </span>
              ) : null}
              <strong>{card.name}</strong>
              {card.context ? <small>{card.context}</small> : null}
            </button>
          );
        })}
      </div>
      <div className={styles.valueOrderControls}>
        <button
          type="button"
          onClick={undoLastCard}
          disabled={locked || draftKeys.length === 0}
          aria-label="Undo last card"
        >
          <RotateCcw />
          Undo
        </button>
      </div>
    </div>
  );
}

function ShopkeeperRecipePick({
  itemKeys,
  label,
  recipeIncluded = false,
}: {
  itemKeys: string[];
  label: string;
  recipeIncluded?: boolean;
}) {
  const items = shopkeeperReferencesForKeys(itemKeys);
  return (
    <span className={styles.shopkeeperRecipePick}>
      <small>{label}</small>
      {items.length ? (
        <span className={styles.shopkeeperRecipeRevealRow}>
          <ShopkeeperTray items={items} compact testId="shopkeeper-recipe-reveal-tray" />
          {recipeIncluded ? (
            <span className={styles.shopkeeperRecipeIncluded} data-testid="shopkeeper-recipe-included">
              <Image src={SHOPKEEPER_RECIPE_IMAGE} alt="" width={36} height={27} unoptimized />
              <small>Included</small>
            </span>
          ) : null}
        </span>
      ) : (
        <strong>No build</strong>
      )}
    </span>
  );
}

function ShopkeeperStore({
  question,
  phase,
  selectedKey,
  crowd,
  onChoose,
}: {
  question: PublicArcadeQuestion;
  phase: GamePhase;
  selectedKey: string | null;
  crowd: CrowdResult;
  onChoose: (itemKey: string) => void;
}) {
  const [section, setSection] = useState<"basics" | "upgrades">("upgrades");
  const [query, setQuery] = useState("");
  const [tooltip, setTooltip] = useState<{
    item: ShopkeeperCatalogItem;
    left: number;
    top: number;
    width: number;
    placement: "above" | "below";
  } | null>(null);
  const recipeBuilder = isPublicRecipeBuilderQuestion(question);
  const recipeSize = recipeBuilder ? (question.shopkeeper?.recipeSize ?? 0) : 0;
  const submittedRecipeKeys = recipeItemsFromAnswerKey(selectedKey) ?? [];
  const [draftRecipeKeys, setDraftRecipeKeys] = useState<string[]>(() => submittedRecipeKeys);
  const activeRecipeKeys = selectedKey ? submittedRecipeKeys : draftRecipeKeys;
  const targetKey = question.reveal?.correctAnswerKey;
  const correctRecipeKeys = recipeItemsFromAnswerKey(targetKey) ?? [];
  const targetItem = !recipeBuilder && targetKey ? SHOPKEEPER_CATALOG_BY_KEY.get(targetKey) : undefined;
  const selectedItem = selectedKey ? SHOPKEEPER_CATALOG_BY_KEY.get(selectedKey) : undefined;
  const queryRef = useRef(query);
  queryRef.current = query;
  const storeRef = useRef<HTMLDivElement | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
  const countByItem = new Map(crowd.keyCounts.map((entry) => [entry.answerKey, entry.count]));
  const searchItems = normalizedQuery
    ? SHOPKEEPER_CATALOG_ITEMS.filter(
        (item) => item.name.toLocaleLowerCase("en-US").includes(normalizedQuery) || item.key.includes(normalizedQuery),
      )
    : [];
  const groups = normalizedQuery
    ? [{ key: "search", label: `${searchItems.length} found`, section, items: searchItems }]
    : SHOPKEEPER_CATALOG.groups.filter((group) => group.section === section);

  const chooseItem = (itemKey: string) => {
    setQuery("");
    setTooltip(null);
    onChoose(itemKey);
  };

  const addRecipeItem = (itemKey: string) => {
    setQuery("");
    setTooltip(null);
    setDraftRecipeKeys((itemKeys) => (itemKeys.length < recipeSize ? [...itemKeys, itemKey] : itemKeys));
  };

  const removeRecipeItem = (slot: number) => {
    setTooltip(null);
    setDraftRecipeKeys((itemKeys) => itemKeys.filter((_, index) => index !== slot));
  };

  const submitRecipe = () => {
    if (draftRecipeKeys.length !== recipeSize) return;
    const answerKey = recipeAnswerKeyForItems(draftRecipeKeys);
    if (!answerKey) return;
    setQuery("");
    setTooltip(null);
    onChoose(answerKey);
  };

  const showItemTooltip = (item: ShopkeeperCatalogItem, button: HTMLButtonElement) => {
    const bounds = button.getBoundingClientRect();
    const viewportPadding = 8;
    const width = Math.min(190, window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      window.innerWidth - width - viewportPadding,
      Math.max(viewportPadding, bounds.left + bounds.width / 2 - width / 2),
    );
    const placement = bounds.bottom + 72 <= window.innerHeight || bounds.top < 80 ? "below" : "above";
    setTooltip({
      item,
      left,
      top: placement === "below" ? bounds.bottom + 7 : bounds.top - 7,
      width,
      placement,
    });
  };

  useEffect(() => {
    if (phase !== "answering" || selectedKey !== null) return;

    const startSearching = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (storeRef.current?.closest("[inert]")) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "Escape") {
        setQuery("");
        setTooltip(null);
        return;
      }
      if (event.key === "Backspace" && queryRef.current) {
        event.preventDefault();
        setTooltip(null);
        setQuery((value) => value.slice(0, -1));
        return;
      }
      if (event.key.length !== 1 || (!queryRef.current && event.key.trim() === "")) return;

      event.preventDefault();
      setTooltip(null);
      setQuery((value) => `${value}${event.key}`);
    };

    window.addEventListener("keydown", startSearching);
    return () => window.removeEventListener("keydown", startSearching);
  }, [phase, selectedKey]);

  useEffect(() => {
    if (!tooltip) return;
    const hideTooltip = () => setTooltip(null);
    window.addEventListener("resize", hideTooltip);
    window.addEventListener("scroll", hideTooltip, true);
    return () => {
      window.removeEventListener("resize", hideTooltip);
      window.removeEventListener("scroll", hideTooltip, true);
    };
  }, [tooltip]);

  return (
    <>
      <div
        ref={storeRef}
        className={styles.shopkeeperStore}
        data-testid="shopkeeper-store"
        data-phase={phase}
        data-answer-mode={question.answerMode}
        data-locked={selectedKey ? "true" : "false"}
      >
        <div className={styles.shopkeeperStoreToolbar}>
          <div className={styles.shopkeeperStoreTabs} role="tablist" aria-label="Shop section">
            {(["basics", "upgrades"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={section === tab}
                data-testid={`shopkeeper-tab-${tab}`}
                onClick={() => {
                  setTooltip(null);
                  setSection(tab);
                }}
              >
                {tab}
              </button>
            ))}
          </div>
          <label className={styles.shopSearchBox} data-focused={normalizedQuery ? "true" : "false"}>
            <Search aria-hidden="true" />
            <input
              data-testid="shopkeeper-search-field"
              type="text"
              value={query}
              placeholder={DOTA_SHOP_SEARCH_PLACEHOLDER}
              autoComplete="off"
              spellCheck={false}
              disabled={phase !== "answering" || selectedKey !== null}
              onChange={(event) => {
                setTooltip(null);
                setQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setQuery("");
                  setTooltip(null);
                }
              }}
            />
          </label>
        </div>
        <div
          className={styles.quickSearch}
          data-testid="shopkeeper-search"
          data-query={query}
          data-active="false"
          aria-live="polite"
        >
          {query}
        </div>

        {recipeBuilder && phase === "answering" && (
          <div
            className={styles.shopkeeperRecipeBuilder}
            data-testid="shopkeeper-recipe-builder"
            data-recipe-size={recipeSize}
            data-selection-count={activeRecipeKeys.length}
          >
            <span className={styles.shopkeeperRecipeBuilderLabel}>
              <small>Shop items</small>
              <strong>
                {activeRecipeKeys.length}/{recipeSize}
              </strong>
            </span>
            <div className={styles.shopkeeperRecipeSlots}>
              {Array.from({ length: recipeSize }, (_, slot) => {
                const itemKey = activeRecipeKeys[slot];
                const item = itemKey ? SHOPKEEPER_CATALOG_BY_KEY.get(itemKey) : undefined;
                return item ? (
                  <button
                    key={`${slot}:${itemKey}`}
                    type="button"
                    data-testid="shopkeeper-recipe-slot"
                    data-item-key={item.key}
                    aria-label={`Remove ${item.name}`}
                    onClick={() => removeRecipeItem(slot)}
                    disabled={selectedKey !== null}
                  >
                    <Image src={item.image} alt="" fill sizes="58px" unoptimized />
                    <X aria-hidden="true" />
                  </button>
                ) : (
                  <span key={slot} data-testid="shopkeeper-recipe-slot" data-empty="true" aria-hidden="true">
                    +
                  </span>
                );
              })}
              <span className={styles.shopkeeperRecipeIncluded} data-testid="shopkeeper-recipe-included">
                <Image src={SHOPKEEPER_RECIPE_IMAGE} alt="" width={36} height={27} unoptimized />
                <small>Included</small>
              </span>
            </div>
            <button
              type="button"
              className={styles.shopkeeperBuildButton}
              data-testid="shopkeeper-recipe-build"
              onClick={submitRecipe}
              disabled={selectedKey !== null || activeRecipeKeys.length !== recipeSize}
            >
              <Check aria-hidden="true" />
              {selectedKey ? "Locked" : "Build"}
            </button>
          </div>
        )}

        {phase === "reveal" && recipeBuilder ? (
          <div className={styles.shopkeeperRecipeReveal} data-testid="shopkeeper-open-reveal">
            <ShopkeeperRecipePick itemKeys={submittedRecipeKeys} label="Your items" />
            <ArrowRight aria-hidden="true" />
            <ShopkeeperRecipePick itemKeys={correctRecipeKeys} label="Correct items" recipeIncluded />
          </div>
        ) : phase === "reveal" ? (
          <div className={styles.shopkeeperRevealPicks} data-testid="shopkeeper-open-reveal">
            <ShopkeeperPick item={selectedItem} label="Your pick" />
            <ArrowRight aria-hidden="true" />
            <ShopkeeperPick
              item={targetItem}
              label={
                question.soundcheck?.family === "item"
                  ? "Sound source"
                  : question.shopkeeper?.format === "upgrade-path"
                    ? "Direct upgrade"
                    : "Build result"
              }
            />
          </div>
        ) : null}

        <div
          className={clsx(styles.shopkeeperGroups, normalizedQuery && styles.shopkeeperSearchResults)}
          data-testid="shopkeeper-groups"
          data-shop-section={section}
          data-searching={normalizedQuery ? "true" : "false"}
          data-item-count={
            normalizedQuery ? searchItems.length : groups.reduce((count, group) => count + group.items.length, 0)
          }
          onScroll={() => setTooltip(null)}
        >
          {normalizedQuery && searchItems.length === 0 ? (
            <p className={styles.shopkeeperNoResults}>No shop item matches “{query.trim()}”.</p>
          ) : (
            groups.map((group) => (
              <section key={group.key} className={styles.shopkeeperGroup} aria-label={group.label}>
                <h3>{group.label}</h3>
                <div>
                  {group.items.map((item) => {
                    const selectedCount = recipeBuilder
                      ? activeRecipeKeys.filter((itemKey) => itemKey === item.key).length
                      : selectedKey === item.key
                        ? 1
                        : 0;
                    const correctCount = recipeBuilder
                      ? correctRecipeKeys.filter((itemKey) => itemKey === item.key).length
                      : targetKey === item.key
                        ? 1
                        : 0;
                    const isSelected = selectedCount > 0;
                    const isCorrect = phase === "reveal" && correctCount > 0;
                    const count = countByItem.get(item.key) ?? 0;
                    const percentage = crowd.total ? Math.round((count / crowd.total) * 100) : 0;
                    const state = isCorrect
                      ? "correct"
                      : phase === "reveal" && isSelected
                        ? "wrong"
                        : isSelected
                          ? "selected"
                          : "idle";

                    return (
                      <button
                        key={item.key}
                        type="button"
                        data-testid="shopkeeper-store-item"
                        data-item-key={item.key}
                        data-state={state}
                        data-pick-count={selectedCount}
                        onClick={() => (recipeBuilder ? addRecipeItem(item.key) : chooseItem(item.key))}
                        onPointerEnter={(event) => showItemTooltip(item, event.currentTarget)}
                        onPointerLeave={() => setTooltip(null)}
                        onFocus={(event) => showItemTooltip(item, event.currentTarget)}
                        onBlur={() => setTooltip(null)}
                        disabled={
                          phase !== "answering" ||
                          selectedKey !== null ||
                          (recipeBuilder && activeRecipeKeys.length >= recipeSize)
                        }
                        aria-label={`${item.name}, ${item.cost.toLocaleString("en-US")} gold`}
                        aria-describedby={tooltip?.item.key === item.key ? "shopkeeper-item-tooltip" : undefined}
                        aria-pressed={isSelected}
                      >
                        <Image src={item.image} alt="" fill sizes="48px" loading="eager" unoptimized />
                        {recipeBuilder && selectedCount > 0 ? (
                          <i>×{selectedCount}</i>
                        ) : phase === "reveal" && count > 0 ? (
                          <i>{percentage}%</i>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id="shopkeeper-item-tooltip"
            role="tooltip"
            className={styles.shopkeeperTooltip}
            data-testid="shopkeeper-item-tooltip"
            data-placement={tooltip.placement}
            style={{ left: tooltip.left, top: tooltip.top, width: tooltip.width }}
          >
            <strong>{tooltip.item.name}</strong>
            <small>{tooltip.item.cost.toLocaleString("en-US")} gold</small>
          </div>,
          document.body,
        )}
    </>
  );
}

const HERO_ATTRIBUTE_ICONS = {
  strength: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/hero_strength.png",
  agility: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/hero_agility.png",
  intelligence: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/hero_intelligence.png",
  universal: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/hero_universal.png",
} satisfies Record<(typeof HERO_PICKER_CATALOG.groups)[number]["key"], string>;

function HeroPickerPortrait({ hero }: { hero: HeroPickerHero }) {
  return <Image src={hero.image} alt="" fill sizes="44px" loading="eager" unoptimized />;
}

function HeroPicker({
  question,
  phase,
  selectedKey,
  crowd,
  onChoose,
}: {
  question: PublicArcadeQuestion;
  phase: GamePhase;
  selectedKey: string | null;
  crowd: CrowdResult;
  onChoose: (heroKey: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [searchFlash, setSearchFlash] = useState(false);
  const queryRef = useRef(query);
  queryRef.current = query;
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const targetKey = question.reveal?.correctAnswerKey;
  const countByHero = new Map(crowd.keyCounts.map((entry) => [entry.answerKey, entry.count]));
  const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
  const heroMatches = (hero: HeroPickerHero) => {
    if (!normalizedQuery) return true;
    const name = hero.name.toLocaleLowerCase("en-US");
    const slug = hero.key.replace(/^npc_dota_hero_/, "").replaceAll("_", " ");
    const initials = name
      .split(/\s+/)
      .map((part) => part[0])
      .join("");
    return name.includes(normalizedQuery) || slug.includes(normalizedQuery) || initials.startsWith(normalizedQuery);
  };
  const chooseHero = (heroKey: string) => {
    setQuery("");
    onChoose(heroKey);
  };

  useEffect(() => {
    if (phase !== "answering" || selectedKey !== null) return;

    const startSearching = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (pickerRef.current?.closest("[inert]")) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "Escape") {
        setQuery("");
        return;
      }
      if (event.key === "Backspace" && queryRef.current) {
        event.preventDefault();
        setQuery((value) => value.slice(0, -1));
        return;
      }
      if (event.key.length !== 1 || (!queryRef.current && event.key.trim() === "")) return;

      event.preventDefault();
      setQuery((value) => `${value}${event.key}`);
    };

    window.addEventListener("keydown", startSearching);
    return () => window.removeEventListener("keydown", startSearching);
  }, [phase, selectedKey]);

  useEffect(() => {
    if (!normalizedQuery) {
      setSearchFlash(false);
      return;
    }
    setSearchFlash(true);
    const timeout = window.setTimeout(() => setSearchFlash(false), 1_500);
    return () => window.clearTimeout(timeout);
  }, [normalizedQuery, query]);

  return (
    <div
      ref={pickerRef}
      className={styles.heroPicker}
      data-testid="hero-picker"
      data-phase={phase}
      data-locked={selectedKey ? "true" : "false"}
      data-searching={normalizedQuery ? "true" : "false"}
      style={{ "--hero-grid-columns": HERO_PICKER_CATALOG.columns } as CSSProperties}
    >
      <div
        className={styles.quickSearch}
        data-testid="hero-search"
        data-query={query}
        data-active={searchFlash ? "true" : "false"}
        aria-live="polite"
      >
        {query}
      </div>
      <div className={styles.heroPickerBoard}>
        {HERO_PICKER_CATALOG.groups.map((group) => (
          <section
            key={group.key}
            className={styles.heroPickerGroup}
            data-attribute={group.key}
            data-hero-count={group.heroes.length}
            aria-label={`${group.label} heroes`}
          >
            <h3>
              <Image src={HERO_ATTRIBUTE_ICONS[group.key]} alt="" width={18} height={18} unoptimized />
              {group.label}
            </h3>
            <div>
              {group.heroes.map((hero) => {
                const isSearchMatch = heroMatches(hero);
                const isSelected = selectedKey === hero.key;
                const isCorrect = phase === "reveal" && targetKey === hero.key;
                const count = countByHero.get(hero.key) ?? 0;
                const percentage = crowd.total ? Math.round((count / crowd.total) * 100) : 0;
                const state = isCorrect
                  ? "correct"
                  : phase === "reveal" && isSelected
                    ? "wrong"
                    : isSelected
                      ? "selected"
                      : "idle";

                return (
                  <button
                    key={hero.key}
                    type="button"
                    data-testid="hero-picker-hero"
                    data-hero-key={hero.key}
                    data-state={state}
                    data-search-match={isSearchMatch ? "true" : "false"}
                    title={hero.name}
                    aria-label={hero.name}
                    aria-pressed={isSelected}
                    disabled={phase !== "answering" || selectedKey !== null}
                    onClick={() => chooseHero(hero.key)}
                  >
                    <HeroPickerPortrait hero={hero} />
                    {phase === "reveal" && count > 0 && <i>{percentage}%</i>}
                    {phase === "reveal" && (isCorrect || isSelected) && (
                      <span className={styles.heroPickerVerdict} aria-hidden="true">
                        {isCorrect ? <Check /> : <X />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function classicQuestionContext(question: PublicArcadeQuestion) {
  if (question.kind !== "ability-detective") return null;
  return question.eyebrow.split("·", 1)[0]?.trim() || null;
}

function shopkeeperAnswerAction(question: PublicArcadeQuestion) {
  if (question.shopkeeper?.format === "build-result") return "Choose the finished item";
  if (question.shopkeeper?.format === "real-recipe") return "Pick the shop items. Recipe is included.";
  if (question.shopkeeper?.format === "shared-part") return "Choose the shared component";
  return "Choose the direct upgrade";
}

function percentagePosition(position: MapPosition) {
  return {
    left: `${position.x * 100}%`,
    top: `${position.y * 100}%`,
  } satisfies CSSProperties;
}

function MapTerrainCrop({ crop }: { crop: MapCrop }) {
  const imageStyle = {
    width: `${crop.zoom * 100}%`,
    height: `${crop.zoom * 100}%`,
    left: `${50 - crop.center.x * crop.zoom * 100}%`,
    top: `${50 - crop.center.y * crop.zoom * 100}%`,
  } satisfies CSSProperties;

  return (
    <div
      className={styles.mapTerrainCrop}
      data-testid="map-terrain-crop"
      data-treatment={crop.treatment}
      role="img"
      aria-label="Battlefield close-up. Match the point under the center reticle on the full map."
    >
      <Image
        src={MAP_SENSE_IMAGE}
        alt=""
        width={512}
        height={512}
        sizes="190px"
        className={styles.mapTerrainCropImage}
        style={imageStyle}
        unoptimized
      />
      <span aria-hidden="true">
        <Crosshair />
      </span>
    </div>
  );
}

function viewportPosition(position: MapPosition, viewport: MapViewport): MapPosition {
  return {
    x: 0.5 + (position.x - viewport.center.x) * viewport.zoom,
    y: 0.5 + (position.y - viewport.center.y) * viewport.zoom,
  };
}

function viewportImageStyle(viewport: MapViewport) {
  return {
    width: `${viewport.zoom * 100}%`,
    height: `${viewport.zoom * 100}%`,
    left: `${50 - viewport.center.x * viewport.zoom * 100}%`,
    top: `${50 - viewport.center.y * viewport.zoom * 100}%`,
  } satisfies CSSProperties;
}

function viewportBoundsStyle(bounds: MapBounds, viewport: MapViewport) {
  const minimum = viewportPosition(bounds.min, viewport);
  const maximum = viewportPosition(bounds.max, viewport);
  return {
    left: `${minimum.x * 100}%`,
    top: `${minimum.y * 100}%`,
    width: `${(maximum.x - minimum.x) * 100}%`,
    height: `${(maximum.y - minimum.y) * 100}%`,
  } satisfies CSSProperties;
}

function fullMapViewportStyle(viewport: MapViewport) {
  const size = 1 / viewport.zoom;
  return {
    left: `${(viewport.center.x - size / 2) * 100}%`,
    top: `${(viewport.center.y - size / 2) * 100}%`,
    width: `${size * 100}%`,
    height: `${size * 100}%`,
  } satisfies CSSProperties;
}

function MapContextLocator({
  camp,
  viewport,
}: {
  camp: NonNullable<MapChoiceChallenge["camp"]>;
  viewport: MapViewport;
}) {
  return (
    <div
      className={styles.mapContextLocator}
      data-testid="map-context-locator"
      data-side={camp.side}
      role="img"
      aria-label={`${camp.side} ${camp.tier} camp location on the full Dota map`}
    >
      <Image
        src={MAP_SENSE_IMAGE}
        alt=""
        width={96}
        height={96}
        sizes="96px"
        className={styles.mapContextImage}
        unoptimized
      />
      <span className={styles.mapContextViewport} style={fullMapViewportStyle(viewport)} aria-hidden="true" />
      <i className={styles.mapContextCamp} style={percentagePosition(camp.position)} aria-hidden="true" />
    </div>
  );
}

function MapMechanicCard({ choice }: { choice: MapChoiceChallenge }) {
  const camp = choice.camp;
  const side = choice.options.find((option) => option.side)?.side;

  return (
    <div className={styles.mapMechanicCard} data-testid={`map-${choice.kind}-card`} data-kind={choice.kind}>
      {camp ? (
        <MapContextLocator camp={camp} viewport={choice.viewport} />
      ) : (
        <span aria-hidden="true">{choice.kind === "stack-route" ? <Clock3 /> : <MapPin />}</span>
      )}
      <div className={styles.mapMechanicCopy}>
        <small>
          {choice.kind === "camp-block"
            ? `${camp?.side} jungle · spawn :00`
            : choice.kind === "stack-route"
              ? `${camp?.side} jungle · ${camp?.tier} camp`
              : `${side} rotation`}
        </small>
        <strong>
          {choice.kind === "camp-block"
            ? `${camp?.tier} camp`
            : choice.kind === "stack-route"
              ? `:${camp?.stack.start}–:${camp?.stack.end}`
              : "4 live towers"}
        </strong>
      </div>
    </div>
  );
}

function MapSenseBoard({
  question,
  phase,
  selectedIndex,
  selectedPosition,
  crowd,
  onChoosePosition,
  onChooseIndex,
}: {
  question: PublicArcadeQuestion;
  phase: GamePhase;
  selectedIndex: number | null;
  selectedPosition: MapPosition | null;
  crowd: CrowdResult;
  onChoosePosition: (position: MapPosition) => void;
  onChooseIndex: (index: number) => void;
}) {
  const [aimPosition, setAimPosition] = useState<MapPosition | null>(null);
  const challenge = question.map;

  if (!challenge) return null;

  const choice = challenge.choice;
  const viewport = choice?.viewport ?? { center: { x: 0.5, y: 0.5 }, zoom: 1 };
  const canChoosePin = phase === "answering" && !choice && selectedIndex === null;
  const canChooseOption = phase === "answering" && Boolean(choice) && selectedIndex === null;
  const selectedDistance = selectedPosition ? mapDistance(challenge.target, selectedPosition) : null;
  const selectedBand = selectedPosition ? mapAnswerIndex(challenge, selectedPosition) : null;
  const hasVisualPuzzle = Boolean(challenge.crop || choice);
  const targetRingStyle = {
    left: `${challenge.target.x * 100}%`,
    top: `${challenge.target.y * 100}%`,
    width: `${challenge.tolerance * 200}%`,
    height: `${challenge.tolerance * 200}%`,
  } satisfies CSSProperties;
  const campPosition = choice?.camp ? viewportPosition(choice.camp.position, viewport) : null;
  const choiceInstruction =
    choice?.kind === "camp-block"
      ? "Choose a ward"
      : choice?.kind === "stack-route"
        ? "Choose a path"
        : "Choose a tower";

  const positionFromPointer = (element: HTMLButtonElement, clientX: number, clientY: number) => {
    const bounds = element.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height)),
    };
  };

  return (
    <div
      className={clsx(styles.mapSenseQuestion, hasVisualPuzzle && styles.mapVisualQuestion)}
      data-testid="map-sense-round"
      data-puzzle-kind={challenge.crop ? "crop" : (choice?.kind ?? "call")}
    >
      <div className={styles.mapBoardFrame}>
        <div
          className={styles.mapBoard}
          data-testid="map-sense-board"
          data-map-state={phase === "reveal" ? "reveal" : selectedIndex !== null ? "locked" : "aiming"}
          data-choice-kind={choice?.kind}
          role={choice ? "group" : undefined}
          aria-label={choice ? `${question.prompt} Four choices are marked on the Dota map.` : undefined}
        >
          <Image
            src={MAP_SENSE_IMAGE}
            alt="Dota 2 battlefield"
            width={512}
            height={512}
            sizes="(max-width: 680px) calc(100vw - 50px), 520px"
            className={styles.mapImage}
            style={viewportImageStyle(viewport)}
            priority
          />
          <span className={styles.mapGrid} aria-hidden="true" />

          {choice?.camp && phase === "reveal" && (
            <span
              className={styles.mapSpawnBox}
              data-testid="map-spawn-box"
              style={viewportBoundsStyle(choice.camp.spawnBox, viewport)}
              aria-hidden="true"
            />
          )}

          {choice?.kind === "stack-route" && campPosition && (
            <svg className={styles.mapRouteLines} viewBox="0 0 100 100" aria-hidden="true">
              {choice.options.map((option, index) => {
                const end = viewportPosition(option.position, viewport);
                const state =
                  phase === "reveal"
                    ? index === publicCorrectIndex(question)
                      ? "correct"
                      : index === selectedIndex
                        ? "wrong"
                        : "idle"
                    : index === selectedIndex
                      ? "selected"
                      : "idle";
                return (
                  <line
                    key={`${option.position.x}:${option.position.y}`}
                    x1={campPosition.x * 100}
                    y1={campPosition.y * 100}
                    x2={end.x * 100}
                    y2={end.y * 100}
                    data-state={state}
                  />
                );
              })}
            </svg>
          )}

          {!choice && phase === "reveal" && crowd.positions.length > 0 && (
            <svg className={styles.mapHeatmap} data-testid="map-heatmap" viewBox="0 0 100 100" aria-hidden="true">
              <g className={styles.mapHeatGlow}>
                {crowd.positions.map((position, index) => (
                  <circle
                    key={`${position.x}:${position.y}:${index}`}
                    cx={position.x * 100}
                    cy={position.y * 100}
                    r="3.8"
                  />
                ))}
              </g>
              <g className={styles.mapCrowdDots}>
                {crowd.positions.map((position, index) => (
                  <circle
                    key={`${position.x}:${position.y}:dot:${index}`}
                    cx={position.x * 100}
                    cy={position.y * 100}
                    r="0.52"
                  />
                ))}
              </g>
            </svg>
          )}

          {!choice && phase === "reveal" && selectedPosition && (
            <svg className={styles.mapDistanceLine} viewBox="0 0 100 100" aria-hidden="true">
              <line
                x1={selectedPosition.x * 100}
                y1={selectedPosition.y * 100}
                x2={challenge.target.x * 100}
                y2={challenge.target.y * 100}
              />
            </svg>
          )}

          {!choice && phase === "reveal" && <span className={styles.mapTargetRadius} style={targetRingStyle} />}

          {!choice && challenge.reference && (
            <span
              className={styles.mapReferencePin}
              data-testid="map-reference-pin"
              style={percentagePosition(challenge.reference.position)}
              aria-hidden="true"
            >
              <MapPin />
              <small>{challenge.reference.label}</small>
            </span>
          )}

          {choice?.camp && campPosition && (
            <span
              className={styles.mapCampMarker}
              data-testid="map-camp-marker"
              data-tier={choice.camp.tier}
              data-side={choice.camp.side}
              style={percentagePosition(campPosition)}
              aria-hidden="true"
            >
              <i />
            </span>
          )}

          {choice?.fight && (
            <span
              className={styles.mapFightMarker}
              data-testid="map-fight-marker"
              style={percentagePosition(viewportPosition(choice.fight.position, viewport))}
              aria-hidden="true"
            >
              <Crosshair />
              <small>{choice.fight.label}</small>
            </span>
          )}

          {choice?.options.map((option, index) => {
            const position = viewportPosition(option.position, viewport);
            const isSelected = selectedIndex === index;
            const isCorrect = publicCorrectIndex(question) === index;
            const state =
              phase === "reveal"
                ? isCorrect
                  ? "correct"
                  : isSelected
                    ? "wrong"
                    : "idle"
                : isSelected
                  ? "selected"
                  : "idle";
            const percentage = crowd.total ? Math.round((crowd.counts[index] / crowd.total) * 100) : 0;
            const optionStyle = {
              ...percentagePosition(position),
              "--map-route-angle": `${-(option.angle ?? 0)}deg`,
            } as CSSProperties;

            return (
              <button
                key={`${option.position.x}:${option.position.y}:${index}`}
                type="button"
                className={styles.mapChoiceMarker}
                data-testid="map-choice-option"
                data-marker={option.marker}
                data-state={state}
                data-side={option.side}
                style={optionStyle}
                onClick={() => onChooseIndex(index)}
                disabled={!canChooseOption}
                aria-label={`${String.fromCharCode(65 + index)}. ${option.label}`}
                aria-pressed={isSelected}
              >
                <i aria-hidden="true" />
                <strong>{String.fromCharCode(65 + index)}</strong>
                {option.marker === "tower" && <small>{option.label}</small>}
                {phase === "reveal" && <em>{percentage}%</em>}
              </button>
            );
          })}

          {aimPosition && canChoosePin && (
            <span className={styles.mapAim} style={percentagePosition(aimPosition)} aria-hidden="true">
              <Crosshair />
            </span>
          )}

          {selectedPosition && (
            <span
              className={styles.mapPlayerPin}
              data-testid="map-player-pin"
              style={percentagePosition(selectedPosition)}
              aria-hidden="true"
            >
              <MapPin />
              <small>You</small>
            </span>
          )}

          {!choice && phase === "reveal" && (
            <span
              className={styles.mapTargetPin}
              data-testid="map-target-pin"
              style={percentagePosition(challenge.target)}
              aria-hidden="true"
            >
              <Crosshair />
              <small>Target</small>
            </span>
          )}

          {!choice && (
            <button
              type="button"
              className={styles.mapPinSurface}
              disabled={!canChoosePin}
              aria-label={
                canChoosePin
                  ? `Place your pin for: ${question.prompt} Use the pointer, or arrow keys and Enter.`
                  : `Map pin ${selectedPosition ? "locked" : "unavailable"} for ${question.prompt}`
              }
              onFocus={() => {
                if (canChoosePin && !aimPosition) setAimPosition({ x: 0.5, y: 0.5 });
              }}
              onPointerMove={(event) => {
                if (canChoosePin) {
                  setAimPosition(positionFromPointer(event.currentTarget, event.clientX, event.clientY));
                }
              }}
              onPointerLeave={() => {
                if (canChoosePin) setAimPosition(null);
              }}
              onKeyDown={(event) => {
                if (!canChoosePin) return;
                const movement = 0.025;
                const current = aimPosition ?? { x: 0.5, y: 0.5 };
                const next = { ...current };
                if (event.key === "ArrowLeft") next.x -= movement;
                else if (event.key === "ArrowRight") next.x += movement;
                else if (event.key === "ArrowUp") next.y -= movement;
                else if (event.key === "ArrowDown") next.y += movement;
                else if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onChoosePosition(current);
                  return;
                } else {
                  return;
                }
                event.preventDefault();
                setAimPosition({
                  x: Math.max(0, Math.min(1, next.x)),
                  y: Math.max(0, Math.min(1, next.y)),
                });
              }}
              onClick={(event) => {
                if (!canChoosePin || event.detail === 0) return;
                onChoosePosition(positionFromPointer(event.currentTarget, event.clientX, event.clientY));
              }}
            />
          )}

          {viewport.zoom === 1 && <span className={styles.mapRadiantLabel}>Radiant</span>}
          {viewport.zoom === 1 && <span className={styles.mapDireLabel}>Dire</span>}
        </div>

        <div className={styles.mapBoardStatus}>
          <span>
            {choice ? <Radio /> : <Crosshair />}
            {phase === "reveal"
              ? choice
                ? `${crowd.total.toLocaleString("en-US")} room ${crowd.total === 1 ? "answer" : "answers"} revealed`
                : `${crowd.positions.length.toLocaleString("en-US")} room ${
                    crowd.positions.length === 1 ? "pin" : "pins"
                  } revealed`
              : selectedIndex !== null
                ? choice
                  ? "Answer locked"
                  : "Pin locked"
                : choice
                  ? choiceInstruction
                  : "Click or tap once to lock"}
          </span>
          <strong>
            {choice?.kind === "camp-block"
              ? `${choice.camp?.tier} camp · spawn :00`
              : choice?.kind === "stack-route"
                ? `:${choice.camp?.stack.start}–:${choice.camp?.stack.end} window`
                : choice?.kind === "tp-in"
                  ? "4 live towers"
                  : selectedDistance === null
                    ? `Hit radius ${Math.round(challenge.tolerance * 100)}%`
                    : `${MAP_SENSE_BAND_LABELS[selectedBand ?? 3]} · ${Math.round(selectedDistance * 100)}% off`}
          </strong>
        </div>
      </div>

      <div className={styles.mapMission}>
        <span>
          <MapPin />
          {question.eyebrow}
        </span>
        {challenge.crop && <MapTerrainCrop crop={challenge.crop} />}
        {choice && <MapMechanicCard choice={choice} />}
        <h2>{question.prompt}</h2>

        {choice ? (
          <div className={styles.mapChoiceList} role="group" aria-label="Map choices">
            {choice.options.map((option, index) => {
              const isSelected = selectedIndex === index;
              const isCorrect = publicCorrectIndex(question) === index;
              const percentage = crowd.total ? Math.round((crowd.counts[index] / crowd.total) * 100) : 0;
              return (
                <button
                  key={`${question.id}:legend:${index}`}
                  type="button"
                  data-testid="map-choice-answer"
                  data-state={
                    phase === "reveal"
                      ? isCorrect
                        ? "correct"
                        : isSelected
                          ? "wrong"
                          : "idle"
                      : isSelected
                        ? "selected"
                        : "idle"
                  }
                  onClick={() => onChooseIndex(index)}
                  disabled={!canChooseOption}
                  aria-pressed={isSelected}
                >
                  <span>{String.fromCharCode(65 + index)}</span>
                  <strong>{option.label}</strong>
                  {phase === "reveal" && <small>{percentage}%</small>}
                </button>
              );
            })}
          </div>
        ) : (
          <div className={styles.mapAccuracyScale} aria-label="Map accuracy bands">
            {MAP_SENSE_BAND_LABELS.map((label, index) => (
              <span key={label} className={selectedBand === index ? styles.mapAccuracyActive : undefined}>
                <i />
                <small>{String(index + 1).padStart(2, "0")}</small>
                <strong>{label}</strong>
              </span>
            ))}
          </div>
        )}

        {!hasVisualPuzzle && (
          <div className={styles.mapMissionStatus}>
            {phase === "reveal" ? (
              <>
                <small>Correct location</small>
                <strong>{challenge.targetLabel}</strong>
              </>
            ) : selectedPosition ? (
              <>
                <small>Answer received</small>
                <strong>No repings—trust the call</strong>
              </>
            ) : (
              <>
                <small>Your call</small>
                <strong>Read the terrain, then commit</strong>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ClassicChoiceBoard({ question, active }: { question: PublicArcadeQuestion; active: boolean }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!active || selectedIndex !== null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const letterIndex = (LETTERS as readonly string[]).indexOf(event.key.toUpperCase());
      const numIndex = ["1", "2", "3", "4"].indexOf(event.key);
      const index = letterIndex >= 0 ? letterIndex : numIndex;
      if (index < 0) return;
      event.preventDefault();
      setSelectedIndex(index);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, selectedIndex]);

  return (
    <div className={styles.entryWaitChoiceBoard} data-testid="entry-wait-keys-demo">
      <div className={styles.roundHeader}>
        <div>
          <span>Round 001</span>
          <i />
          <span className={styles.roundGameLabel}>
            <RoundMark game="trivia" />
            {LIVE_ROUND_HEADER_LABELS.trivia}
          </span>
          <i />
          <span>{question.category}</span>
        </div>
        <div className={styles.timer}>
          <Clock3 />
          <strong>15</strong>
        </div>
      </div>
      <div className={styles.questionBlock} data-testid="entry-wait-choice-prompt">
        <QuestionArtwork question={question} />
        <div className={styles.questionCopy}>
          <span>{question.eyebrow}</span>
          <h2>{question.prompt}</h2>
        </div>
      </div>
      <div className={styles.answers} role="group" aria-label="Answer choices">
        {question.answers.map((answer, index) => {
          const isSelected = selectedIndex === index;
          return (
            <button
              key={answer}
              type="button"
              data-testid="arcade-answer"
              className={clsx(
                styles.answer,
                isSelected && styles.answerLocked,
                selectedIndex !== null && !isSelected && styles.answerMuted,
              )}
              onClick={() => {
                if (selectedIndex === null) setSelectedIndex(index);
              }}
              disabled={selectedIndex !== null}
              aria-pressed={isSelected}
            >
              <span className={styles.answerKey}>{LETTERS[index]}</span>
              <span className={styles.answerText}>
                {answer}
                {isSelected ? <small>Your answer · locked</small> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EntryWaitLessons() {
  const [tips] = useState(() => shuffleEntryWaitTips());
  const [tipIndex, setTipIndex] = useState(0);
  const tipCount = tips.length;
  const tip = tips[tipIndex];

  const stepTip = useCallback(
    (delta: number) => {
      setTipIndex((index) => (index + delta + tipCount) % tipCount);
    },
    [tipCount],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepTip(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        stepTip(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepTip]);

  if (!tip) return null;

  return (
    <div className={styles.entryWaitCarousel} data-testid="entry-wait-tips" data-tip-count={tipCount}>
      <button
        type="button"
        className={styles.entryWaitTipButton}
        data-testid="entry-wait-prev-tip"
        aria-label="Previous tip"
        onClick={() => stepTip(-1)}
      >
        <ChevronLeft />
      </button>
      <div className={styles.entryWaitTipBar} data-testid="entry-wait-tip-bar">
        <article className={styles.entryWaitCard} data-testid="entry-wait-tip" data-tip={tip.id}>
          <div className={styles.entryWaitCardCopy}>
            <small>{ENTRY_WAIT_TIP_LABEL}</small>
            <p>
              {tip.mark && tip.body.includes(tip.mark) ? (
                <>
                  {tip.body.slice(0, tip.body.indexOf(tip.mark))}
                  <em>{tip.mark}</em>
                  {tip.body.slice(tip.body.indexOf(tip.mark) + tip.mark.length)}
                </>
              ) : (
                tip.body
              )}
            </p>
          </div>
          <div className={styles.entryWaitStage} data-testid="entry-wait-stage">
            <div
              className={styles.entryWaitPanel}
              data-panel="keys"
              data-active={tip.id === "keys" ? "true" : "false"}
              aria-hidden={tip.id !== "keys"}
              inert={tip.id !== "keys"}
            >
              <ClassicChoiceBoard question={WAIT_CHOICE_QUESTION} active={tip.id === "keys"} />
            </div>
            <div
              className={styles.entryWaitPanel}
              data-panel="heroes"
              data-testid="entry-wait-heroes-demo"
              data-active={tip.id === "heroes" ? "true" : "false"}
              aria-hidden={tip.id !== "heroes"}
              inert={tip.id !== "heroes"}
            >
              <HeroPicker
                question={WAIT_HERO_QUESTION}
                phase="answering"
                selectedKey={null}
                crowd={EMPTY_CROWD}
                onChoose={() => undefined}
              />
            </div>
            <div
              className={styles.entryWaitPanel}
              data-panel="shop"
              data-testid="entry-wait-shop-demo"
              data-active={tip.id === "shop" ? "true" : "false"}
              aria-hidden={tip.id !== "shop"}
              inert={tip.id !== "shop"}
            >
              <ShopkeeperStore
                question={WAIT_SHOP_QUESTION}
                phase="answering"
                selectedKey={null}
                crowd={EMPTY_CROWD}
                onChoose={() => undefined}
              />
            </div>
          </div>
        </article>
      </div>
      <button
        type="button"
        className={styles.entryWaitTipButton}
        data-testid="entry-wait-next-tip"
        aria-label="Next tip"
        onClick={() => stepTip(1)}
      >
        <ChevronRight />
      </button>
    </div>
  );
}

function BrandMark({ logoUrl }: { logoUrl: string }) {
  return (
    <span className={styles.brandMark} aria-hidden="true">
      <Image src={logoUrl} alt="" width={30} height={30} unoptimized />
    </span>
  );
}

export function QueueArcade({ autoStart = false, gameInfo }: { autoStart?: boolean; gameInfo: PublicGameInfo }) {
  const [phase, setPhaseState] = useState<GamePhase>("lobby");
  const [currentQuestion, setCurrentQuestion] = useState<PublicArcadeQuestion | null>(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectedAnswerKey, setSelectedAnswerKey] = useState<string | null>(null);
  const [selectedMapPosition, setSelectedMapPosition] = useState<MapPosition | null>(null);
  const [answerTimeLeft, setAnswerTimeLeft] = useState(0);
  const [crowd, setCrowdState] = useState<CrowdResult>(EMPTY_CROWD);
  const [roundAward, setRoundAward] = useState<RoundAward | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
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
  accountRef.current = account;
  const joiningRoomRef = useRef(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState("");
  const [activeRoundId, setActiveRoundId] = useState("");
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

  const phaseRef = useRef<GamePhase>("lobby");
  const currentQuestionRef = useRef<PublicArcadeQuestion | null>(null);
  const roundIndexRef = useRef(0);
  const selectedIndexRef = useRef<number | null>(null);
  const selectedAnswerKeyRef = useRef<string | null>(null);
  const selectedMapPositionRef = useRef<MapPosition | null>(null);
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
  const questionRevisionRef = useRef("");
  const entryWaitRoundIdRef = useRef("");
  const entryWaitModeRef = useRef<"lessons" | "silent" | null>(null);
  const [entryWaitMode, setEntryWaitMode] = useState<"lessons" | "silent" | null>(null);
  const roomSyncGateRef = useRef<ReturnType<typeof createRoomSyncGate> | null>(null);
  const feedbackPlayerRef = useRef<ReturnType<typeof createFeedbackPlayer> | null>(null);
  if (feedbackPlayerRef.current === null) feedbackPlayerRef.current = createFeedbackPlayer();
  const roundAudioRefs = useRef<Array<HTMLAudioElement | null>>([]);
  const roundAudioAbortRef = useRef<AbortController | null>(null);
  const autoPlayedAudioKeyRef = useRef("");
  const prewarmedAfterRoundIdRef = useRef("");
  const reportTargetRef = useRef<QuestionReportTarget | null>(null);
  const reportStateRef = useRef<"idle" | "sending" | "sent" | "error">("idle");
  const autoStartAttemptedRef = useRef(false);
  const alphaSessionIdRef = useRef("");
  const alphaSessionFinishedRef = useRef(false);
  const heroPreloadsRef = useRef<HTMLImageElement[]>([]);

  if (roomSyncGateRef.current === null) roomSyncGateRef.current = createRoomSyncGate();

  useEffect(() => {
    const sources = [...Object.values(HERO_ATTRIBUTE_ICONS), ...HERO_PICKER_HEROES.map((hero) => hero.image)];
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
    try {
      const response = await fetch("/api/me", { cache: "no-store" });
      if (!response.ok) throw new Error("Profile request failed.");
      setAccount((await response.json()) as AccountSnapshot);
    } catch {
      setAccount({ authenticated: false });
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

    const stored = window.localStorage.getItem(PLAYER_KEY) ?? window.localStorage.getItem(LEGACY_PLAYER_KEY);
    const id = stored ?? window.crypto.randomUUID();
    window.localStorage.setItem(PLAYER_KEY, id);
    playerIdRef.current = id;
    return id;
  }, []);

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

  const finishAlphaSession = useCallback(() => {
    const sessionId = alphaSessionIdRef.current;
    if (!sessionId || alphaSessionFinishedRef.current) return;
    alphaSessionFinishedRef.current = true;
    void sendAlphaSessionEvent("finish", sessionId).catch(() => undefined);
  }, [sendAlphaSessionEvent]);

  const playSound = useCallback(
    (kind: "lock" | "correct" | "wrong" | "start") => {
      feedbackPlayerRef.current?.play(kind, { enabled: soundEnabled, volume: gameVolume });
    },
    [gameVolume, soundEnabled],
  );

  const stopRoundAudio = useCallback((showReadyState = true) => {
    roundAudioAbortRef.current?.abort();
    roundAudioAbortRef.current = null;
    for (const audio of roundAudioRefs.current) audio?.pause();
    if (showReadyState && phaseRef.current === "answering") setRoundAudioState("ready");
  }, []);

  const playRoundAudio = useCallback(
    (enableSound = true, revealStage = 1) => {
      stopRoundAudio(false);
      const audios = roundAudioRefs.current.filter((audio): audio is HTMLAudioElement => Boolean(audio));
      if (!audios.length) return;

      const question = currentQuestionRef.current;
      const isSoundcheck = question?.game === "soundcheck";
      const isEchoHunt = question?.game === "echo-hunt";
      const isProgressiveAudio = isSoundcheck || isEchoHunt;
      if (enableSound) setSoundEnabled(true);
      autoPlayedAudioKeyRef.current = isProgressiveAudio ? `${roundIdRef.current}:${revealStage}` : roundIdRef.current;
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

          const sourceDuration = isSoundcheck
            ? question?.soundcheck?.clips[clipIndex]?.duration
            : Number.isFinite(audio.duration)
              ? audio.duration
              : 5;
          const clipDuration = isSoundcheck
            ? soundcheckCutDuration(sourceDuration ?? 0, revealStage)
            : echoHuntCutDuration(sourceDuration ?? 0, revealStage);
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
      const response = await fetch(`/api/rounds?${publicRoomQuery(settings, playerId, questionRevisionRef.current)}`, {
        cache: "no-store",
        signal,
      });
      const payload: unknown = await response.json();
      const receivedAt = Date.now();

      if (!response.ok) throw new Error("Public room unavailable.");
      const snapshot = normalizeRoomSnapshot(payload);
      if (!snapshot) throw new Error("Public room returned an invalid round.");

      return {
        snapshot,
        receivedAt,
        clockOffset: (requestedAt + receivedAt) / 2 - snapshot.serverNow,
      };
    },
    [],
  );

  const finalizeRound = useCallback(
    (snapshot: RoomSnapshot, localRevealDeadline: number) => {
      const question = currentQuestionRef.current;
      if (!question || finalizedRef.current || !participatedRef.current || snapshot.round.id !== roundIdRef.current) {
        return;
      }

      setDeadline(null);
      if (localRevealDeadline > 0) setRevealDeadlineState(localRevealDeadline);
      setPhase("reveal");
      setCrowd(snapshot.crowd);

      const voted = Boolean(snapshot.playerVote);
      const locked = selectedIndexRef.current !== null || Boolean(selectedAnswerKeyRef.current);
      const pendingVote = locked && !voted && !voteRequestSettledRef.current;
      if (pendingVote || finalizedRef.current) return;

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
        precisionBonus,
        mapDistance: distance,
        rawPoints: correctPoints,
      } = scoreBreakdown(
        question,
        answerTimeLeftRef.current,
        snapshot.round.answerDuration,
        selectedMapPositionRef.current,
      );
      const rawPoints = isCorrect ? correctPoints : 0;
      const localPoints = majorityBonus ? rawPoints * 2 : rawPoints;
      const points = voted ? (snapshot.crowd.scoreSummary?.playerPoints ?? localPoints) : 0;

      setRoundAward({
        points,
        majorityBonus,
        correct: isCorrect,
        speedBonus,
        cluePenalty,
        precisionBonus,
        mapDistance: distance,
      });
      setScore((currentScore) => {
        const nextScore = currentScore + points;
        if (voted && !accountRef.current?.authenticated) {
          setLifetimeStats((currentStats) => {
            const startedRun = !runSavedRef.current;
            if (startedRun) runSavedRef.current = true;
            const nextStats = {
              runs: currentStats.runs + (startedRun ? 1 : 0),
              answered: currentStats.answered + 1,
              correct: currentStats.correct + (isCorrect ? 1 : 0),
              bestScore: Math.max(currentStats.bestScore, nextScore),
            };
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextStats));
            return nextStats;
          });
        }
        return nextScore;
      });
      setHistory((records) => [
        ...records,
        {
          id: snapshot.round.id,
          category: question.category,
          game: question.game,
          correct: isCorrect,
          points,
        },
      ]);

      if (isCorrect) {
        setCorrectCount((count) => count + 1);
        setStreak((currentStreak) => {
          const nextStreak = currentStreak + 1;
          setBestStreak((currentBest) => Math.max(currentBest, nextStreak));
          return nextStreak;
        });
      } else {
        setStreak(0);
      }
      if (voted) playSound(answerFeedbackKind(isCorrect));
      else if (!pickedCorrect) playSound(answerFeedbackKind(false));
    },
    [playSound, setCrowd, setDeadline, setPhase],
  );

  const applyRoomSnapshot = useCallback(
    (snapshot: RoomSnapshot, clockOffset: number, receivedAt: number) => {
      const localAnswerDeadline = snapshot.round.answerDeadline + clockOffset;
      const localRevealDeadline = snapshot.round.revealDeadline + clockOffset;
      const isNewRound = roundIdRef.current !== snapshot.round.id;
      const hadRound = Boolean(roundIdRef.current);

      roomSnapshotRef.current = snapshot;
      setActiveRoomId(snapshot.room.id);
      setActiveRoundId(snapshot.round.id);
      setActivePlayers(snapshot.presence.activePlayers);
      setCrowd(snapshot.crowd);
      setRoomError(null);
      setNow(receivedAt);

      if (snapshot.round.phase === "reveal" && prewarmedAfterRoundIdRef.current !== snapshot.round.id) {
        prewarmedAfterRoundIdRef.current = snapshot.round.id;
        void fetch(`/api/round-audio?roundId=${encodeURIComponent(snapshot.round.id)}`, {
          method: "HEAD",
          cache: "no-store",
        }).catch(() => undefined);
      }

      if (entryWaitRoundIdRef.current) {
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
        const nextMapPosition = playerVote?.mapPosition ?? null;
        const nextAnswerTimeLeft = playerVote ? Math.max(0, snapshot.round.answerDeadline - playerVote.submittedAt) : 0;
        selectedIndexRef.current = nextSelectedIndex;
        selectedAnswerKeyRef.current = nextSelectedAnswerKey;
        selectedMapPositionRef.current = nextMapPosition;
        answerTimeLeftRef.current = nextAnswerTimeLeft;
        setSelectedIndex(nextSelectedIndex);
        setSelectedAnswerKey(nextSelectedAnswerKey);
        setSelectedMapPosition(nextMapPosition);
        setAnswerTimeLeft(nextAnswerTimeLeft);

        participatedRef.current = snapshot.round.phase === "answering";
        finalizedRef.current = snapshot.round.phase === "reveal";
        voteRequestSettledRef.current = Boolean(playerVote);

        if (snapshot.round.phase === "answering") {
          setDeadline(localAnswerDeadline);
          setRevealDeadlineState(null);
          setPhase("answering");
        } else {
          setDeadline(null);
          setRevealDeadlineState(localRevealDeadline);
          setPhase("reveal");
        }
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

      if (snapshot.playerVote && selectedIndexRef.current === null) {
        const nextAnswerTimeLeft = Math.max(0, snapshot.round.answerDeadline - snapshot.playerVote.submittedAt);
        selectedIndexRef.current = snapshot.playerVote.answerIndex;
        selectedAnswerKeyRef.current = snapshot.playerVote.answerKey ?? null;
        selectedMapPositionRef.current = snapshot.playerVote.mapPosition ?? null;
        answerTimeLeftRef.current = nextAnswerTimeLeft;
        setSelectedIndex(snapshot.playerVote.answerIndex);
        setSelectedAnswerKey(snapshot.playerVote.answerKey ?? null);
        setSelectedMapPosition(snapshot.playerVote.mapPosition ?? null);
        setAnswerTimeLeft(nextAnswerTimeLeft);
      }

      if (snapshot.round.phase === "answering") {
        setDeadline(localAnswerDeadline);
        setRevealDeadlineState(null);
        setPhase("answering");
        return;
      }

      setRevealDeadlineState(localRevealDeadline);
      finalizeRound(snapshot, localRevealDeadline);
    },
    [finalizeRound, setCrowd, setDeadline, setPhase, updateReportState, updateReportTarget],
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
          if (!gate.isCurrent(attempt.generation) || roomSettingsRef.current !== settings) return;
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

  const startRun = useCallback(
    async (updateHistory = true) => {
      if (joiningRoomRef.current) return;

      const settings: PublicRoomSettings = {
        gameId: DEFAULT_GAME_ID,
        mode: PUBLIC_ARCADE_MODE,
        filter: "Mixed",
      };
      joiningRoomRef.current = true;
      setRoomError(null);
      roomSyncGateRef.current?.cancel();
      roomSettingsRef.current = settings;
      questionRevisionRef.current = "";
      feedbackPlayerRef.current?.preload();
      playSound("start");

      try {
        const result = await requestRoomSnapshot(settings, ensurePlayerId());
        if (roomSettingsRef.current !== settings) return;

        roundIdRef.current = "";
        entryWaitRoundIdRef.current = "";
        entryWaitModeRef.current = null;
        setEntryWaitMode(null);
        prewarmedAfterRoundIdRef.current = "";
        currentQuestionRef.current = null;
        roundIndexRef.current = 0;
        runSavedRef.current = false;
        finalizedRef.current = false;
        participatedRef.current = false;
        setCurrentQuestion(null);
        selectedIndexRef.current = null;
        selectedAnswerKeyRef.current = null;
        selectedMapPositionRef.current = null;
        setSelectedIndex(null);
        setSelectedAnswerKey(null);
        setSelectedMapPosition(null);
        setRoundIndex(0);
        setScore(0);
        setStreak(0);
        setBestStreak(0);
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
        entryWaitRoundIdRef.current = result.snapshot.round.id;
        applyRoomSnapshot(result.snapshot, result.clockOffset, result.receivedAt);
        void sendAlphaSessionEvent("start", alphaSessionId).catch(() => undefined);
        if (updateHistory && window.location.pathname !== PUBLIC_ARCADE_PATH) {
          window.history.pushState({ queueArcadeView: "play" }, "", PUBLIC_ARCADE_PATH);
        }
      } catch {
        if (roomSettingsRef.current === settings) {
          roomSettingsRef.current = null;
          setRoomError("Could not join the public room · retrying.");
        }
      } finally {
        joiningRoomRef.current = false;
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
    if (!autoStart || window.location.pathname !== PUBLIC_ARCADE_PATH || autoStartAttemptedRef.current) {
      return;
    }
    autoStartAttemptedRef.current = true;
    void startRun(false);
  }, [autoStart, startRun]);

  const submitQuestionReport = useCallback(
    async (reason: ReportReason) => {
      const target = reportTargetRef.current;
      const settings = roomSettingsRef.current;
      if (!target || !settings || reportStateRef.current === "sending") return;

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

        if (reportTargetRef.current?.roundId !== target.roundId) return;

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
        if (reportTargetRef.current?.roundId === target.roundId) {
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
      answer:
        question.map && !question.map.choice
          ? question.map.targetLabel
          : question.reveal?.correctAnswerKey
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
    async (answerIndex: number, options?: { mapPosition?: MapPosition; answerKey?: string }) => {
      const snapshot = roomSnapshotRef.current;
      const settings = roomSettingsRef.current;
      if (!snapshot || !settings || snapshot.round.id !== roundIdRef.current) return;

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
            ...(options?.mapPosition ? { mapPosition: options.mapPosition } : {}),
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

        if (roundIdRef.current === snapshot.round.id) {
          voteRequestSettledRef.current = true;
          setCrowd({
            counts: result.counts,
            total: result.total,
            positions: result.positions,
            keyCounts: result.keyCounts,
            scoreSummary: result.scoreSummary,
          });
          if (result.playerVote) {
            const serverTimeLeft = Math.max(0, snapshot.round.answerDeadline - result.playerVote.submittedAt);
            selectedIndexRef.current = result.playerVote.answerIndex;
            selectedAnswerKeyRef.current = result.playerVote.answerKey ?? null;
            selectedMapPositionRef.current = result.playerVote.mapPosition ?? null;
            answerTimeLeftRef.current = serverTimeLeft;
            setSelectedIndex(result.playerVote.answerIndex);
            setSelectedAnswerKey(result.playerVote.answerKey ?? null);
            setSelectedMapPosition(result.playerVote.mapPosition ?? null);
            setAnswerTimeLeft(serverTimeLeft);
            if (roomSnapshotRef.current?.round.id === snapshot.round.id) {
              roomSnapshotRef.current = { ...roomSnapshotRef.current, playerVote: result.playerVote };
            }
          }
          setRoomError(null);
          if (phaseRef.current === "reveal" && roomSnapshotRef.current) {
            finalizeRound(roomSnapshotRef.current, 0);
          }
        }
      } catch {
        if (roundIdRef.current === snapshot.round.id) {
          voteRequestSettledRef.current = true;
          setRoomError("Vote confirmation delayed · checking the room");
          if (phaseRef.current === "reveal" && roomSnapshotRef.current) {
            finalizeRound(roomSnapshotRef.current, 0);
          }
        }
        void syncRoom();
      }
    },
    [ensurePlayerId, finalizeRound, setCrowd, syncRoom],
  );

  const chooseAnswer = useCallback(
    (answerIndex: number) => {
      const question = currentQuestionRef.current;
      if (
        phaseRef.current !== "answering" ||
        !question ||
        isPublicKeyedAnswerQuestion(question) ||
        (question.game === "map-sense" && !question.map?.choice) ||
        selectedIndexRef.current !== null ||
        !deadlineRef.current ||
        Date.now() >= deadlineRef.current
      ) {
        return;
      }

      const timeLeft = Math.max(0, deadlineRef.current - Date.now());
      selectedIndexRef.current = answerIndex;
      answerTimeLeftRef.current = timeLeft;
      voteRequestSettledRef.current = false;
      setSelectedIndex(answerIndex);
      setAnswerTimeLeft(timeLeft);
      playSound("lock");
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
      selectedIndexRef.current = answerIndex;
      selectedAnswerKeyRef.current = answerKey;
      answerTimeLeftRef.current = timeLeft;
      voteRequestSettledRef.current = false;
      setSelectedIndex(answerIndex);
      setSelectedAnswerKey(answerKey);
      setAnswerTimeLeft(timeLeft);
      playSound("lock");
      void submitVote(answerIndex, { answerKey });
    },
    [playSound, submitVote],
  );

  const chooseMapPosition = useCallback(
    (position: MapPosition) => {
      const question = currentQuestionRef.current;
      if (
        phaseRef.current !== "answering" ||
        !question?.map ||
        selectedIndexRef.current !== null ||
        !deadlineRef.current ||
        Date.now() >= deadlineRef.current
      ) {
        return;
      }

      const timeLeft = Math.max(0, deadlineRef.current - Date.now());
      const answerIndex = mapAnswerIndex(question.map, position);
      selectedIndexRef.current = answerIndex;
      selectedMapPositionRef.current = position;
      answerTimeLeftRef.current = timeLeft;
      voteRequestSettledRef.current = false;
      setSelectedIndex(answerIndex);
      setSelectedMapPosition(position);
      setAnswerTimeLeft(timeLeft);
      playSound("lock");
      void submitVote(answerIndex, { mapPosition: position });
    },
    [playSound, submitVote],
  );

  const returnToLobby = useCallback(
    (historyAction: "push" | "replace" | "none" = "push") => {
      if (phaseRef.current !== "lobby") finishAlphaSession();
      roomSyncGateRef.current?.cancel();
      roomSettingsRef.current = null;
      roomSnapshotRef.current = null;
      roundIdRef.current = "";
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

      if (historyAction !== "none" && window.location.pathname !== ARCADE_LOBBY_PATH) {
        const method = historyAction === "replace" ? "replaceState" : "pushState";
        window.history[method]({ queueArcadeView: "lobby" }, "", ARCADE_LOBBY_PATH);
      }
    },
    [finishAlphaSession, loadAccount, setDeadline, setPhase, stopRoundAudio, updateReportState, updateReportTarget],
  );

  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname === PUBLIC_ARCADE_PATH) {
        if (phaseRef.current === "lobby") void startRun(false);
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
        ? deadline
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
        currentQuestion.game === "aghanim-lab")
        ? roomProgressiveClueSyncDeadline(deadline, answerDuration, currentQuestion.clueStage)
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

  useEffect(() => () => roomSyncGateRef.current?.cancel(), []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadAccount(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadAccount]);

  useEffect(() => {
    const hydration = window.setTimeout(() => {
      try {
        const storedStats = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
        const currentSettings = window.localStorage.getItem(SETTINGS_KEY);
        const storedSettings =
          currentSettings ??
          window.localStorage.getItem(PREVIOUS_SETTINGS_KEY) ??
          window.localStorage.getItem(LEGACY_SETTINGS_KEY);
        if (storedStats) setLifetimeStats({ ...EMPTY_STATS, ...JSON.parse(storedStats) });
        if (storedSettings) {
          const settings = JSON.parse(storedSettings) as {
            soundEnabled?: boolean;
            gameVolume?: number;
          };
          if (typeof settings.soundEnabled === "boolean") setSoundEnabled(settings.soundEnabled);
          if (typeof settings.gameVolume === "number" && Number.isFinite(settings.gameVolume)) {
            const wasOldDefault = !currentSettings && settings.gameVolume === 0.7;
            setGameVolume(
              wasOldDefault ? DEFAULT_GAME_VOLUME : Math.min(1, Math.max(MIN_GAME_VOLUME, settings.gameVolume)),
            );
          }
        }
        ensurePlayerId();
      } catch {
        // Corrupt local data should never stop a round from starting.
      } finally {
        setStatsLoaded(true);
      }
    }, 0);

    return () => window.clearTimeout(hydration);
  }, [ensurePlayerId]);

  useEffect(() => {
    if (!statsLoaded) return;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ soundEnabled, gameVolume }));
  }, [gameVolume, soundEnabled, statsLoaded]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

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
    currentQuestion &&
      (isPublicFlashbackYearQuestion(currentQuestion) || currentQuestion.flashback?.family === "year"),
  );
  const isSoundcheckRound = currentGame === "soundcheck";
  const isEchoHuntRound = currentGame === "echo-hunt";
  const isProgressiveAudioRound = isSoundcheckRound || isEchoHuntRound;
  const isSoundSequence = isSoundcheckRound && currentQuestion?.soundcheck?.format === "sequence";
  const mapChoiceRound = currentGame === "map-sense" && Boolean(currentQuestion?.map?.choice);
  const clueStage =
    phase === "reveal"
      ? 3
      : currentGame === "spell-link" || currentGame === "quote-hunt" || currentGame === "aghanim-lab"
        ? (currentQuestion?.clueStage ?? 1)
        : isSoundcheckRound
          ? soundcheckRevealStage(answerRemaining, answerDuration)
          : clueStageAt(answerRemaining, answerDuration);
  const firstClueAt = Math.round((answerDuration * 2) / 3_000);
  const finalClueAt = Math.round(answerDuration / 3_000);
  const liveAward = currentQuestion
    ? scoreBreakdown(
        currentQuestion,
        selectedIndex === null ? answerRemaining : answerTimeLeft,
        answerDuration,
        selectedMapPosition,
      )
    : null;
  const recentHistory = history.slice(phase === "answering" ? -9 : -10);
  const recentHistoryStart = history.length - recentHistory.length + 1;
  const spellHint = currentQuestion?.hint ?? "A mechanical clue will appear near the end of the round.";
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
    const autoplayKey = isProgressiveAudioRound ? `${activeRoundId}:${clueStage}` : activeRoundId;
    if (
      phase !== "answering" ||
      !hasRoundAudio ||
      !currentQuestion?.audio ||
      !soundEnabled ||
      !roundAudioRefs.current.some(Boolean) ||
      autoPlayedAudioKeyRef.current === autoplayKey
    ) {
      return;
    }

    playRoundAudio(false, isProgressiveAudioRound ? clueStage : 1);
  }, [
    activeRoundId,
    clueStage,
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
      data-client-ready={statsLoaded}
      data-account-ready={account !== null}
      data-room-id={activeRoomId || undefined}
      data-round-id={activeRoundId || undefined}
      data-question-kind={currentQuestion?.kind}
    >
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

      {(phase === "lobby" || (phase === "waiting" && entryWaitMode === "silent")) && (
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
              <div className={styles.roundMixRail} aria-label="Round identities">
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
                onClick={() => void startRun()}
                disabled={phase === "waiting"}
              >
                {phase === "waiting" ? "Joining…" : activeModeInfo.action}
              </button>
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

      {phase === "waiting" && entryWaitMode === "lessons" && (
        <section
          className={styles.entryWait}
          data-testid="round-entry-wait"
          data-lessons="true"
          aria-label="Waiting for the next round"
        >
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
          <div
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
              currentGame === "map-sense" && styles.mapSenseStage,
              currentGame === "counterplay" && styles.counterplayStage,
            )}
          >
            <div className={styles.timerTrack} aria-hidden="true">
              <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, timerRatio))})` }} />
            </div>

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
                aria-live="polite"
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
            ) : currentGame === "map-sense" ? (
              <MapSenseBoard
                key={currentQuestion.id}
                question={currentQuestion}
                phase={phase}
                selectedIndex={selectedIndex}
                selectedPosition={selectedMapPosition}
                crowd={crowd}
                onChoosePosition={chooseMapPosition}
                onChooseIndex={chooseAnswer}
              />
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
                data-fog-stage={clueStage}
              >
                <div className={styles.fogArtwork}>
                  <QuestionArtwork question={currentQuestion} concealIdentity />
                  <span>
                    <ScanEye />
                    Fog {String(clueStage).padStart(2, "0")}
                    <small>/ 03</small>
                  </span>
                </div>
                <div className={styles.questionCopy}>
                  <span>Progressive reveal</span>
                  <h2>Which hero is hiding in the fog?</h2>
                  <div className={styles.fogMeter} aria-label={`Portrait clarity stage ${clueStage} of 3`}>
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
                            ? echoHuntCutDuration(roundAudioDurations[audioSource] ?? 0, clueStage)
                            : undefined
                      }
                      src={audioSource}
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
                  <div className={styles.quoteHints} aria-label={`Identity clue stage ${clueStage} of 3`}>
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
            ) : currentGame === "counterplay" ? (
              <div
                className={clsx(styles.questionBlock, styles.counterplayQuestion)}
                data-testid="round-prompt"
                data-counterplay-family={currentQuestion.counterplay?.family}
                data-counterplay-format={currentQuestion.counterplay?.format}
              >
                {currentQuestion.counterplay?.format === "interaction-scenario" &&
                currentQuestion.counterplay.toolImages?.length ? (
                  <div
                    className={styles.counterplayScenarioDiagram}
                    data-testid="counterplay-scenario-diagram"
                    data-tool-count={currentQuestion.counterplay.toolImages.length}
                  >
                    <div className={styles.counterplayScenarioSpell}>
                      <QuestionArtwork question={currentQuestion} className={styles.counterplayScenarioArtwork} />
                      <strong>Incoming spell</strong>
                    </div>
                    <ArrowRight className={styles.counterplayScenarioArrow} aria-hidden="true" />
                    <div className={styles.counterplayScenarioTools}>
                      {currentQuestion.counterplay.toolImages.map((toolImage, index) => (
                        <div className={styles.counterplayScenarioToolEntry} key={toolImage.src}>
                          {index > 0 && (
                            <span className={styles.counterplayScenarioJoin} aria-hidden="true">
                              +
                            </span>
                          )}
                          <div className={styles.counterplayScenarioTool}>
                            <QuestionArtwork
                              question={currentQuestion}
                              imageOverride={toolImage}
                              testId="counterplay-tool-artwork"
                              className={styles.counterplayScenarioArtwork}
                              fallbackLabel={toolImage.label}
                            />
                            <strong data-testid="counterplay-tool-label">{toolImage.label}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className={styles.counterplayTool}>
                    <QuestionArtwork question={currentQuestion} />
                    <span data-testid="counterplay-tool-label">
                      <ShieldCheck />
                      {currentQuestion.counterplay?.tool}
                    </span>
                  </div>
                )}
                <div className={styles.questionCopy}>
                  <h2>{currentQuestion.prompt}</h2>
                  {currentQuestion.counterplay?.note && <small>{currentQuestion.counterplay.note}</small>}
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
              />
            )}

            {isFlashbackOrderRound && (
              <FlashbackOrderBoard
                key={`${activeRoundId}:${phase}`}
                question={currentQuestion}
                phase={phase}
                selectedKey={selectedAnswerKey}
                onChoose={chooseKeyedAnswer}
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
              !isFlashbackYearRound &&
              currentGame !== "map-sense" && (
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
                    currentGame === "counterplay" && styles.counterplayAnswers,
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
              currentGame !== "map-sense" && (
                <div className={styles.answerHelper}>
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
                      {isOpenShopRound
                        ? isRecipeBuilderRound
                          ? "Pick the shop items. Recipe is included."
                          : isSoundcheckRound
                            ? "Choose the item that made the sound"
                            : "Choose an item from the shop"
                        : isHeroPickerRound
                          ? "Choose a hero"
                          : isValueOrderRound
                            ? "Choose four in order"
                            : isFlashbackYearRound
                              ? "Set the year, then Lock"
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
                                        : currentGame === "counterplay"
                                          ? "Pick the interaction · A–D or 1–4"
                                          : "Use A–D or 1–4 to answer"}
                      <span>Correct now: {liveAward?.rawPoints ?? 0} gold</span>
                    </>
                  ) : (
                    <>
                      <Signal className={styles.signalIcon} />
                      Answer locked with {Math.ceil(answerTimeLeft / 1000)}s left
                      <span>Worth {liveAward?.rawPoints ?? 0} gold if correct</span>
                    </>
                  )}
                </div>
              )
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
                  <figure
                    className={styles.revealMedia}
                    data-kind="mark"
                    data-testid="flashback-reveal-media"
                  >
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
                        ? currentGame === "map-sense"
                          ? currentQuestion.map?.choice
                            ? `+${roundAward.speedBonus} speed`
                            : `+${roundAward.precisionBonus} precision · +${roundAward.speedBonus} speed`
                          : `+${roundAward.speedBonus} speed${roundAward.cluePenalty ? ` · −${roundAward.cluePenalty} hints` : ""}`
                        : "No score"}
                  </small>
                  <strong>+{roundAward?.points ?? 0}</strong>
                  <span>gold</span>
                </div>
              </div>
            )}
          </div>

          <aside className={styles.sideRail}>
            <div className={styles.scoreGrid}>
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
                    {currentGame === "map-sense" ? (mapChoiceRound ? "Room answers" : "Room pings") : "Global split"}
                  </span>
                  <span className={styles.livePill}>Final</span>
                </div>
                <strong>
                  {crowd.total.toLocaleString("en-US")}{" "}
                  {currentGame === "map-sense" && !mapChoiceRound
                    ? crowd.total === 1
                      ? "pin"
                      : "pins"
                    : crowd.total === 1
                      ? "answer"
                      : "answers"}
                </strong>
                {crowd.total === 0 && (
                  <p>
                    {currentGame === "map-sense" && !mapChoiceRound
                      ? "No pins landed before the deadline."
                      : "Nobody answered before this room’s deadline."}
                  </p>
                )}
                {crowd.total > 0 && currentGame !== "map-sense" ? (
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
          </aside>
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
            Dota 2 and its assets are trademarks of Valve Corporation. This project is not affiliated with Valve.
          </span>
        </span>
      </footer>
    </main>
  );
}
