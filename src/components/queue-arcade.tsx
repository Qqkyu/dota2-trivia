"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  AudioLines,
  AudioWaveform,
  Brain,
  Check,
  ChevronRight,
  Clock3,
  Crosshair,
  Flag,
  Flame,
  Gauge,
  Gamepad2,
  Keyboard,
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
  Trophy,
  Users,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  isReportReason,
  QUESTION_REPORT_GRACE_MS,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type ReportReason,
} from "@/lib/calibration";
import { getPusherClient } from "@/lib/pusher";
import type { AccountSnapshot } from "@/lib/account-contract";
import { type ArcadeMode, type RoundGame, type ShopkeeperItemReference, type TriviaArtworkKind } from "@/lib/trivia";
import type { CrowdResult, PublicRoomSettings, ReportResult, RoomSnapshot, VoteResult } from "@/lib/arcade-contract";
import { LIVE_ROUND_GAMES, PUBLIC_ARCADE_MODE, PUBLIC_ROUND_FORMATS } from "@/lib/arcade-games.mjs";
import { shouldWaitForNextRoundOnEntry } from "@/lib/arcade-entry.mjs";
import { ARCADE_LOBBY_PATH, PUBLIC_ARCADE_PATH } from "@/lib/arcade-navigation.mjs";
import { DEFAULT_GAME_ID, GAME_IDS, type PublicGameInfo } from "@/lib/game-identity";
import { answerFeedbackKind, dotaFeedbackSoundForKind } from "@/lib/feedback-sounds.mjs";
import {
  HERO_PICKER_BY_KEY,
  HERO_PICKER_CATALOG,
  HERO_PICKER_HEROES,
  isHeroCatalogKey,
  type HeroPickerHero,
} from "@/lib/hero-picker";
import { MAP_SENSE_BAND_LABELS, MAP_SENSE_IMAGE, mapAnswerIndex, mapDistance, isMapPosition } from "@/lib/map-sense";
import type { MapBounds, MapChoiceChallenge, MapCrop, MapPosition, MapViewport } from "@/lib/map-types";
import { MAP_READ_GRACE_MS, speedScoreRatio } from "@/lib/scoring.mjs";
import {
  isRecipeAnswerKey,
  isShopkeeperCatalogKey,
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
import { SteamSignIn } from "./steam-sign-in";
import styles from "./queue-arcade.module.css";

const REVEAL_DURATION_MS = 7_000;
const ANSWER_DURATION_MS = 15_000;
const MAX_SPEED_BONUS = 100;
const SPELL_CLUE_PENALTY = 40;
const DEFAULT_GAME_VOLUME = 0.1;
const MIN_GAME_VOLUME = 0.1;
const LETTERS = ["A", "B", "C", "D"] as const;
const EMPTY_CROWD: CrowdResult = { counts: [0, 0, 0, 0], total: 0, positions: [], keyCounts: [] };
const STORAGE_KEY = "queue-arcade:stats:v2";
const PLAYER_KEY = "queue-arcade:player:v2";
const SETTINGS_KEY = "queue-arcade:settings:v3";
const PREVIOUS_SETTINGS_KEY = "queue-arcade:settings:v2";
const LEGACY_STORAGE_KEY = "queue-trivia:stats:v1";
const LEGACY_PLAYER_KEY = "queue-trivia:player:v1";
const LEGACY_SETTINGS_KEY = "queue-trivia:settings:v1";
const ROUND_GAMES: RoundGame[] = [...LIVE_ROUND_GAMES] as RoundGame[];
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
  answers: ["Ability values", "Item recipes", "Hero voices", "Fogged portraits"],
  patch: "live",
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
type GamePhase = "lobby" | "waiting" | "answering" | "reveal" | "summary";

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
    rule: string;
  }
