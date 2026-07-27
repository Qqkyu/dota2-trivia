"use client";

import Image from "next/image";
import {
  AudioLines,
  Brain,
  Check,
  ChevronRight,
  CircleStop,
  Clock3,
  Crosshair,
  Flame,
  Gauge,
  Gamepad2,
  Headphones,
  Keyboard,
  MapPin,
  MessageSquareQuote,
  Radio,
  RotateCcw,
  ShoppingBag,
  Shuffle,
  Signal,
  ScanEye,
  Sparkles,
  Swords,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getPusherClient } from "@/lib/pusher";
import {
  difficultyLabel,
  KNOWLEDGE_FILTERS,
  SKILL_LEVELS,
  type ArcadeMode,
  type ArcadeRound,
  type KnowledgeFilter,
  type RoundGame,
  type SkillLevel,
  type TriviaArtworkKind,
  type TriviaQuestion,
} from "@/lib/trivia";
import type { CrowdResult, PublicRoomSettings, RoomSnapshot, VoteResult } from "@/lib/arcade-contract";
import { DEFAULT_GAME_ID, GAME_CATALOGS, GAME_IDS } from "@/lib/game-catalogs";
import { MAP_SENSE_BAND_LABELS, MAP_SENSE_IMAGE, mapAnswerIndex, mapDistance, isMapPosition } from "@/lib/map-sense";
import type { MapPosition } from "@/lib/map-types";
import { MAP_READ_GRACE_MS, speedScoreRatio } from "@/lib/scoring.mjs";
import styles from "./queue-arcade.module.css";

const REVEAL_DURATION_MS = 7_000;
const MAX_SPEED_BONUS = 100;
const SPELL_CLUE_PENALTY = 40;
const LETTERS = ["A", "B", "C", "D"] as const;
const EMPTY_CROWD: CrowdResult = { counts: [0, 0, 0, 0], total: 0, positions: [] };
const STORAGE_KEY = "queue-arcade:stats:v2";
const PLAYER_KEY = "queue-arcade:player:v2";
const SETTINGS_KEY = "queue-arcade:settings:v2";
const LEGACY_STORAGE_KEY = "queue-trivia:stats:v1";
const LEGACY_PLAYER_KEY = "queue-trivia:player:v1";
const LEGACY_SETTINGS_KEY = "queue-trivia:settings:v1";
const ACTIVE_GAME = GAME_CATALOGS[DEFAULT_GAME_ID];
const ACTIVE_QUESTIONS = ACTIVE_GAME.questions;
const QUESTIONS_BY_ID = new Map(ACTIVE_QUESTIONS.map((question) => [question.id, question]));
const ARCADE_MODES: ArcadeMode[] = [...ACTIVE_GAME.modes];

const SKILL_INFO: Record<
  SkillLevel,
  {
    duration: number;
    label: string;
    description: string;
  }
> = {
  Open: {
    duration: 15_000,
    label: "Open",
    description: "15s · every level",
  },
  Learning: {
    duration: 18_000,
    label: "Learning",
    description: "18s · warm-ups",
  },
  Veteran: {
    duration: 12_000,
    label: "Veteran",
    description: "12s · hard pool",
  },
};

type GamePhase = "lobby" | "answering" | "reveal" | "summary";

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
  category: TriviaQuestion["category"];
  game: RoundGame;
  correct: boolean;
  points: number;
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
    label: "Mixed Arcade",
    shortLabel: "Mixed",
    eyebrow: "House pick · Recommended",
    description: "Facts, recipes, spells, fog, voices, quotes, and map pings rotate every round.",
    action: "Enter mixed arcade",
    rule: "Every seven rounds contains all seven games exactly once.",
  },
  trivia: {
    label: "Queue Trivia",
    shortLabel: "Trivia",
    eyebrow: "The original",
    description: "Mana, damage, cooldowns, heroes, and items—the classic global-results loop.",
    action: "Start trivia queue",
    rule: "Choose which corner of Dota knowledge you want to practice.",
  },
  shopkeeper: {
    label: "Shopkeeper Rush",
    shortLabel: "Shopkeeper",
    eyebrow: "Recipe speedrun",
    description: "The recipe is missing a component. Scan the shelf and finish the item before the courier arrives.",
    action: "Open the secret shop",
    rule: "One recipe, one missing component, four items on the shelf.",
  },
  "spell-link": {
    label: "Spell Link",
    shortLabel: "Spell Link",
    eyebrow: "Icon recognition",
    description: "Match an ability to its hero while extra clues unlock as the clock burns down.",
    action: "Link some spells",
    rule: "Extra clues unlock as time burns down, and each one reduces the available score.",
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
    eyebrow: "Sound check",
    description: "Hear a hero response and identify its owner from four closely matched portraits.",
    action: "Hunt some echoes",
    rule: "Play or replay the voice line while the shared round timer keeps moving.",
  },
  "quote-hunt": {
    label: "Quote Hunt",
    shortLabel: "Quotes",
    eyebrow: "Who said it?",
    description: "Read a real hero response and identify the speaker from their attitude, diction, and worldview.",
    action: "Read between the lines",
    rule: "One proper hero line, four closely matched portraits, no laughs or throwaway noises.",
  },
  "map-sense": {
    label: "Map Sense",
    shortLabel: "Map Sense",
    eyebrow: "Pinpoint the play",
    description: "Drop a pin on Dota's terrain, then see the true spot and where the whole room guessed.",
    action: "Read the map",
    rule: "The first three seconds preserve full speed points. Precision decides the rest.",
  },
};

function ModeIcon({ mode }: { mode: ArcadeMode | RoundGame }) {
  if (mode === "mixed") return <Shuffle />;
  if (mode === "shopkeeper") return <ShoppingBag />;
  if (mode === "spell-link") return <WandSparkles />;
  if (mode === "fogged-vision") return <ScanEye />;
  if (mode === "echo-hunt") return <AudioLines />;
  if (mode === "quote-hunt") return <MessageSquareQuote />;
  if (mode === "map-sense") return <MapPin />;
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
  };
}