> = {
  mixed: {
    label: "Queue Arcade",
    shortLabel: "Public Arcade",
    eyebrow: "One room · Endless",
    description: "Dota facts, recipes, spells, fog, voices, sounds, and quotes—one round at a time.",
    action: "Join public arcade",
    rule: "Ten distinct round formats rotate without repeating the same family back-to-back.",
  },
  trivia: {
    label: "Classic Trivia",
    shortLabel: "Classic Trivia",
    eyebrow: "The original",
    description: "Mana, damage, cooldowns, heroes, and items—the classic global-results loop.",
    action: "Enter classic trivia",
    rule: "One shared pool rotates abilities, items, stats, and comparisons.",
  },
  shopkeeper: {
    label: "Shopkeeper Rush",
    shortLabel: "Shopkeeper",
    eyebrow: "Recipe knowledge",
    description: "Build items, spot exact recipes, find shared parts, and trace direct upgrades.",
    action: "Open the secret shop",
    rule: "Four recipe formats rotate evenly from the audited live-client shop.",
  },
  "spell-link": {
    label: "Spell Link",
    shortLabel: "Spell Link",
    eyebrow: "Icon recognition",
    description: "Match an ability to its hero from mechanics, name, and icon.",
    action: "Link some spells",
    rule: "Each extra clue reduces the available score.",
  },
  "fogged-vision": {
    label: "Fogged Vision",
    shortLabel: "Fogged",
    eyebrow: "Progressive reveal",
    description: "Recognize a hero through heavy fog before the portrait sharpens and the easy points disappear.",
    action: "Enter the fog",
    rule: "The portrait clears in three stages. Lock in early while the image is still obscured.",
  },
  "echo-hunt": {
    label: "Echo Hunt",
    shortLabel: "Echo",
    eyebrow: "Hero voices",
    description: "Identify a hero response as its opening fragment grows into a longer line.",
    action: "Hunt some echoes",
    rule: "Two short fragments unlock before the complete spoken line.",
  },
  soundcheck: {
    label: "Soundcheck",
    shortLabel: "Soundcheck",
    eyebrow: "Audio recognition",
    description: "Identify real effects and item activations as short audio cuts grow longer.",
    action: "Enter soundcheck",
    rule: "Two tiny cuts lead to the complete effect. Some rounds chain two sounds in order.",
  },
  "quote-hunt": {
    label: "Quote Hunt",
    shortLabel: "Quotes",
    eyebrow: "Hero responses",
    description: "Read a real hero response and identify the speaker from their attitude, diction, and worldview.",
    action: "Read between the lines",
    rule: "One proper hero line, four closely matched portraits, no laughs or throwaway noises.",
  },
  "map-sense": {
    label: "Map Sense",
    shortLabel: "Map Sense",
    eyebrow: "Pinpoint the play",
    description: "Read map calls, block camps, stack neutrals, and solve compact battlefield decisions.",
    action: "Read the map",
    rule: "Real terrain, current spawn boxes, and Valve's in-game stack guides.",
  },
  counterplay: {
    label: "Counterplay",
    shortLabel: "Counterplay",
    eyebrow: "Mechanics check",
    description: "Read BKB, dispels, Linken's, Lotus, and Nullifier interactions before the fight is decided.",
    action: "Test your mechanics",
    rule: "One mechanic, four abilities, and one interaction that actually works.",
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
                (isShopkeeperCatalogKey(entry.answerKey) ||
                  isRecipeAnswerKey(entry.answerKey) ||
                  isHeroCatalogKey(entry.answerKey)) &&
                "count" in entry &&
                typeof entry.count === "number" &&
                Number.isInteger(entry.count) &&
                entry.count > 0,
            ),
          )
          .slice(0, SHOPKEEPER_CATALOG_ITEMS.length + HERO_PICKER_HEROES.length)
      : [];

  if (
    !Array.isArray(counts) ||
    counts.length !== 4 ||
    !counts.every((count) => typeof count === "number" && count >= 0) ||
    typeof total !== "number" ||
    total < 0
  ) {
    return null;
  }

  return {
    counts: [counts[0], counts[1], counts[2], counts[3]],
    total,
    positions,
    keyCounts,
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
      !isShopkeeperCatalogKey(answerKey) &&
      !isRecipeAnswerKey(answerKey) &&
      !isHeroCatalogKey(answerKey)) ||
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

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function accuracy(correct: number, answered: number) {
  if (!answered) return 0;
  return Math.round((correct / answered) * 100);
}

function playerInitials(displayName: string) {
  return Array.from(displayName).slice(0, 2).join("").toUpperCase();
}

function summaryTitle(correct: number, answered: number) {
  const rate = accuracy(correct, answered);
  if (rate >= 90) return "Aghanim-tier recall";
  if (rate >= 70) return "Ready for the horn";
  if (rate >= 50) return "Knowledge is power";
  return "One more queue";
}

function clueStageAt(timeRemaining: number, duration: number) {
  if (timeRemaining <= duration / 3) return 3;
  if (timeRemaining <= (duration * 2) / 3) return 2;
  return 1;
}

function scoreBreakdown(
  question: PublicArcadeQuestion,
  timeRemaining: number,
  duration: number,
  selectedMapPosition?: MapPosition | null,
) {
  const speedRatio = speedScoreRatio(timeRemaining, duration, question.map ? MAP_READ_GRACE_MS : 0);
  const speedBonus = Math.round(speedRatio * MAX_SPEED_BONUS);
  const difficultyBonus = (question.difficulty - 1) * 25;
  const cluePenalty =
    question.game === "spell-link" ? (clueStageAt(timeRemaining, duration) - 1) * SPELL_CLUE_PENALTY : 0;
  const distance = question.map && selectedMapPosition ? mapDistance(question.map.target, selectedMapPosition) : null;
  const precisionBonus =
    question.map && !question.map.choice && distance !== null
      ? Math.round(Math.max(0, 1 - distance / question.map.tolerance) * 100)
      : 0;

  return {
    speedBonus,
    difficultyBonus,
    cluePenalty,
    precisionBonus,
    mapDistance: distance,
    rawPoints: Math.max(25, 100 + speedBonus + difficultyBonus + precisionBonus - cluePenalty),
  };
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

function keyedAnswerLabel(answerKey: string, fallback: string) {
  const recipeItems = recipeItemsFromAnswerKey(answerKey);
  if (recipeItems) {
    return shopkeeperReferencesForKeys(recipeItems)
      .map((item) => `${item.name}${item.count > 1 ? ` ×${item.count}` : ""}`)
      .join(", ");
  }
  return SHOPKEEPER_CATALOG_BY_KEY.get(answerKey)?.name ?? HERO_PICKER_BY_KEY.get(answerKey)?.name ?? fallback;
}

function ShopkeeperRecipePick({ itemKeys, label }: { itemKeys: string[]; label: string }) {
  const items = shopkeeperReferencesForKeys(itemKeys);
  return (
    <span className={styles.shopkeeperRecipePick}>
      <small>{label}</small>
      {items.length ? (
        <ShopkeeperTray items={items} compact testId="shopkeeper-recipe-reveal-tray" />
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
          <label className={styles.shopkeeperSearch}>
            <Search aria-hidden="true" />
            <input
              type="search"
              value={query}
              data-testid="shopkeeper-search"
              placeholder="Search items"
              onChange={(event) => {
                setTooltip(null);
                setQuery(event.currentTarget.value);
              }}
              disabled={phase !== "answering" || selectedKey !== null}
            />
          </label>
        </div>

        {recipeBuilder && phase === "answering" && (
          <div
            className={styles.shopkeeperRecipeBuilder}
            data-testid="shopkeeper-recipe-builder"
            data-recipe-size={recipeSize}
            data-selection-count={activeRecipeKeys.length}
          >
            <span className={styles.shopkeeperRecipeBuilderLabel}>
              <small>Direct recipe</small>
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
            <ShopkeeperRecipePick itemKeys={submittedRecipeKeys} label="Your recipe" />
            <ArrowRight aria-hidden="true" />
            <ShopkeeperRecipePick itemKeys={correctRecipeKeys} label="Correct recipe" />
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
          data-shop-section={section}
          onScroll={() => setTooltip(null)}
        >
          {groups.map((group) => (
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
          ))}
          {normalizedQuery && searchItems.length === 0 && (
            <p className={styles.shopkeeperNoResults}>No shop item matches “{query.trim()}”.</p>
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
  const searchInputRef = useRef<HTMLInputElement>(null);
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
  const matchCount = normalizedQuery ? HERO_PICKER_HEROES.filter(heroMatches).length : HERO_PICKER_HEROES.length;

  const chooseHero = (heroKey: string) => {
    setQuery("");
    onChoose(heroKey);
  };

  useEffect(() => {
    if (phase !== "answering" || selectedKey !== null) return;

    const startSearching = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
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
      if (event.key === "Backspace" && query) {
        event.preventDefault();
        setQuery((value) => value.slice(0, -1));
        searchInputRef.current?.focus({ preventScroll: true });
        return;
      }
      if (event.key.length !== 1 || (!query && event.key.trim() === "")) return;

      event.preventDefault();
      setQuery((value) => `${value}${event.key}`);
      searchInputRef.current?.focus({ preventScroll: true });
    };

    window.addEventListener("keydown", startSearching);
    return () => window.removeEventListener("keydown", startSearching);
  }, [phase, query, selectedKey]);

  return (
    <div
      className={styles.heroPicker}
      data-testid="hero-picker"
      data-phase={phase}
      data-locked={selectedKey ? "true" : "false"}
      data-searching={normalizedQuery ? "true" : "false"}
      style={{ "--hero-grid-columns": HERO_PICKER_CATALOG.columns } as CSSProperties}
    >
      <label className={styles.heroPickerSearch}>
        <Search aria-hidden="true" />
        <input
          ref={searchInputRef}
          type="search"
          value={query}
          data-testid="hero-search"
          placeholder="Type to search heroes"
          aria-label="Search heroes"
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            setQuery("");
            event.currentTarget.blur();
          }}
          disabled={phase !== "answering" || selectedKey !== null}
        />
        {normalizedQuery && <small>{matchCount}</small>}
        {normalizedQuery && (
          <button
            type="button"
            data-testid="hero-search-clear"
            aria-label="Clear hero search"
            onClick={() => {
              setQuery("");
              searchInputRef.current?.focus({ preventScroll: true });
            }}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </label>
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

function shopkeeperFormatLabel(question: PublicArcadeQuestion) {
  if (question.shopkeeper?.format === "build-result") return "Build Result";
  if (question.shopkeeper?.format === "real-recipe") return "Real Recipe";
  if (question.shopkeeper?.format === "shared-part") return "Shared Part";
  return "Upgrade Path";
}

function shopkeeperRoundNote(question: PublicArcadeQuestion) {
  if (question.shopkeeper?.format === "build-result") return "Every shown component is part of the direct recipe";
  if (question.shopkeeper?.format === "real-recipe") return "Build the direct recipe from the shop";
  if (question.shopkeeper?.format === "shared-part") return "Compare the two direct shop recipes";
  return "Choose the item that directly upgrades from the shown part";
}

function shopkeeperAnswerAction(question: PublicArcadeQuestion) {
  if (question.shopkeeper?.format === "build-result") return "Choose the finished item";
  if (question.shopkeeper?.format === "real-recipe") return "Build the direct recipe";
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
  const [entryWaitDuration, setEntryWaitDuration] = useState(0);
  const [queueStartedAt, setQueueStartedAt] = useState<number | null>(null);
  const [runDuration, setRunDuration] = useState(0);
  const [now, setNow] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [gameVolume, setGameVolume] = useState(DEFAULT_GAME_VOLUME);
  const [lifetimeStats, setLifetimeStats] = useState<LifetimeStats>(EMPTY_STATS);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState("");
  const [activeRoundId, setActiveRoundId] = useState("");
  const [activePlayers, setActivePlayers] = useState(0);
  const [roundAudioState, setRoundAudioState] = useState<"loading" | "ready" | "playing" | "error">("loading");
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
  const queueStartedAtRef = useRef<number | null>(null);
  const finalizedRef = useRef(false);
  const participatedRef = useRef(false);
  const runSavedRef = useRef(false);
  const playerIdRef = useRef("");
  const roomSettingsRef = useRef<PublicRoomSettings | null>(null);
  const roomSnapshotRef = useRef<RoomSnapshot | null>(null);
  const roundIdRef = useRef("");
  const questionRevisionRef = useRef("");
  const entryWaitRoundIdRef = useRef("");
  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const feedbackAudioRef = useRef<{
    clips: Array<{ audio: HTMLAudioElement; gain: number; src: string }>;
    kind: "lock" | "correct" | "wrong" | "start";
  } | null>(null);
  const roundAudioRefs = useRef<Array<HTMLAudioElement | null>>([]);
  const roundAudioAbortRef = useRef<AbortController | null>(null);
  const autoPlayedAudioKeyRef = useRef("");
  const reportTargetRef = useRef<QuestionReportTarget | null>(null);
  const reportStateRef = useRef<"idle" | "sending" | "sent" | "error">("idle");
  const autoStartAttemptedRef = useRef(false);
  const alphaSessionIdRef = useRef("");
  const alphaSessionFinishedRef = useRef(false);
  const heroPreloadsRef = useRef<HTMLImageElement[]>([]);

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
      if (!soundEnabled || gameVolume <= 0 || typeof window === "undefined") return;

      const dotaSound = dotaFeedbackSoundForKind(kind);
      if (!dotaSound) return;

      let feedbackAudio = feedbackAudioRef.current;
      if (!feedbackAudio || feedbackAudio.kind !== kind) {
        feedbackAudio?.clips.forEach(({ audio }) => audio.pause());
        feedbackAudio = {
          clips: dotaSound.clips.map((clip: { gain: number; src: string }) => {
            const audio = new Audio(clip.src);
            audio.preload = "auto";
            return { audio, gain: clip.gain, src: clip.src };
          }),
          kind,
        };
        feedbackAudioRef.current = feedbackAudio;
      }

      for (const { audio, gain } of feedbackAudio.clips) {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = Math.min(1, gameVolume * gain);
        void audio.play().catch(() => {
          // A browser may reject playback before the first user gesture.
        });
      }
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
          } catch {
            if (!controller.signal.aborted) setRoundAudioState("error");
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

  const requestRoomSnapshot = useCallback(async (settings: PublicRoomSettings, playerId: string) => {
    const requestedAt = Date.now();
    const response = await fetch(`/api/rounds?${publicRoomQuery(settings, playerId, questionRevisionRef.current)}`, {
      cache: "no-store",
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
  }, []);

  const finalizeRound = useCallback(
    (snapshot: RoomSnapshot, localRevealDeadline: number) => {
      const question = currentQuestionRef.current;
      if (!question || finalizedRef.current || !participatedRef.current || snapshot.round.id !== roundIdRef.current) {
        return;
      }

      finalizedRef.current = true;
      setDeadline(null);
      setRevealDeadlineState(localRevealDeadline);
      setPhase("reveal");
      setCrowd(snapshot.crowd);

      const isCorrect = isPublicQuestionAnswerCorrect(
        question,
        selectedIndexRef.current ?? -1,
        selectedAnswerKeyRef.current ?? undefined,
      );
      const correctIndex = publicCorrectIndex(question);
      if (correctIndex < 0) throw new Error("The reveal did not include a correct answer.");
      const correctVotes = snapshot.crowd.counts[correctIndex];
      const majorityBonus = isCorrect && snapshot.crowd.total > 0 && correctVotes / snapshot.crowd.total < 0.5;
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
      const points = majorityBonus ? rawPoints * 2 : rawPoints;

      setRoundAward({
        points,
        majorityBonus,
        correct: isCorrect,
        speedBonus,
        cluePenalty,
        precisionBonus,
        mapDistance: distance,
      });
      setScore((currentScore) => currentScore + points);
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
      playSound(answerFeedbackKind(isCorrect));
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

      if (entryWaitRoundIdRef.current) {
        const waitingForRoundId = entryWaitRoundIdRef.current;
        const nextRoundIsStillTooLate = shouldWaitForNextRoundOnEntry(snapshot.round, snapshot.serverNow);
        const keepWaiting = snapshot.round.id === waitingForRoundId || nextRoundIsStillTooLate;

        if (keepWaiting) {
          const skippedAnotherRound = snapshot.round.id !== waitingForRoundId;
          entryWaitRoundIdRef.current = snapshot.round.id;
          currentQuestionRef.current = null;
          setCurrentQuestion(null);
          setDeadline(null);
          setRevealDeadlineState(null);
          setEntryWaitDeadline(localRevealDeadline);
          setEntryWaitDuration((currentDuration) =>
            currentDuration <= 0 || skippedAnotherRound
              ? Math.max(1_000, localRevealDeadline - receivedAt)
              : currentDuration,
          );
          setPhase("waiting");
          return;
        }

        entryWaitRoundIdRef.current = "";
        setEntryWaitDeadline(null);
        setEntryWaitDuration(0);
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
      if (phaseRef.current === "answering") {
        finalizeRound(snapshot, localRevealDeadline);
      } else {
        setDeadline(null);
        setPhase("reveal");
      }
    },
    [finalizeRound, setCrowd, setDeadline, setPhase, updateReportState, updateReportTarget],
  );

  const syncRoom = useCallback(() => {
    if (syncPromiseRef.current) return syncPromiseRef.current;
    const settings = roomSettingsRef.current;
    if (!settings) return Promise.resolve();

    const task = (async () => {
      try {
        const result = await requestRoomSnapshot(settings, ensurePlayerId());
        if (roomSettingsRef.current !== settings) return;
        applyRoomSnapshot(result.snapshot, result.clockOffset, result.receivedAt);
      } catch {
        if (roomSettingsRef.current === settings) {
          setRoomError("Connection interrupted · retrying automatically");
        }
      }
    })();

    syncPromiseRef.current = task;
    void task.finally(() => {
      if (syncPromiseRef.current === task) syncPromiseRef.current = null;
    });
    return task;
  }, [applyRoomSnapshot, ensurePlayerId, requestRoomSnapshot]);

  const startRun = useCallback(
    async (updateHistory = true) => {
      if (joiningRoom) return;

      const settings: PublicRoomSettings = {
        gameId: DEFAULT_GAME_ID,
        mode: PUBLIC_ARCADE_MODE,
        filter: "Mixed",
      };
      setJoiningRoom(true);
      setRoomError(null);
      roomSettingsRef.current = settings;
      questionRevisionRef.current = "";
      playSound("start");

      try {
        const result = await requestRoomSnapshot(settings, ensurePlayerId());
        if (roomSettingsRef.current !== settings) return;

        const startedAt = Date.now();
        roundIdRef.current = "";
        entryWaitRoundIdRef.current = "";
        currentQuestionRef.current = null;
        roundIndexRef.current = 0;
        queueStartedAtRef.current = startedAt;
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
        setRunDuration(0);
        setQueueStartedAt(startedAt);
        setEntryWaitDeadline(null);
        setEntryWaitDuration(0);
        const alphaSessionId = window.crypto.randomUUID();
        alphaSessionIdRef.current = alphaSessionId;
        alphaSessionFinishedRef.current = false;
        updateReportTarget(null);
        setReportNotice(null);
        setReportedReason(null);
        updateReportState("idle");
        if (shouldWaitForNextRoundOnEntry(result.snapshot.round, result.snapshot.serverNow)) {
          entryWaitRoundIdRef.current = result.snapshot.round.id;
        }
        applyRoomSnapshot(result.snapshot, result.clockOffset, result.receivedAt);
        void sendAlphaSessionEvent("start", alphaSessionId).catch(() => undefined);
        if (updateHistory && window.location.pathname !== PUBLIC_ARCADE_PATH) {
          window.history.pushState({ queueArcadeView: "play" }, "", PUBLIC_ARCADE_PATH);
        }
      } catch {
        if (roomSettingsRef.current === settings) {
          roomSettingsRef.current = null;
          setRoomError("Could not join the public room. The arcade will keep your settings.");
        }
      } finally {
        setJoiningRoom(false);
      }
    },
    [
      applyRoomSnapshot,
      ensurePlayerId,
      joiningRoom,
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
            ? keyedAnswerLabel(question.reveal.correctAnswerKey, question.eyebrow)
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
          setCrowd({
            counts: result.counts,
            total: result.total,
            positions: result.positions,
            keyCounts: result.keyCounts,
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
          }
          setRoomError(null);
        }
      } catch {
        if (roundIdRef.current === snapshot.round.id) {
          selectedIndexRef.current = null;
          selectedAnswerKeyRef.current = null;
          selectedMapPositionRef.current = null;
          answerTimeLeftRef.current = 0;
          setSelectedIndex(null);
          setSelectedAnswerKey(null);
          setSelectedMapPosition(null);
          setAnswerTimeLeft(0);
          setRoomError("Vote confirmation delayed · checking the room");
        }
        void syncRoom();
      }
    },
    [ensurePlayerId, setCrowd, syncRoom],
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
      setSelectedIndex(answerIndex);
      setSelectedMapPosition(position);
      setAnswerTimeLeft(timeLeft);
      playSound("lock");
      void submitVote(answerIndex, { mapPosition: position });
    },
    [playSound, submitVote],
  );

  const finishSession = useCallback(() => {
    if (phaseRef.current === "lobby" || phaseRef.current === "summary") return;
    const finishedAt = Date.now();
    const startedAt = queueStartedAtRef.current ?? finishedAt;
    finishAlphaSession();
    roomSettingsRef.current = null;
    roomSnapshotRef.current = null;
    updateReportTarget(null);
    setReportNotice(null);
    updateReportState("idle");
    setRunDuration(finishedAt - startedAt);
    setDeadline(null);
    setRevealDeadlineState(null);
    setPhase("summary");
  }, [finishAlphaSession, setDeadline, setPhase, updateReportState, updateReportTarget]);

  const returnToLobby = useCallback(
    (historyAction: "push" | "replace" | "none" = "push") => {
      if (phaseRef.current !== "lobby" && phaseRef.current !== "summary") finishAlphaSession();
      roomSettingsRef.current = null;
      roomSnapshotRef.current = null;
      roundIdRef.current = "";
      questionRevisionRef.current = "";
      entryWaitRoundIdRef.current = "";
      autoStartAttemptedRef.current = false;
      feedbackAudioRef.current?.clips.forEach(({ audio }) => audio.pause());
      stopRoundAudio(false);
      updateReportTarget(null);
      setReportNotice(null);
      updateReportState("idle");
      setDeadline(null);
      setRevealDeadlineState(null);
      setEntryWaitDeadline(null);
      setEntryWaitDuration(0);
      setActiveRoomId("");
      setActiveRoundId("");
      setPhase("lobby");

      if (historyAction !== "none" && window.location.pathname !== ARCADE_LOBBY_PATH) {
        const method = historyAction === "replace" ? "replaceState" : "pushState";
        window.history[method]({ queueArcadeView: "lobby" }, "", ARCADE_LOBBY_PATH);
      }
    },
    [finishAlphaSession, setDeadline, setPhase, stopRoundAudio, updateReportState, updateReportTarget],
  );

  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname === PUBLIC_ARCADE_PATH) {
        if (phaseRef.current === "lobby" || phaseRef.current === "summary") void startRun(false);
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
    if (phase === "lobby" || phase === "summary") return;
    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase === "lobby" || phase === "summary") return;

    const interval = window.setInterval(() => void syncRoom(), 1_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void syncRoom();
    };

    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
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
    if (phase === "answering" && deadline && now >= deadline) void syncRoom();
  }, [deadline, now, phase, syncRoom]);

  useEffect(() => {
    if (phase === "reveal" && revealDeadline && now >= revealDeadline) void syncRoom();
  }, [now, phase, revealDeadline, syncRoom]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadAccount(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadAccount]);

  useEffect(() => {
    if (phase !== "summary") return;
    const timeout = window.setTimeout(() => void loadAccount(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadAccount, phase]);

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
    if (phase !== "summary" || runSavedRef.current) return;
    runSavedRef.current = true;

    setLifetimeStats((currentStats) => {
      const nextStats = {
        runs: currentStats.runs + 1,
        answered: currentStats.answered + history.length,
        correct: currentStats.correct + correctCount,
        bestScore: Math.max(currentStats.bestScore, score),
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextStats));
      return nextStats;
    });
  }, [correctCount, history.length, phase, score]);

  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return;

    const channel = pusher.subscribe("queue-arcade");
    const onVoteUpdate = (event: unknown) => {
      if (!event || typeof event !== "object" || !("roundId" in event)) return;
      const roundId = event.roundId;
      const result = normalizeCrowd(event);
      if (typeof roundId === "string" && result && roundIdRef.current === roundId) {
        setCrowd(result);
      }
    };

    channel.bind("vote-update", onVoteUpdate);
    return () => {
      channel.unbind("vote-update", onVoteUpdate);
      pusher.unsubscribe("queue-arcade");
    };
  }, [setCrowd]);

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

  useEffect(
    () => () => {
      feedbackAudioRef.current?.clips.forEach(({ audio }) => audio.pause());
      stopRoundAudio(false);
    },
    [stopRoundAudio],
  );

  const answerRemaining = deadline ? Math.max(0, deadline - now) : 0;
  const revealRemaining = revealDeadline ? Math.max(0, revealDeadline - now) : 0;
  const entryWaitRemaining = entryWaitDeadline ? Math.max(0, entryWaitDeadline - now) : 0;
  const entryWaitRatio = entryWaitDuration > 0 ? entryWaitRemaining / entryWaitDuration : 0;
  const timerRatio = phase === "answering" ? answerRemaining / answerDuration : revealRemaining / REVEAL_DURATION_MS;
  const sessionElapsed = queueStartedAt ? Math.max(0, now - queueStartedAt) : 0;
  const selectedWasCorrect =
    selectedIndex !== null && currentQuestion
      ? isPublicQuestionAnswerCorrect(currentQuestion, selectedIndex, selectedAnswerKey ?? undefined)
      : false;
  const currentGame = currentQuestion?.game ?? "trivia";
  const isRecipeBuilderRound = Boolean(currentQuestion && isPublicRecipeBuilderQuestion(currentQuestion));
  const isOpenShopRound = Boolean(
    currentQuestion && (isPublicBuildResultQuestion(currentQuestion) || isPublicRecipeBuilderQuestion(currentQuestion)),
  );
  const isHeroPickerRound = Boolean(currentQuestion && isPublicHeroPickerQuestion(currentQuestion));
  const isSoundcheckRound = currentGame === "soundcheck";
  const isEchoHuntRound = currentGame === "echo-hunt";
  const isProgressiveAudioRound = isSoundcheckRound || isEchoHuntRound;
  const isSoundSequence = isSoundcheckRound && currentQuestion?.soundcheck?.format === "sequence";
  const mapChoiceRound = currentGame === "map-sense" && Boolean(currentQuestion?.map?.choice);
  const clueStage =
    phase === "reveal"
      ? 3
      : currentGame === "spell-link" || currentGame === "quote-hunt"
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
          <span className={styles.fanBadge}>Unofficial fan project</span>
          <div className={styles.volumeControl} data-muted={!soundEnabled}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => {
                if (soundEnabled) {
                  stopRoundAudio();
                  feedbackAudioRef.current?.clips.forEach(({ audio }) => audio.pause());
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
                if (feedbackAudioRef.current) {
                  feedbackAudioRef.current.clips.forEach(({ audio, gain }) => {
                    audio.volume = Math.min(1, nextVolume * gain);
                  });
                }
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

      {phase === "lobby" && (
        <section className={styles.lobby} id="arcade">
          <div className={styles.lobbyCopy}>
            <div className={styles.liveLabel}>
              <span />
              {activePlayers > 0
                ? `${activePlayers.toLocaleString("en-US")} playing now · Ten round formats`
                : "One public room · Ten round formats"}
            </div>
            <h1>
              Your queue has
              <br />
              <em>side quests.</em>
            </h1>
            <p className={styles.lead}>
              A tiny Dota arcade built for the gap between Find Match and Accept. Everyone plays the same endless
              rotation; the challenge changes every round.
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
                disabled={joiningRoom}
              >
                <Gamepad2 />
                {joiningRoom ? "Joining public room…" : activeModeInfo.action}
                <ChevronRight />
              </button>
              <div className={styles.accountActionSlot} data-testid="account-action-slot">
                {account === null ? (
                  <span className={styles.accountLoading} aria-hidden="true" />
                ) : account.authenticated ? (
                  <Link href="/profile" className={styles.profileAction} data-testid="profile-action">
                    {account.profile.user.avatarUrl ? (
                      <Image src={account.profile.user.avatarUrl} alt="" width={34} height={34} />
                    ) : (
                      <span>{playerInitials(account.profile.user.displayName)}</span>
                    )}
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

            <div className={clsx(styles.roomNotice, roomError && styles.roomNoticeError)} aria-live="polite">
              <Signal />
              {roomError ??
                (activePlayers > 0
                  ? `${activePlayers.toLocaleString("en-US")} playing now · one shared round`
                  : "Live room · one shared round and reveal")}
            </div>

            <div className={styles.featureStrip}>
              <div>
                <strong>{PUBLIC_ROUND_FORMATS.length}</strong>
                <span>round formats</span>
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
              <div className={styles.previewAnswers}>
                {PREVIEW_QUESTION.answers.map((answer, index) => (
                  <div key={answer}>
                    <span>{LETTERS[index]}</span>
                    {answer}
                  </div>
                ))}
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

      {phase === "waiting" && (
        <section className={styles.entryWait} data-testid="round-entry-wait" aria-label="Waiting for the next round">
          <div className={styles.entryWaitStage}>
            <div className={styles.timerTrack} aria-hidden="true">
              <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, entryWaitRatio))})` }} />
            </div>
            <div className={styles.entryWaitContent}>
              <span className={styles.entryWaitIcon} aria-hidden="true">
                <Radio />
              </span>
              <small>Public arcade · synchronized</small>
              <h1>Next round</h1>
              <strong data-testid="entry-wait-timer">
                00:{String(Math.ceil(entryWaitRemaining / 1_000)).padStart(2, "0")}
              </strong>
              <div className={styles.entryWaitPulse} aria-hidden="true">
                {Array.from({ length: 7 }, (_, index) => (
                  <i key={index} />
                ))}
              </div>
              <span
                className={clsx(styles.entryWaitStatus, roomError && styles.entryWaitStatusError)}
                aria-live="polite"
              >
                {roomError && (
                  <>
                    <Signal />
                    {roomError}
                  </>
                )}
              </span>
            </div>
          </div>
        </section>
      )}

      {(phase === "answering" || phase === "reveal") && currentQuestion && (
        <section
          className={styles.gameLayout}
          data-testid="public-room"
          data-round-game={currentGame}
          data-content-difficulty={currentQuestion.difficulty}
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
                className={clsx(
                  styles.timer,
                  answerRemaining <= answerDuration / 3 && phase === "answering" && styles.timerDanger,
                )}
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

            {currentGame === "map-sense" ? (
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
                  <span>Shopkeeper Rush · {shopkeeperFormatLabel(currentQuestion)}</span>
                  <h2>{currentQuestion.prompt}</h2>
                  <small>
                    Patch {currentQuestion.patch}
                    {!isOpenShopRound && ` · ${shopkeeperRoundNote(currentQuestion)}`}
                  </small>
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
                  <span>Spell Link</span>
                  <h2>Which hero owns this ability?</h2>
                  <div className={styles.clueList}>
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
                  <small>Every extra clue costs {SPELL_CLUE_PENALTY} points, on top of the fading speed bonus</small>
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
                  <span>Fogged Vision · Progressive reveal</span>
                  <h2>Which hero is hiding in the fog?</h2>
                  <div className={styles.fogMeter} aria-label={`Portrait clarity stage ${clueStage} of 3`}>
                    {Array.from({ length: 3 }, (_, index) => (
                      <span key={index} className={index < clueStage ? styles.fogMeterActive : undefined} />
                    ))}
                  </div>
                  <small>Trust the silhouette, palette, and pose.</small>
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
                    {roundAudioState === "error"
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
                        ? "Soundcheck · Ordered pair"
                        : `Soundcheck · ${currentQuestion.soundcheck?.family === "item" ? "Item activation" : "Ability sound"}`
                      : "Echo Hunt · Hero response"}
                  </span>
                  <h2>{isSoundcheckRound ? currentQuestion.prompt : "Whose voice crossed the river?"}</h2>
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
                  <span>Quote Hunt</span>
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
                  <span>{currentQuestion.eyebrow}</span>
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
                  <span>{currentQuestion.eyebrow}</span>
                  <h2>{currentQuestion.prompt}</h2>
                  {currentQuestion.detail && <p className={styles.questionDetail}>{currentQuestion.detail}</p>}
                  <small>Patch {currentQuestion.patch} · No talents or upgrades unless stated</small>
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

            {!isOpenShopRound && !isHeroPickerRound && currentGame !== "map-sense" && (
              <div
                className={clsx(
                  styles.answers,
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
                            (currentGame === "spell-link" || currentGame === "echo-hunt" || currentGame === "quote-hunt"
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
                      {isOpenShopRound ? <ShoppingBag /> : isHeroPickerRound ? <Users /> : <Keyboard />}
                      {isOpenShopRound
                        ? isRecipeBuilderRound
                          ? "Build the direct recipe"
                          : isSoundcheckRound
                            ? "Choose the item that made the sound"
                            : "Choose an item from the shop"
                        : isHeroPickerRound
                          ? "Choose a hero"
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
                      <span>Correct now: {liveAward?.rawPoints ?? 0} pts</span>
                    </>
                  ) : (
                    <>
                      <Signal className={styles.signalIcon} />
                      Answer locked with {Math.ceil(answerTimeLeft / 1000)}s left
                      <span>Worth {liveAward?.rawPoints ?? 0} pts if correct</span>
                    </>
                  )}
                </div>
              )
            ) : (
              <div
                className={clsx(styles.revealPanel, selectedWasCorrect ? styles.revealCorrect : styles.revealWrong)}
                aria-live="polite"
              >
                <div className={styles.revealIcon}>{selectedWasCorrect ? <Check /> : <X />}</div>
                <div className={styles.revealCopy}>
                  <span>{selectedWasCorrect ? "Correct" : selectedIndex === null ? "Time expired" : "Not quite"}</span>
                  <p>{currentQuestion.reveal?.explanation}</p>
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
                  <span>points</span>
                </div>
              </div>
            )}
          </div>

          <aside className={styles.sideRail}>
            <div className={styles.queueCard}>
              <div className={styles.queueStatus}>
                <span className={styles.sessionIcon}>
                  <Gamepad2 />
                </span>
                <span>
                  <small>{MODE_INFO[PUBLIC_ARCADE_MODE].shortLabel}</small>
                  Endless synchronized rounds
                </span>
                <strong>{formatDuration(sessionElapsed)}</strong>
              </div>
              <div className={styles.queueDetails}>
                <span data-testid="room-presence">
                  {activePlayers.toLocaleString("en-US")} {activePlayers === 1 ? "player" : "players"} online
                </span>
                <i />
                <span title={roomError ?? activeRoomId}>{roomError ? "Reconnecting" : "Live room"}</span>
              </div>
              <button type="button" data-testid="view-summary" onClick={finishSession}>
                <Trophy />
                View summary
              </button>
            </div>

            <div className={styles.scoreGrid}>
              <div>
                <span>Score</span>
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
                <strong>Round {roundIndex + 1}</strong>
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

            <div className={styles.crowdCard}>
              <div className={styles.cardTitle}>
                <span>
                  <Radio />
                  {currentGame === "map-sense" ? (mapChoiceRound ? "Room answers" : "Room pings") : "Global answers"}
                </span>
                <span className={styles.livePill}>Live room</span>
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
              <p>
                {currentGame === "map-sense" && !mapChoiceRound
                  ? phase === "answering"
                    ? crowd.total
                      ? `${crowd.total.toLocaleString("en-US")} locked in.`
                      : "The room is reading the map."
                    : crowd.total
                      ? "Every anonymous pin is now visible on the map."
                      : "No pins landed before the deadline."
                  : phase === "answering"
                    ? crowd.total
                      ? `${crowd.total.toLocaleString("en-US")} ${
                          crowd.total === 1 ? "player has" : "players have"
                        } locked in. The split stays hidden until the shared deadline.`
                      : "Answers appear here as players lock in. The split stays hidden until the shared deadline."
                    : crowd.total
                      ? "Final answer split for this synchronized public round."
                      : "Nobody answered before this room’s deadline."}
              </p>
              {(isOpenShopRound || isHeroPickerRound) && phase === "reveal" && crowd.keyCounts.length > 0 ? (
                <div
                  className={styles.shopkeeperCrowdPicks}
                  data-testid={
                    isRecipeBuilderRound
                      ? "shopkeeper-recipe-crowd-picks"
                      : isOpenShopRound
                        ? "shopkeeper-crowd-picks"
                        : "hero-crowd-picks"
                  }
                  data-answer-mode={isRecipeBuilderRound ? "item-recipe" : undefined}
                >
                  {crowd.keyCounts.slice(0, 3).map(({ answerKey, count }) => {
                    if (isRecipeBuilderRound) {
                      const itemKeys = recipeItemsFromAnswerKey(answerKey);
                      if (!itemKeys) return null;
                      return (
                        <span key={answerKey}>
                          <ShopkeeperTray items={shopkeeperReferencesForKeys(itemKeys)} compact />
                          <small>{Math.round((count / crowd.total) * 100)}%</small>
                        </span>
                      );
                    }
                    const answer = isOpenShopRound
                      ? SHOPKEEPER_CATALOG_BY_KEY.get(answerKey)
                      : HERO_PICKER_BY_KEY.get(answerKey);
                    if (!answer) return null;
                    return (
                      <span key={answerKey}>
                        <Image src={answer.image} alt="" width={38} height={28} unoptimized />
                        <strong>{answer.name}</strong>
                        <small>{Math.round((count / crowd.total) * 100)}%</small>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.crowdPulse} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </div>
          </aside>
        </section>
      )}

      {phase === "summary" && (
        <section className={styles.summary}>
          <div className={styles.summaryGlow} />
          <div className={styles.summaryTop}>
            <div className={styles.matchFound}>
              <span>
                <Check />
              </span>
              Session ended
            </div>
            <span className={styles.summaryPatch}>{gameInfo.contentLabel}</span>
          </div>

          <div className={styles.summaryHero}>
            <div className={styles.rankMedallion}>
              <BrandMark logoUrl={gameInfo.logoUrl} />
              <span>{accuracy(correctCount, history.length)}</span>
              <small>%</small>
            </div>
            <span>Session report</span>
            <h1>{summaryTitle(correctCount, history.length)}</h1>
            <p>
              {correctCount} correct across {history.length} completed round{history.length === 1 ? "" : "s"} in{" "}
              {formatDuration(runDuration)}.
            </p>
          </div>

          <div className={styles.summaryStats}>
            <div>
              <Gauge />
              <span>Final score</span>
              <strong>{score.toLocaleString("en-US")}</strong>
            </div>
            <div>
              <Check />
              <span>Accuracy</span>
              <strong>{accuracy(correctCount, history.length)}%</strong>
            </div>
            <div>
              <Flame />
              <span>Best streak</span>
              <strong>{bestStreak}</strong>
            </div>
            <div>
              <Trophy />
              <span>Rounds played</span>
              <strong>{history.length}</strong>
            </div>
          </div>

          <div className={styles.summaryRounds}>
            <div className={styles.cardTitle}>
              <span>{history.length > 20 ? "Last 20 rounds" : "Round breakdown"}</span>
              <strong>{MODE_INFO[PUBLIC_ARCADE_MODE].label}</strong>
            </div>
            <div>
              {history.slice(-20).map((record, index) => (
                <span
                  key={`${record.id}:${index}`}
                  className={record.correct ? styles.summaryRoundCorrect : styles.summaryRoundWrong}
                  title={`${gameLabel(record.game)} · ${record.category}: ${record.correct ? "Correct" : "Incorrect"} · ${record.points} points`}
                >
                  <small>
                    <ModeIcon mode={record.game} />
                    {Math.max(0, history.length - 20) + index + 1}
                  </small>
                  {record.correct ? <Check /> : <X />}
                  <strong>+{record.points}</strong>
                </span>
              ))}
              {history.length === 0 && <p>No completed rounds—your match popped instantly.</p>}
            </div>
          </div>

          <div className={styles.summaryActions}>
            <button type="button" className={styles.primaryButton} onClick={() => void startRun()}>
              <RotateCcw />
              Play again
              <ChevronRight />
            </button>
            <button type="button" className={styles.secondaryButton} onClick={() => returnToLobby("replace")}>
              Back to arcade
            </button>
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