function normalizePlayerVote(value: unknown) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || !("answerIndex" in value) || !("submittedAt" in value)) {
    return undefined;
  }

  const { answerIndex, submittedAt } = value;
  const mapPosition = "mapPosition" in value ? value.mapPosition : undefined;
  if (
    typeof answerIndex !== "number" ||
    !Number.isInteger(answerIndex) ||
    answerIndex < 0 ||
    answerIndex > 3 ||
    typeof submittedAt !== "number" ||
    !Number.isFinite(submittedAt) ||
    (mapPosition !== undefined && !isMapPosition(mapPosition))
  ) {
    return undefined;
  }

  return { answerIndex, submittedAt, ...(mapPosition ? { mapPosition } : {}) };
}

function normalizeRoomSnapshot(value: unknown): RoomSnapshot | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("serverNow" in value) ||
    !("room" in value) ||
    !("round" in value) ||
    !("crowd" in value) ||
    !("playerVote" in value)
  ) {
    return null;
  }

  const candidate = value as Partial<RoomSnapshot>;
  const room = candidate.room;
  const round = candidate.round;
  const crowd = normalizeCrowd(candidate.crowd);
  const playerVote = normalizePlayerVote(candidate.playerVote);

  if (
    typeof candidate.serverNow !== "number" ||
    !room ||
    typeof room.id !== "string" ||
    !GAME_IDS.includes(room.gameId) ||
    typeof room.contentVersion !== "string" ||
    !ARCADE_MODES.includes(room.mode) ||
    !KNOWLEDGE_FILTERS.includes(room.filter) ||
    !SKILL_LEVELS.includes(room.skillLevel) ||
    !round ||
    typeof round.id !== "string" ||
    typeof round.number !== "number" ||
    (round.phase !== "answering" && round.phase !== "reveal") ||
    !["trivia", "shopkeeper", "spell-link", "fogged-vision", "echo-hunt", "quote-hunt", "map-sense"].includes(
      round.game,
    ) ||
    typeof round.questionId !== "string" ||
    typeof round.startedAt !== "number" ||
    typeof round.answerDeadline !== "number" ||
    typeof round.revealDeadline !== "number" ||
    typeof round.answerDuration !== "number" ||
    !crowd ||
    playerVote === undefined
  ) {
    return null;
  }

  return {
    serverNow: candidate.serverNow,
    room,
    round,
    crowd,
    playerVote,
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

function publicRoomQuery(settings: PublicRoomSettings, playerId: string) {
  return new URLSearchParams({
    gameId: settings.gameId,
    mode: settings.mode,
    filter: settings.filter,
    skillLevel: settings.skillLevel,
    playerId,
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
  question: ArcadeRound,
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
  const precisionBonus = question.map
    ? distance === null
      ? 100
      : Math.round(Math.max(0, 1 - distance / question.map.tolerance) * 100)
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

function spellMechanicHint(hint: string) {
  const mechanics = [
    [/\b(move|movement|speed|dash|blink|teleport|leap|walk|rush)\w*/i, "Mobility"],
    [/\b(stun|slow|silence|root|disable|knock|trap)\w*|prevent\w*[^.]{0,40}\bcast\w*/i, "Control"],
    [/\b(damage|attack|critical|strike)\w*/i, "Damage"],
    [/\b(heal|health|regen|lifesteal|restore)\w*/i, "Sustain"],
    [/\b(armor|shield|resist|invulnerable|evasion)\w*/i, "Defense"],
    [/\b(summon|illusion|replica|remnant|golem)\w*/i, "Summon"],
  ] as const;
  const matches = mechanics.filter(([pattern]) => pattern.test(hint)).map(([, label]) => label);
  return matches.length ? matches.slice(0, 2).join(" · ") : "Utility effect";
}

function QuestionArtwork({
  question,
  concealIdentity = false,
}: {
  question: TriviaQuestion;
  concealIdentity?: boolean;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const image = question.image;
  const source = image?.src ?? "";
  const failed = failedSource === source;
  const loaded = loadedSource === source;

  if (!image) return null;

  return (
    <div
      data-testid="question-artwork"
      data-artwork-state={failed ? "fallback" : loaded ? "loaded" : "loading"}
      className={clsx(
        styles.artwork,
        image.kind === "hero" && styles.heroArtwork,
        image.kind === "item" && styles.itemArtwork,
      )}
    >
      <div className={styles.artGlow} />
      {failed ? (
        <span className={styles.artFallback}>{concealIdentity ? "?" : question.eyebrow.slice(0, 2).toUpperCase()}</span>
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

function percentagePosition(position: MapPosition) {
  return {
    left: `${position.x * 100}%`,
    top: `${position.y * 100}%`,
  } satisfies CSSProperties;
}

function MapSenseBoard({
  question,
  phase,
  selectedPosition,
  crowd,
  onChoose,
}: {
  question: ArcadeRound;
  phase: GamePhase;
  selectedPosition: MapPosition | null;
  crowd: CrowdResult;
  onChoose: (position: MapPosition) => void;
}) {
  const [aimPosition, setAimPosition] = useState<MapPosition | null>(null);
  const challenge = question.map;

  if (!challenge) return null;

  const canChoose = phase === "answering" && !selectedPosition;
  const selectedDistance = selectedPosition ? mapDistance(challenge.target, selectedPosition) : null;
  const selectedBand = selectedPosition ? mapAnswerIndex(challenge, selectedPosition) : null;
  const targetRingStyle = {
    left: `${challenge.target.x * 100}%`,
    top: `${challenge.target.y * 100}%`,
    width: `${challenge.tolerance * 200}%`,
    height: `${challenge.tolerance * 200}%`,
  } satisfies CSSProperties;

  const positionFromPointer = (element: HTMLButtonElement, clientX: number, clientY: number) => {
    const bounds = element.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height)),
    };
  };

  return (
    <div className={styles.mapSenseQuestion} data-testid="map-sense-round">
      <div className={styles.mapBoardFrame}>
        <button
          type="button"
          className={styles.mapBoard}
          data-testid="map-sense-board"
          data-map-state={phase === "reveal" ? "reveal" : selectedPosition ? "locked" : "aiming"}
          disabled={!canChoose}
          aria-label={
            canChoose
              ? `Place your pin for: ${question.prompt} Use the pointer, or arrow keys and Enter.`
              : `Map pin ${selectedPosition ? "locked" : "unavailable"} for ${question.prompt}`
          }
          onFocus={() => {
            if (canChoose && !aimPosition) setAimPosition({ x: 0.5, y: 0.5 });
          }}
          onPointerMove={(event) => {
            if (canChoose) setAimPosition(positionFromPointer(event.currentTarget, event.clientX, event.clientY));
          }}
          onPointerLeave={() => {
            if (canChoose) setAimPosition(null);
          }}
          onKeyDown={(event) => {
            if (!canChoose) return;
            const movement = 0.025;
            const current = aimPosition ?? { x: 0.5, y: 0.5 };
            const next = { ...current };
            if (event.key === "ArrowLeft") next.x -= movement;
            else if (event.key === "ArrowRight") next.x += movement;
            else if (event.key === "ArrowUp") next.y -= movement;
            else if (event.key === "ArrowDown") next.y += movement;
            else if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onChoose(current);
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
            if (!canChoose || event.detail === 0) return;
            onChoose(positionFromPointer(event.currentTarget, event.clientX, event.clientY));
          }}
        >
          <Image
            src={MAP_SENSE_IMAGE}
            alt="Dota 2 battlefield"
            fill
            sizes="(max-width: 680px) calc(100vw - 50px), 520px"
            className={styles.mapImage}
            priority
          />
          <span className={styles.mapGrid} aria-hidden="true" />

          {phase === "reveal" && crowd.positions.length > 0 && (
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

          {phase === "reveal" && selectedPosition && (
            <svg className={styles.mapDistanceLine} viewBox="0 0 100 100" aria-hidden="true">
              <line
                x1={selectedPosition.x * 100}
                y1={selectedPosition.y * 100}
                x2={challenge.target.x * 100}
                y2={challenge.target.y * 100}
              />
            </svg>
          )}

          {phase === "reveal" && <span className={styles.mapTargetRadius} style={targetRingStyle} />}

          {challenge.reference && (
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

          {aimPosition && canChoose && (
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

          {phase === "reveal" && (
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

          <span className={styles.mapRadiantLabel}>Radiant</span>
          <span className={styles.mapDireLabel}>Dire</span>
        </button>

        <div className={styles.mapBoardStatus}>
          <span>
            <Crosshair />
            {phase === "reveal"
              ? `${crowd.positions.length.toLocaleString("en-US")} room ${
                  crowd.positions.length === 1 ? "pin" : "pins"
                } revealed`
              : selectedPosition
                ? "Pin locked"
                : "Click or tap once to lock"}
          </span>
          <strong>
            {selectedDistance === null
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
        <h2>{question.prompt}</h2>
        <p>{MAP_READ_GRACE_MS / 1000}s read grace. Then speed and precision score.</p>

        <div className={styles.mapAccuracyScale} aria-label="Map accuracy bands">
          {MAP_SENSE_BAND_LABELS.map((label, index) => (
            <span key={label} className={selectedBand === index ? styles.mapAccuracyActive : undefined}>
              <i />
              <small>{String(index + 1).padStart(2, "0")}</small>
              <strong>{label}</strong>
            </span>
          ))}
        </div>

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
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <span className={styles.brandMark} aria-hidden="true">
      <Image src={ACTIVE_GAME.logoUrl} alt="" width={30} height={30} unoptimized />
    </span>
  );
}

export function QueueArcade() {
  const [phase, setPhaseState] = useState<GamePhase>("lobby");
  const [mode, setMode] = useState<ArcadeMode>("mixed");
  const [filter, setFilter] = useState<KnowledgeFilter>("Mixed");
  const [skillLevel, setSkillLevel] = useState<SkillLevel>("Open");
  const [currentQuestion, setCurrentQuestion] = useState<ArcadeRound | null>(null);
  const [roundIndex, setRoundIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
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
  const [queueStartedAt, setQueueStartedAt] = useState<number | null>(null);
  const [runDuration, setRunDuration] = useState(0);
  const [now, setNow] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lifetimeStats, setLifetimeStats] = useState<LifetimeStats>(EMPTY_STATS);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState("");
  const [activeRoundId, setActiveRoundId] = useState("");
  const [voiceState, setVoiceState] = useState<"loading" | "ready" | "playing" | "error">("loading");
  const [voicePlayCount, setVoicePlayCount] = useState(0);

  const phaseRef = useRef<GamePhase>("lobby");
  const currentQuestionRef = useRef<ArcadeRound | null>(null);
  const roundIndexRef = useRef(0);
  const selectedIndexRef = useRef<number | null>(null);
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
  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);

  const answerDuration = SKILL_INFO[skillLevel].duration;
  const previewQuestion = useMemo(() => {
    if (mode === "shopkeeper") {
      return ACTIVE_QUESTIONS.find((question) => question.category === "Recipes") ?? ACTIVE_QUESTIONS[0];
    }
    if (mode === "spell-link") {
      return ACTIVE_QUESTIONS.find((question) => question.kind === "spell-owner") ?? ACTIVE_QUESTIONS[0];
    }
    if (mode === "fogged-vision") {
      return ACTIVE_QUESTIONS.find((question) => question.kind === "fogged-hero") ?? ACTIVE_QUESTIONS[0];
    }
    if (mode === "echo-hunt") {
      return ACTIVE_QUESTIONS.find((question) => question.kind === "hero-voice") ?? ACTIVE_QUESTIONS[0];
    }
    if (mode === "quote-hunt") {
      return ACTIVE_QUESTIONS.find((question) => question.kind === "hero-quote") ?? ACTIVE_QUESTIONS[0];
    }
    if (mode === "map-sense") {
      return ACTIVE_QUESTIONS.find((question) => question.map?.reference) ?? ACTIVE_QUESTIONS[0];
    }
    return ACTIVE_QUESTIONS.find((question) => question.id === "cooldown:lina_dragon_slave:4") ?? ACTIVE_QUESTIONS[0];
  }, [mode]);

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

  const playSound = useCallback(
    (kind: "lock" | "correct" | "wrong" | "start") => {
      if (!soundEnabled || typeof window === "undefined") return;

      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) return;

      const context = audioContextRef.current ?? new AudioContextConstructor();
      audioContextRef.current = context;

      if (context.state === "suspended") void context.resume();

      const sequences = {
        lock: [
          [320, 0, 0.06],
          [470, 0.05, 0.07],
        ],
        correct: [
          [440, 0, 0.08],
          [660, 0.09, 0.1],
          [880, 0.19, 0.12],
        ],
        wrong: [
          [220, 0, 0.12],
          [150, 0.11, 0.18],
        ],
        start: [
          [260, 0, 0.06],
          [390, 0.07, 0.08],
          [520, 0.14, 0.1],
        ],
      } satisfies Record<typeof kind, number[][]>;

      for (const [frequency, delay, duration] of sequences[kind]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = kind === "wrong" ? "sawtooth" : "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.065, context.currentTime + delay + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(context.currentTime + delay);
        oscillator.stop(context.currentTime + delay + duration + 0.02);
      }
    },
    [soundEnabled],
  );

  const playVoiceLine = useCallback(() => {
    const audio = voiceAudioRef.current;
    if (!audio) return;

    setSoundEnabled(true);
    audio.currentTime = 0;
    setVoiceState("loading");
    void audio.play().catch(() => setVoiceState("error"));
  }, []);

  const requestRoomSnapshot = useCallback(async (settings: PublicRoomSettings, playerId: string) => {
    const requestedAt = Date.now();
    const response = await fetch(`/api/rounds?${publicRoomQuery(settings, playerId)}`, {
      cache: "no-store",
    });
    const payload: unknown = await response.json();
    const receivedAt = Date.now();

    if (!response.ok) throw new Error("Public room unavailable.");
    const snapshot = normalizeRoomSnapshot(payload);
    if (!snapshot || !QUESTIONS_BY_ID.has(snapshot.round.questionId)) {
      throw new Error("Public room returned an unknown round.");
    }

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

      const isCorrect = selectedIndexRef.current === question.correctIndex;
      const correctVotes = snapshot.crowd.counts[question.correctIndex];
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
        playSound("correct");
      } else {
        setStreak(0);
        playSound("wrong");
      }
    },
    [playSound, setCrowd, setDeadline, setPhase],
  );

  const applyRoomSnapshot = useCallback(
    (snapshot: RoomSnapshot, clockOffset: number, receivedAt: number) => {
      const baseQuestion = QUESTIONS_BY_ID.get(snapshot.round.questionId);
      if (!baseQuestion) throw new Error("The synchronized round references an unknown question.");
      const question: ArcadeRound = { ...baseQuestion, game: snapshot.round.game };
      const localAnswerDeadline = snapshot.round.answerDeadline + clockOffset;
      const localRevealDeadline = snapshot.round.revealDeadline + clockOffset;
      const isNewRound = roundIdRef.current !== snapshot.round.id;
      const hadRound = Boolean(roundIdRef.current);

      roomSnapshotRef.current = snapshot;
      setActiveRoomId(snapshot.room.id);
      setActiveRoundId(snapshot.round.id);
      setCrowd(snapshot.crowd);
      setRoomError(null);
      setNow(receivedAt);

      if (isNewRound) {
        roundIdRef.current = snapshot.round.id;
        currentQuestionRef.current = question;
        setCurrentQuestion(question);
        setRoundAward(null);
        setVoiceState("loading");
        setVoicePlayCount(0);

        const nextRoundIndex = hadRound ? roundIndexRef.current + 1 : 0;
        roundIndexRef.current = nextRoundIndex;
        setRoundIndex(nextRoundIndex);

        const playerVote = snapshot.playerVote;
        const nextSelectedIndex = playerVote?.answerIndex ?? null;
        const nextMapPosition = playerVote?.mapPosition ?? null;
        const nextAnswerTimeLeft = playerVote ? Math.max(0, snapshot.round.answerDeadline - playerVote.submittedAt) : 0;
        selectedIndexRef.current = nextSelectedIndex;
        selectedMapPositionRef.current = nextMapPosition;
        answerTimeLeftRef.current = nextAnswerTimeLeft;
        setSelectedIndex(nextSelectedIndex);
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

      if (snapshot.playerVote && selectedIndexRef.current === null) {
        const nextAnswerTimeLeft = Math.max(0, snapshot.round.answerDeadline - snapshot.playerVote.submittedAt);
        selectedIndexRef.current = snapshot.playerVote.answerIndex;
        selectedMapPositionRef.current = snapshot.playerVote.mapPosition ?? null;
        answerTimeLeftRef.current = nextAnswerTimeLeft;
        setSelectedIndex(snapshot.playerVote.answerIndex);
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
    [finalizeRound, setCrowd, setDeadline, setPhase],
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

  const startRun = useCallback(async () => {
    if (joiningRoom) return;

    const settings: PublicRoomSettings = {
      gameId: DEFAULT_GAME_ID,
      mode,
      filter: mode === "trivia" ? filter : "Mixed",
      skillLevel,
    };
    setJoiningRoom(true);
    setRoomError(null);
    roomSettingsRef.current = settings;

    try {
      const result = await requestRoomSnapshot(settings, ensurePlayerId());
      if (roomSettingsRef.current !== settings) return;

      const startedAt = Date.now();
      roundIdRef.current = "";
      currentQuestionRef.current = null;
      roundIndexRef.current = 0;
      queueStartedAtRef.current = startedAt;
      runSavedRef.current = false;
      finalizedRef.current = false;
      participatedRef.current = false;
      setCurrentQuestion(null);
      selectedIndexRef.current = null;
      selectedMapPositionRef.current = null;
      setSelectedIndex(null);
      setSelectedMapPosition(null);
      setRoundIndex(0);
      setScore(0);
      setStreak(0);
      setBestStreak(0);
      setCorrectCount(0);
      setHistory([]);
      setRunDuration(0);
      setQueueStartedAt(startedAt);
      playSound("start");
      applyRoomSnapshot(result.snapshot, result.clockOffset, result.receivedAt);
    } catch {
      if (roomSettingsRef.current === settings) {
        roomSettingsRef.current = null;
        setRoomError("Could not join the public room. The arcade will keep your settings.");
      }
    } finally {
      setJoiningRoom(false);
    }
  }, [applyRoomSnapshot, ensurePlayerId, filter, joiningRoom, mode, playSound, requestRoomSnapshot, skillLevel]);

  const submitVote = useCallback(
    async (question: TriviaQuestion, answerIndex: number, mapPosition?: MapPosition) => {
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
            questionId: question.id,
            answerIndex,
            ...(mapPosition ? { mapPosition } : {}),
            voterId: ensurePlayerId(),
          }),
        });
        const payload: unknown = await response.json();

        if (!response.ok) {
          throw new Error(response.status === 409 ? "ROUND_CLOSED" : "VOTE_FAILED");
        }

        const result = normalizeVoteResult(payload);
        if (!result) throw new Error("VOTE_FAILED");

        if (roundIdRef.current === snapshot.round.id) {
          setCrowd({ counts: result.counts, total: result.total, positions: result.positions });
          if (result.playerVote) {
            const serverTimeLeft = Math.max(0, snapshot.round.answerDeadline - result.playerVote.submittedAt);
            selectedIndexRef.current = result.playerVote.answerIndex;
            selectedMapPositionRef.current = result.playerVote.mapPosition ?? null;
            answerTimeLeftRef.current = serverTimeLeft;
            setSelectedIndex(result.playerVote.answerIndex);
            setSelectedMapPosition(result.playerVote.mapPosition ?? null);
            setAnswerTimeLeft(serverTimeLeft);
          }
          setRoomError(null);
        }
      } catch {
        if (roundIdRef.current === snapshot.round.id) {
          selectedIndexRef.current = null;
          selectedMapPositionRef.current = null;
          answerTimeLeftRef.current = 0;
          setSelectedIndex(null);
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
        question.game === "map-sense" ||
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
      void submitVote(question, answerIndex);
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
      void submitVote(question, answerIndex, position);
    },
    [playSound, submitVote],
  );

  const finishSession = useCallback(() => {
    if (phaseRef.current === "lobby" || phaseRef.current === "summary") return;
    const finishedAt = Date.now();
    const startedAt = queueStartedAtRef.current ?? finishedAt;
    roomSettingsRef.current = null;
    roomSnapshotRef.current = null;
    setRunDuration(finishedAt - startedAt);
    setDeadline(null);
    setRevealDeadlineState(null);
    setPhase("summary");
  }, [setDeadline, setPhase]);

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
    if (phase === "answering" && deadline && now >= deadline) void syncRoom();
  }, [deadline, now, phase, syncRoom]);

  useEffect(() => {
    if (phase === "reveal" && revealDeadline && now >= revealDeadline) void syncRoom();
  }, [now, phase, revealDeadline, syncRoom]);

  useEffect(() => {
    const hydration = window.setTimeout(() => {
      try {
        const storedStats = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
        const storedSettings =
          window.localStorage.getItem(SETTINGS_KEY) ?? window.localStorage.getItem(LEGACY_SETTINGS_KEY);
        if (storedStats) setLifetimeStats({ ...EMPTY_STATS, ...JSON.parse(storedStats) });
        if (storedSettings) {
          const settings = JSON.parse(storedSettings) as {
            soundEnabled?: boolean;
            filter?: KnowledgeFilter;
            mode?: ArcadeMode;
            skillLevel?: SkillLevel;
          };
          if (typeof settings.soundEnabled === "boolean") setSoundEnabled(settings.soundEnabled);
          if (settings.filter && KNOWLEDGE_FILTERS.includes(settings.filter)) setFilter(settings.filter);
          if (settings.mode && ARCADE_MODES.includes(settings.mode)) setMode(settings.mode);
          if (settings.skillLevel && SKILL_LEVELS.includes(settings.skillLevel)) setSkillLevel(settings.skillLevel);
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
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ soundEnabled, filter, mode, skillLevel }));
  }, [filter, mode, skillLevel, soundEnabled, statsLoaded]);

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
    if (phase !== "answering") voiceAudioRef.current?.pause();
  }, [phase]);

  useEffect(() => {
    const audio = voiceAudioRef.current;
    if (
      phase !== "answering" ||
      currentQuestion?.game !== "echo-hunt" ||
      !currentQuestion.audio ||
      !soundEnabled ||
      !audio
    ) {
      return;
    }

    audio.currentTime = 0;
    void audio.play().catch(() => {
      setVoiceState(audio.readyState >= 2 ? "ready" : "loading");
    });
  }, [currentQuestion?.audio, currentQuestion?.game, currentQuestion?.id, phase, soundEnabled]);

  useEffect(
    () => () => {
      if (audioContextRef.current) void audioContextRef.current.close();
      voiceAudioRef.current?.pause();
    },
    [],
  );

  const answerRemaining = deadline ? Math.max(0, deadline - now) : 0;
  const revealRemaining = revealDeadline ? Math.max(0, revealDeadline - now) : 0;
  const timerRatio = phase === "answering" ? answerRemaining / answerDuration : revealRemaining / REVEAL_DURATION_MS;
  const sessionElapsed = queueStartedAt ? Math.max(0, now - queueStartedAt) : 0;
  const selectedWasCorrect =
    selectedIndex !== null && currentQuestion ? selectedIndex === currentQuestion.correctIndex : false;
  const currentGame = currentQuestion?.game ?? "trivia";
  const displayedDifficulty =
    currentGame !== "trivia" && skillLevel !== "Open"
      ? {
          className: skillLevel === "Veteran" ? styles.difficulty3 : styles.difficulty1,
          label: skillLevel,
        }
      : {
          className: styles[`difficulty${currentQuestion?.difficulty ?? 1}`],
          label: currentQuestion ? difficultyLabel(currentQuestion.difficulty) : "Warm-up",
        };
  const clueStage = phase === "reveal" ? 3 : clueStageAt(answerRemaining, answerDuration);
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
  const spellClueTwo =
    skillLevel === "Veteran" ? spellMechanicHint(spellHint) : (currentQuestion?.eyebrow ?? "Ability name");
  const activeModeInfo = MODE_INFO[mode];

  return (
    <main
      className={styles.shell}
      data-phase={phase}
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
          href="#arcade"
          className={styles.brand}
          aria-label="Queue Arcade home"
          onClick={(event) => {
            event.preventDefault();
            roomSettingsRef.current = null;
            roomSnapshotRef.current = null;
            setPhase("lobby");
          }}
        >
          <BrandMark />
          <span>
            <strong>Queue Arcade</strong>
            <small>Side quests, between matches</small>
          </span>
        </a>

        <div className={styles.headerMeta}>
          <span className={styles.patchBadge}>
            {ACTIVE_GAME.label} · {ACTIVE_GAME.contentLabel}
          </span>
          <span className={styles.fanBadge}>Unofficial fan project</span>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() =>
              setSoundEnabled((enabled) => {
                if (enabled) voiceAudioRef.current?.pause();
                return !enabled;
              })
            }
            aria-label={soundEnabled ? "Mute game sounds" : "Enable game sounds"}
            aria-pressed={soundEnabled}
          >
            {soundEnabled ? <Volume2 /> : <VolumeX />}
          </button>
        </div>
      </header>

      {phase === "lobby" && (
        <section className={styles.lobby} id="arcade">
          <div className={styles.lobbyCopy}>
            <div className={styles.liveLabel}>
              <span />
              Seven games live · More in the lab
            </div>
            <h1>
              Your queue has
              <br />
              <em>side quests.</em>
            </h1>
            <p className={styles.lead}>
              A tiny Dota arcade built for the gap between Find Match and Accept. Pick a game—or let Mixed Arcade keep
              changing the rules.
            </p>

            <div className={styles.modeBlock}>
              <span className={styles.fieldLabel}>Choose your side quest</span>
              <div className={styles.modePicker} role="group" aria-label="Arcade game">
                {ARCADE_MODES.map((option) => {
                  const info = MODE_INFO[option];
                  return (
                    <button
                      key={option}
                      type="button"
                      data-arcade-mode={option}
                      className={clsx(styles.modeCard, mode === option && styles.modeCardActive)}
                      onClick={() => setMode(option)}
                      disabled={joiningRoom}
                      aria-pressed={mode === option}
                    >
                      <span className={styles.modeIcon}>
                        <ModeIcon mode={option} />
                      </span>
                      <span>
                        <small>{info.eyebrow}</small>
                        <strong>{info.label}</strong>
                      </span>
                      {option === "mixed" && <i>Hot</i>}
                      <ChevronRight />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.modeSettingsSlot} data-testid="mode-settings">
              {mode === "trivia" ? (
                <div className={styles.filterBlock}>
                  <span className={styles.fieldLabel}>Tune the trivia pool</span>
                  <div className={styles.filterRow} role="group" aria-label="Question pool">
                    {KNOWLEDGE_FILTERS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={clsx(styles.filterButton, filter === option && styles.filterButtonActive)}
                        onClick={() => setFilter(option)}
                        disabled={joiningRoom}
                        aria-pressed={filter === option}
                      >
                        {option === "Mixed" && <Sparkles />}
                        {option === "Abilities" && <Zap />}
                        {option === "Items" && <Trophy />}
                        {option === "Heroes" && <Swords />}
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className={styles.modeRule}>
                  <span>
                    <ModeIcon mode={mode} />
                  </span>
                  <div>
                    <small>{activeModeInfo.label} rules</small>
                    <p>{activeModeInfo.rule}</p>
                  </div>
                </div>
              )}
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
              <div className={styles.skillBlock}>
                <span className={styles.fieldLabel}>Challenge level · endless</span>
                <div className={styles.skillRow} role="group" aria-label="Challenge level">
                  {SKILL_LEVELS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      data-skill-level={option.toLowerCase()}
                      className={clsx(styles.skillButton, skillLevel === option && styles.skillButtonActive)}
                      onClick={() => setSkillLevel(option)}
                      disabled={joiningRoom}
                      aria-pressed={skillLevel === option}
                    >
                      <strong>{SKILL_INFO[option].label}</strong>
                      <small>{SKILL_INFO[option].description}</small>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className={clsx(styles.roomNotice, roomError && styles.roomNoticeError)} aria-live="polite">
              <Signal />
              {roomError ?? "Public rooms are synchronized to one server-owned round and reveal."}
            </div>

            <div className={styles.featureStrip}>
              <div>
                <strong>{ARCADE_MODES.length - 1}</strong>
                <span>games live</span>
              </div>
              <div>
                <strong>{ACTIVE_QUESTIONS.length}</strong>
                <span>patch-current prompts</span>
              </div>
              <div>
                <strong>2×</strong>
                <span>crowd-breaker bonus</span>
              </div>
              <div>
                <strong>{statsLoaded ? `${accuracy(lifetimeStats.correct, lifetimeStats.answered)}%` : "—"}</strong>
                <span>your lifetime accuracy</span>
              </div>
            </div>
          </div>

          <div className={styles.previewColumn}>
            <div className={styles.previewHalo} />
            <div className={styles.previewCard} data-testid="mode-preview">
              <div className={styles.previewHeader}>
                <span>
                  <ModeIcon mode={mode} />
                  {activeModeInfo.label}
                </span>
                <strong>00:{String(answerDuration / 1000).padStart(2, "0")}</strong>
              </div>
              <div className={styles.previewQuestion}>
                {mode === "map-sense" ? (
                  <div className={styles.previewMap} aria-hidden="true">
                    <Image src={MAP_SENSE_IMAGE} alt="" fill sizes="190px" />
                    <span />
                    <Crosshair />
                  </div>
                ) : mode === "echo-hunt" ? (
                  <div className={styles.previewEcho} aria-hidden="true">
                    <Headphones />
                    <span>
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                ) : mode === "quote-hunt" ? (
                  <div className={styles.previewQuote} aria-hidden="true">
                    <MessageSquareQuote />
                    <p>“{previewQuestion.detail}”</p>
                  </div>
                ) : (
                  <div className={clsx(mode === "fogged-vision" && styles.previewFog)} data-fog-stage="1">
                    <QuestionArtwork question={previewQuestion} concealIdentity={mode === "fogged-vision"} />
                  </div>
                )}
                <span>{activeModeInfo.eyebrow}</span>
                <h2>
                  {mode === "mixed"
                    ? "The next round could be anything."
                    : mode === "shopkeeper"
                      ? `Finish ${previewQuestion.eyebrow}'s recipe.`
                      : mode === "spell-link"
                        ? "Who cast this? Link the spell to its hero."
                        : mode === "fogged-vision"
                          ? "Name the hero before the fog clears."
                          : mode === "echo-hunt"
                            ? "Whose voice just crossed the river?"
                            : mode === "quote-hunt"
                              ? "Who said it?"
                              : mode === "map-sense"
                                ? "Where on the map is the call?"
                                : previewQuestion.prompt}
                </h2>
                <p>{activeModeInfo.description}</p>
              </div>
              <div className={clsx(styles.previewAnswers, mode === "map-sense" && styles.previewMapBands)}>
                {previewQuestion.answers.map((answer, index) => (
                  <div key={answer}>
                    <span>{LETTERS[index]}</span>
                    {answer}
                  </div>
                ))}
              </div>
              <div className={styles.previewFooter}>
                <Users />
                {mode === "map-sense"
                  ? "One synchronized deadline, then the room heatmap"
                  : "One synchronized round, deadline, and answer split for everyone"}
              </div>
            </div>

            <div className={styles.queueToast}>
              <span className={styles.readyIcon}>
                <Gamepad2 />
              </span>
              <span>
                <small>Public room ready</small>
                {SKILL_INFO[skillLevel].label} · {activeModeInfo.shortLabel}
              </span>
              <strong>{answerDuration / 1000}s</strong>
            </div>
          </div>
        </section>
      )}

      {(phase === "answering" || phase === "reveal") && currentQuestion && (
        <section className={styles.gameLayout} data-testid="public-room" data-round-game={currentGame}>
          <div
            className={clsx(
              styles.gameStage,
              currentGame === "shopkeeper" && styles.shopkeeperStage,
              currentGame === "spell-link" && styles.spellLinkStage,
              currentGame === "fogged-vision" && styles.foggedStage,
              currentGame === "echo-hunt" && styles.echoStage,
              currentGame === "quote-hunt" && styles.quoteStage,
              currentGame === "map-sense" && styles.mapSenseStage,
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
                <i />
                <span
                  className={displayedDifficulty.className}
                  data-testid="round-difficulty"
                  data-content-difficulty={currentQuestion.difficulty}
                >
                  {displayedDifficulty.label}
                </span>
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
                selectedPosition={selectedMapPosition}
                crowd={crowd}
                onChoose={chooseMapPosition}
              />
            ) : currentGame === "shopkeeper" ? (
              <div className={clsx(styles.questionBlock, styles.shopkeeperQuestion)} data-testid="round-prompt">
                <div className={styles.recipeTarget}>
                  <QuestionArtwork question={currentQuestion} />
                  <span>Target item</span>
                </div>
                <div className={styles.questionCopy}>
                  <span>Shopkeeper Rush · Missing component</span>
                  <h2>
                    Finish the recipe for <strong>{currentQuestion.eyebrow}</strong>
                  </h2>
                  <div className={styles.recipeEquation} aria-hidden="true">
                    <span>
                      <ShoppingBag />
                      Recipe
                    </span>
                    <ChevronRight />
                    <span className={styles.missingSlot}>
                      <strong>?</strong>
                      Pick from the shelf
                    </span>
                  </div>
                  <small>Patch {currentQuestion.patch} · Choose the component that actually belongs</small>
                </div>
              </div>
            ) : currentGame === "spell-link" ? (
              <div className={clsx(styles.questionBlock, styles.spellQuestion)} data-testid="round-prompt">
                <div className={styles.spellArtwork}>
                  <QuestionArtwork question={currentQuestion} />
                  <span>
                    Clue {clueStage}
                    <small>/ 3</small>
                  </span>
                </div>
                <div className={styles.questionCopy}>
                  <span>Spell Link · Clues unlock with time</span>
                  <h2>Which hero owns this ability?</h2>
                  <div className={styles.clueList}>
                    <div className={styles.clueUnlocked}>
                      <strong>01</strong>
                      <span>Ability icon revealed</span>
                    </div>
                    <div
                      className={clueStage >= 2 ? styles.clueUnlocked : styles.clueLocked}
                      data-testid="spell-clue-2"
                    >
                      <strong>02</strong>
                      <span>
                        {clueStage >= 2
                          ? spellClueTwo
                          : skillLevel === "Veteran"
                            ? `Mechanic tags unlock at ${firstClueAt}s`
                            : `Ability name unlocks at ${firstClueAt}s`}
                      </span>
                    </div>
                    <div
                      className={clueStage >= 3 ? styles.clueUnlocked : styles.clueLocked}
                      data-testid="spell-clue-3"
                    >
                      <strong>03</strong>
                      <span>{clueStage >= 3 ? spellHint : `Description unlocks at ${finalClueAt}s`}</span>
                    </div>
                  </div>
                  <small>Every extra clue costs {SPELL_CLUE_PENALTY} points, on top of the fading speed bonus</small>
                </div>
              </div>
            ) : currentGame === "fogged-vision" ? (
              <div
                key={`${activeRoundId}:fog`}
                className={clsx(styles.questionBlock, styles.fogQuestion)}
                data-testid="round-prompt"
                data-fog-stage={clueStage}
                data-skill-level={skillLevel.toLowerCase()}
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
            ) : currentGame === "echo-hunt" ? (
              <div className={clsx(styles.questionBlock, styles.echoQuestion)} data-testid="round-prompt">
                <audio
                  key={currentQuestion.id}
                  ref={voiceAudioRef}
                  src={currentQuestion.audio?.src}
                  preload="auto"
                  onLoadStart={() => setVoiceState("loading")}
                  onCanPlay={() => setVoiceState((state) => (state === "playing" ? state : "ready"))}
                  onPlay={() => {
                    setVoiceState("playing");
                    setVoicePlayCount((count) => count + 1);
                  }}
                  onPause={() => {
                    if (phaseRef.current === "answering") setVoiceState("ready");
                  }}
                  onEnded={() => setVoiceState("ready")}
                  onError={() => setVoiceState("error")}
                />
                <div
                  className={styles.echoPlayer}
                  data-testid="echo-player"
                  data-voice-state={voiceState}
                  data-play-count={voicePlayCount}
                >
                  <button
                    type="button"
                    data-testid="voice-line-play"
                    onClick={playVoiceLine}
                    aria-label={voicePlayCount ? "Replay hero voice line" : "Play hero voice line"}
                  >
                    {voiceState === "playing" ? <AudioLines /> : <Headphones />}
                  </button>
                  <div className={styles.echoWave} aria-hidden="true">
                    {Array.from({ length: 15 }, (_, index) => (
                      <i key={index} />
                    ))}
                  </div>
                  <span>
                    {voiceState === "error"
                      ? "Audio unavailable"
                      : voiceState === "loading"
                        ? "Loading echo"
                        : voiceState === "playing"
                          ? "Now playing"
                          : voicePlayCount
                            ? "Replay echo"
                            : "Play echo"}
                  </span>
                </div>
                <div className={styles.questionCopy}>
                  <span>Echo Hunt · Hero response</span>
                  <h2>Whose voice crossed the river?</h2>
                  <small>The line stays hidden until the reveal.</small>
                </div>
              </div>
            ) : currentGame === "quote-hunt" ? (
              <div className={clsx(styles.questionBlock, styles.quoteQuestion)} data-testid="round-prompt">
                <div className={styles.quoteCard} data-testid="hero-quote">
                  <MessageSquareQuote />
                  <blockquote>“{currentQuestion.detail}”</blockquote>
                  <span>Hero response</span>
                </div>
                <div className={styles.questionCopy}>
                  <span>Quote Hunt · Who said it?</span>
                  <h2>Which hero speaks like this?</h2>
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

            {currentGame !== "map-sense" && (
              <div
                className={clsx(
                  styles.answers,
                  currentGame === "shopkeeper" && styles.itemAnswers,
                  (currentQuestion.answerImageKind === "hero" || currentGame === "spell-link") && styles.heroAnswers,
                  currentGame === "fogged-vision" && styles.fogAnswers,
                  currentGame === "echo-hunt" && styles.echoAnswers,
                  currentGame === "quote-hunt" && styles.quoteAnswers,
                )}
                role="group"
                aria-label="Answer choices"
                data-testid="answer-grid"
              >
                {currentQuestion.answers.map((answer, index) => {
                  const isSelected = selectedIndex === index;
                  const isCorrect = currentQuestion.correctIndex === index;
                  const percentage = crowd.total ? Math.round((crowd.counts[index] / crowd.total) * 100) : 0;
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
                        currentQuestion.answerImages && styles.visualAnswer,
                        phase === "answering" && isSelected && styles.answerLocked,
                        phase === "answering" && selectedIndex !== null && !isSelected && styles.answerMuted,
                        phase === "reveal" && isCorrect && styles.answerCorrect,
                        phase === "reveal" && isSelected && !isCorrect && styles.answerWrong,
                      )}
                      onClick={() => chooseAnswer(index)}
                      disabled={phase !== "answering" || selectedIndex !== null}
                      aria-pressed={isSelected}
                      style={resultStyle}
                    >
                      {phase === "reveal" && <span className={styles.resultFill} />}
                      <span className={styles.answerKey}>{LETTERS[index]}</span>
                      {currentQuestion.answerImages?.[index] && (
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
                      )}
                      <span className={styles.answerText}>
                        {answer}
                        {isSelected && phase === "answering" && <small>Your answer · locked</small>}
                        {isSelected && phase === "reveal" && <small>Your answer</small>}
                      </span>
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
                      <Keyboard />
                      {currentGame === "shopkeeper"
                        ? "Pick the missing component · A–D or 1–4"
                        : currentGame === "spell-link"
                          ? "Link the spell to a hero · A–D or 1–4"
                          : currentGame === "fogged-vision"
                            ? "Name the silhouette · A–D or 1–4"
                            : currentGame === "echo-hunt"
                              ? "Play the echo, then choose · A–D or 1–4"
                              : currentGame === "quote-hunt"
                                ? "Match the line to its hero · A–D or 1–4"
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
                  <p>{currentQuestion.explanation}</p>
                </div>
                <div className={styles.pointsAward}>
                  <small>
                    {roundAward?.majorityBonus
                      ? "2× crowd breaker"
                      : roundAward?.correct
                        ? currentGame === "map-sense"
                          ? `+${roundAward.precisionBonus} precision · +${roundAward.speedBonus} speed`
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
                  <small>{MODE_INFO[mode].shortLabel} public room</small>
                  Endless synchronized rounds
                </span>
                <strong>{formatDuration(sessionElapsed)}</strong>
              </div>
              <div className={styles.queueDetails}>
                <span>{skillLevel}</span>
                <i />
                <span>Server timed</span>
                <i />
                <span title={roomError ?? activeRoomId}>{roomError ? "Reconnecting" : "Live room"}</span>
              </div>
              <button type="button" data-testid="end-session" onClick={finishSession}>
                <CircleStop />
                End session
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
                  {currentGame === "map-sense" ? "Room pings" : "Global answers"}
                </span>
                <span className={styles.livePill}>Live room</span>
              </div>
              <strong>
                {crowd.total.toLocaleString("en-US")}{" "}
                {currentGame === "map-sense"
                  ? crowd.total === 1
                    ? "pin"
                    : "pins"
                  : crowd.total === 1
                    ? "answer"
                    : "answers"}
              </strong>
              <p>
                {currentGame === "map-sense"
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
              <div className={styles.crowdPulse} aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>

            <div className={styles.tipCard}>
              <ModeIcon mode={currentGame} />
              <div>
                <span>
                  {currentGame === "shopkeeper"
                    ? "Shopkeeper tip"
                    : currentGame === "spell-link"
                      ? "Spell Link tip"
                      : currentGame === "fogged-vision"
                        ? "Fogged Vision tip"
                        : currentGame === "echo-hunt"
                          ? "Echo Hunt tip"
                          : currentGame === "quote-hunt"
                            ? "Quote Hunt tip"
                            : currentGame === "map-sense"
                              ? "Map Sense tip"
                              : "Crowd rules"}
                </span>
                <p>
                  {currentGame === "shopkeeper"
                    ? "Look for the real component, not an item that merely has a similar cost or stat."
                    : currentGame === "spell-link"
                      ? `Each extra clue costs ${SPELL_CLUE_PENALTY} points. Answering sooner also preserves up to ${MAX_SPEED_BONUS} speed points.`
                      : currentGame === "fogged-vision"
                        ? "Silhouette and color are often enough. Every clarity stage is safer, but costs time."
                        : currentGame === "echo-hunt"
                          ? "Accent, cadence, and vocal effects are useful tells. Replay as often as the timer allows."
                          : currentGame === "quote-hunt"
                            ? "Look for vocabulary, ego, and worldview—the best hero lines reveal all three."
                            : currentGame === "map-sense"
                              ? "Your first three seconds keep full speed points. Read the arrow call, then pin it."
                              : `Correct answers start at 100 points. Speed adds up to ${MAX_SPEED_BONUS}; harder questions add more.`}
                </p>
              </div>
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
            <span className={styles.summaryPatch}>{ACTIVE_GAME.contentLabel}</span>
          </div>

          <div className={styles.summaryHero}>
            <div className={styles.rankMedallion}>
              <BrandMark />
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
              <strong>{mode === "trivia" ? `${filter} · ${MODE_INFO[mode].label}` : MODE_INFO[mode].label}</strong>
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
            <button type="button" className={styles.secondaryButton} onClick={() => setPhase("lobby")}>
              Choose another game
            </button>
          </div>
        </section>
      )}

      <footer className={styles.footer}>
        <span>
          <BrandMark />
          Queue Arcade · Built for the seconds between “Find Match” and “Accept”
        </span>
        <span>
          Dota 2 and its assets are trademarks of Valve Corporation. This project is not affiliated with Valve.
        </span>
      </footer>
    </main>
  );
}
