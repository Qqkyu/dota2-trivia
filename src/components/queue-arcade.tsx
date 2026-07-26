"use client";

import Image from "next/image";
import {
  Brain,
  Check,
  ChevronRight,
  CircleStop,
  Clock3,
  Flame,
  Gauge,
  Gamepad2,
  Info,
  Keyboard,
  Radio,
  RotateCcw,
  ShoppingBag,
  Shuffle,
  Signal,
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
  createArcadeDeck,
  difficultyLabel,
  KNOWLEDGE_FILTERS,
  SKILL_LEVELS,
  triviaMeta,
  triviaQuestions,
  type ArcadeMode,
  type ArcadeRound,
  type KnowledgeFilter,
  type RoundGame,
  type SkillLevel,
  type TriviaQuestion,
} from "@/lib/trivia";
import type { CrowdResult } from "@/lib/vote-store";
import styles from "./queue-arcade.module.css";

const REVEAL_DURATION_MS = 7_000;
const DECK_BATCH_LENGTH = 24;
const MAX_SPEED_BONUS = 100;
const SPELL_CLUE_PENALTY = 40;
const LETTERS = ["A", "B", "C", "D"] as const;
const EMPTY_CROWD: CrowdResult = { counts: [0, 0, 0, 0], total: 0 };
const STORAGE_KEY = "queue-arcade:stats:v2";
const PLAYER_KEY = "queue-arcade:player:v2";
const SETTINGS_KEY = "queue-arcade:settings:v2";
const LEGACY_STORAGE_KEY = "queue-trivia:stats:v1";
const LEGACY_PLAYER_KEY = "queue-trivia:player:v1";
const LEGACY_SETTINGS_KEY = "queue-trivia:settings:v1";
const ARCADE_MODES: ArcadeMode[] = ["mixed", "trivia", "shopkeeper", "spell-link"];
const DOTA_LOGO_URL = "https://cdn.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png";

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
    description: "Trivia, recipes, and spell recognition rotate every round. Maximum chaos, zero downtime.",
    action: "Enter mixed arcade",
    rule: "All three games rotate automatically—no back-to-back repeats.",
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
};

function ModeIcon({ mode }: { mode: ArcadeMode | RoundGame }) {
  if (mode === "mixed") return <Shuffle />;
  if (mode === "shopkeeper") return <ShoppingBag />;
  if (mode === "spell-link") return <WandSparkles />;
  return <Brain />;
}

function gameLabel(game: RoundGame) {
  return MODE_INFO[game].label;
}

function normalizeCrowd(value: unknown): CrowdResult | null {
  if (!value || typeof value !== "object" || !("counts" in value) || !("total" in value)) return null;
  const { counts, total } = value;

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
  };
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

function scoreBreakdown(question: ArcadeRound, timeRemaining: number, duration: number) {
  const speedRatio = Math.max(0, Math.min(1, timeRemaining / duration));
  const speedBonus = Math.round(speedRatio * MAX_SPEED_BONUS);
  const difficultyBonus = (question.difficulty - 1) * 25;
  const cluePenalty =
    question.game === "spell-link" ? (clueStageAt(timeRemaining, duration) - 1) * SPELL_CLUE_PENALTY : 0;

  return {
    speedBonus,
    difficultyBonus,
    cluePenalty,
    rawPoints: Math.max(25, 100 + speedBonus + difficultyBonus - cluePenalty),
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

function fallbackCrowd(selectedIndex: number | null) {
  if (selectedIndex === null) return EMPTY_CROWD;
  const counts: CrowdResult["counts"] = [0, 0, 0, 0];
  counts[selectedIndex] = 1;
  return { counts, total: 1 };
}

function QuestionArtwork({ question }: { question: TriviaQuestion }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const failed = failedSource === question.image.src;

  return (
    <div
      className={clsx(
        styles.artwork,
        question.image.kind === "hero" && styles.heroArtwork,
        question.image.kind === "item" && styles.itemArtwork,
      )}
    >
      <div className={styles.artGlow} />
      {failed ? (
        <span className={styles.artFallback}>{question.eyebrow.slice(0, 2).toUpperCase()}</span>
      ) : (
        <Image
          src={question.image.src}
          alt={question.image.alt}
          fill
          sizes="(max-width: 700px) 112px, 150px"
          className={styles.artImage}
          onError={() => setFailedSource(question.image.src)}
          unoptimized
          priority
        />
      )}
      <span className={styles.artCorner} />
    </div>
  );
}

function AnswerArtwork({ src, alt, kind }: { src: string; alt: string; kind: "item" | "hero" }) {
  const [failed, setFailed] = useState(false);

  return (
    <span className={clsx(styles.answerArtwork, kind === "hero" && styles.answerHeroArtwork)}>
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

function BrandMark() {
  return (
    <span className={styles.brandMark} aria-hidden="true">
      <Image src={DOTA_LOGO_URL} alt="" width={30} height={30} unoptimized />
    </span>
  );
}

export function QueueArcade() {
  const [phase, setPhaseState] = useState<GamePhase>("lobby");
  const [mode, setMode] = useState<ArcadeMode>("mixed");
  const [filter, setFilter] = useState<KnowledgeFilter>("Mixed");
  const [skillLevel, setSkillLevel] = useState<SkillLevel>("Open");
  const [deck, setDeck] = useState<ArcadeRound[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
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

  const phaseRef = useRef<GamePhase>("lobby");
  const deckRef = useRef<ArcadeRound[]>([]);
  const currentQuestionRef = useRef<ArcadeRound | null>(null);
  const roundIndexRef = useRef(0);
  const selectedIndexRef = useRef<number | null>(null);
  const answerTimeLeftRef = useRef(0);
  const crowdRef = useRef<CrowdResult>(EMPTY_CROWD);
  const deadlineRef = useRef<number | null>(null);
  const queueStartedAtRef = useRef<number | null>(null);
  const finalizedRef = useRef(false);
  const advancedRef = useRef(false);
  const runSavedRef = useRef(false);
  const playerIdRef = useRef("");
  const audioContextRef = useRef<AudioContext | null>(null);

  const currentQuestion = deck[roundIndex];
  const answerDuration = SKILL_INFO[skillLevel].duration;
  const previewQuestion = useMemo(() => {
    if (mode === "shopkeeper") {
      return triviaQuestions.find((question) => question.category === "Recipes") ?? triviaQuestions[0];
    }
    if (mode === "spell-link") {
      return triviaQuestions.find((question) => question.id.startsWith("ability-owner:")) ?? triviaQuestions[0];
    }
    return triviaQuestions.find((question) => question.id === "cooldown:lina_dragon_slave:4") ?? triviaQuestions[0];
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

  const readCrowd = useCallback(async (questionId: string) => {
    const response = await fetch(`/api/votes?questionId=${encodeURIComponent(questionId)}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Crowd room unavailable.");
    return normalizeCrowd(await response.json());
  }, []);

  const prepareRound = useCallback(
    (question: ArcadeRound) => {
      const startedAt = Date.now();
      currentQuestionRef.current = question;
      selectedIndexRef.current = null;
      answerTimeLeftRef.current = 0;
      finalizedRef.current = false;
      advancedRef.current = false;
      setSelectedIndex(null);
      setAnswerTimeLeft(0);
      setCrowd(EMPTY_CROWD);
      setRoundAward(null);
      setRevealDeadlineState(null);
      setDeadline(startedAt + answerDuration);
      setNow(startedAt);
      setPhase("answering");

      void readCrowd(question.id)
        .then((result) => {
          if (result && currentQuestionRef.current?.id === question.id) setCrowd(result);
        })
        .catch(() => undefined);
    },
    [answerDuration, readCrowd, setCrowd, setDeadline, setPhase],
  );

  const startRun = useCallback(() => {
    ensurePlayerId();
    const startedAt = Date.now();
    const nextDeck = createArcadeDeck(
      `${startedAt}:${window.crypto.randomUUID()}`,
      mode,
      mode === "trivia" ? filter : "Mixed",
      DECK_BATCH_LENGTH,
      skillLevel,
    );

    deckRef.current = nextDeck;
    roundIndexRef.current = 0;
    queueStartedAtRef.current = startedAt;
    runSavedRef.current = false;
    setDeck(nextDeck);
    setRoundIndex(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setCorrectCount(0);
    setHistory([]);
    setRunDuration(0);
    setQueueStartedAt(startedAt);
    playSound("start");
    prepareRound(nextDeck[0]);
  }, [ensurePlayerId, filter, mode, playSound, prepareRound, skillLevel]);

  const submitVote = useCallback(
    async (question: TriviaQuestion, answerIndex: number) => {
      try {
        const response = await fetch("/api/votes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            questionId: question.id,
            answerIndex,
            voterId: ensurePlayerId(),
          }),
        });
        if (!response.ok) throw new Error("Vote rejected.");
        const result = normalizeCrowd(await response.json());
        if (result && currentQuestionRef.current?.id === question.id) setCrowd(result);
      } catch {
        if (currentQuestionRef.current?.id === question.id && crowdRef.current.total === 0) {
          setCrowd(fallbackCrowd(answerIndex));
        }
      }
    },
    [ensurePlayerId, setCrowd],
  );

  const chooseAnswer = useCallback(
    (answerIndex: number) => {
      const question = currentQuestionRef.current;
      if (phaseRef.current !== "answering" || !question || selectedIndexRef.current !== null || !deadlineRef.current) {
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

  const finalizeRound = useCallback(async () => {
    const question = currentQuestionRef.current;
    if (!question || finalizedRef.current || phaseRef.current !== "answering") return;

    finalizedRef.current = true;
    setDeadline(null);
    setPhase("reveal");

    let finalCrowd = crowdRef.current;
    try {
      const latestCrowd = await readCrowd(question.id);
      if (latestCrowd) finalCrowd = latestCrowd;
    } catch {
      if (!finalCrowd.total) finalCrowd = fallbackCrowd(selectedIndexRef.current);
    }

    if (!finalCrowd.total && selectedIndexRef.current !== null) {
      finalCrowd = fallbackCrowd(selectedIndexRef.current);
    }

    setCrowd(finalCrowd);

    const isCorrect = selectedIndexRef.current === question.correctIndex;
    const correctVotes = finalCrowd.counts[question.correctIndex];
    const majorityBonus = isCorrect && finalCrowd.total > 0 && correctVotes / finalCrowd.total < 0.5;
    const {
      speedBonus,
      cluePenalty,
      rawPoints: correctPoints,
    } = scoreBreakdown(question, answerTimeLeftRef.current, answerDuration);
    const rawPoints = isCorrect ? correctPoints : 0;
    const points = majorityBonus ? rawPoints * 2 : rawPoints;

    setRoundAward({ points, majorityBonus, correct: isCorrect, speedBonus, cluePenalty });
    setScore((currentScore) => currentScore + points);
    setHistory((records) => [
      ...records,
      {
        id: question.id,
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

    setRevealDeadlineState(Date.now() + REVEAL_DURATION_MS);
  }, [answerDuration, playSound, readCrowd, setCrowd, setDeadline, setPhase]);

  const finishSession = useCallback(() => {
    if (phaseRef.current === "lobby" || phaseRef.current === "summary") return;
    const finishedAt = Date.now();
    const startedAt = queueStartedAtRef.current ?? finishedAt;
    setRunDuration(finishedAt - startedAt);
    setDeadline(null);
    setRevealDeadlineState(null);
    setPhase("summary");
  }, [setDeadline, setPhase]);

  const advanceRound = useCallback(() => {
    if (phaseRef.current !== "reveal" || advancedRef.current) return;
    advancedRef.current = true;

    const nextIndex = roundIndexRef.current + 1;
    let nextDeck = deckRef.current;

    if (!nextDeck[nextIndex]) {
      const recentIds = new Set(nextDeck.slice(-6).map((question) => question.id));
      const generated = createArcadeDeck(
        `${queueStartedAtRef.current}:${nextIndex}:${window.crypto.randomUUID()}`,
        mode,
        mode === "trivia" ? filter : "Mixed",
        DECK_BATCH_LENGTH,
        skillLevel,
      );
      let nextBatch = [
        ...generated.filter((question) => !recentIds.has(question.id)),
        ...generated.filter((question) => recentIds.has(question.id)),
      ];

      if (mode === "mixed" && nextDeck.at(-1)?.game === nextBatch[0]?.game) {
        const differentGameIndex = nextBatch.findIndex((question) => question.game !== nextDeck.at(-1)?.game);
        if (differentGameIndex > 0) {
          nextBatch = [
            nextBatch[differentGameIndex],
            ...nextBatch.slice(0, differentGameIndex),
            ...nextBatch.slice(differentGameIndex + 1),
          ];
        }
      }

      if (!nextBatch.length) {
        finishSession();
        return;
      }

      nextDeck = [...nextDeck, ...nextBatch];
      deckRef.current = nextDeck;
      setDeck(nextDeck);
    }

    roundIndexRef.current = nextIndex;
    setRoundIndex(nextIndex);
    prepareRound(nextDeck[nextIndex]);
  }, [filter, finishSession, mode, prepareRound, skillLevel]);

  useEffect(() => {
    if (phase === "lobby" || phase === "summary") return;
    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase === "answering" && deadline && now >= deadline) void finalizeRound();
  }, [deadline, finalizeRound, now, phase]);

  useEffect(() => {
    if (phase === "reveal" && revealDeadline && now >= revealDeadline) advanceRound();
  }, [advanceRound, now, phase, revealDeadline]);

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
      if (!event || typeof event !== "object" || !("questionId" in event)) return;
      const questionId = event.questionId;
      const result = normalizeCrowd(event);
      if (typeof questionId === "string" && result && currentQuestionRef.current?.id === questionId) {
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

  useEffect(
    () => () => {
      if (audioContextRef.current) void audioContextRef.current.close();
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
    ? scoreBreakdown(currentQuestion, selectedIndex === null ? answerRemaining : answerTimeLeft, answerDuration)
    : null;
  const recentHistory = history.slice(phase === "answering" ? -9 : -10);
  const recentHistoryStart = history.length - recentHistory.length + 1;
  const spellHint = currentQuestion?.hint ?? "A mechanical clue will appear near the end of the round.";
  const spellClueTwo =
    skillLevel === "Veteran" ? spellMechanicHint(spellHint) : (currentQuestion?.eyebrow ?? "Ability name");
  const activeModeInfo = MODE_INFO[mode];

  return (
    <main className={styles.shell}>
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
          <span className={styles.patchBadge}>Patch {triviaMeta.patch}</span>
          <span className={styles.fanBadge}>Unofficial fan project</span>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setSoundEnabled((enabled) => !enabled)}
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
              Three games live · More in the lab
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
              <button type="button" data-testid="start-arcade" className={styles.primaryButton} onClick={startRun}>
                <Gamepad2 />
                {activeModeInfo.action}
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
                      aria-pressed={skillLevel === option}
                    >
                      <strong>{SKILL_INFO[option].label}</strong>
                      <small>{SKILL_INFO[option].description}</small>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.featureStrip}>
              <div>
                <strong>3</strong>
                <span>games live</span>
              </div>
              <div>
                <strong>{triviaMeta.questionCount}</strong>
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
                <QuestionArtwork question={previewQuestion} />
                <span>{activeModeInfo.eyebrow}</span>
                <h2>
                  {mode === "mixed"
                    ? "The next round could be anything."
                    : mode === "shopkeeper"
                      ? `Finish ${previewQuestion.eyebrow}'s recipe.`
                      : mode === "spell-link"
                        ? "Who cast this? Link the spell to its hero."
                        : previewQuestion.prompt}
                </h2>
                <p>{activeModeInfo.description}</p>
              </div>
              <div className={styles.previewAnswers}>
                {previewQuestion.answers.map((answer, index) => (
                  <div key={answer}>
                    <span>{LETTERS[index]}</span>
                    {answer}
                  </div>
                ))}
              </div>
              <div className={styles.previewFooter}>
                <Users />
                Shared answer split and speed score after every round
              </div>
            </div>

            <div className={styles.queueToast}>
              <span className={styles.readyIcon}>
                <Gamepad2 />
              </span>
              <span>
                <small>Endless session ready</small>
                {SKILL_INFO[skillLevel].label} · {activeModeInfo.shortLabel}
              </span>
              <strong>{answerDuration / 1000}s</strong>
            </div>
          </div>
        </section>
      )}

      {(phase === "answering" || phase === "reveal") && currentQuestion && (
        <section className={styles.gameLayout}>
          <div
            className={clsx(
              styles.gameStage,
              currentGame === "shopkeeper" && styles.shopkeeperStage,
              currentGame === "spell-link" && styles.spellLinkStage,
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
                <strong>
                  {phase === "answering"
                    ? String(Math.ceil(answerRemaining / 1000)).padStart(2, "0")
                    : String(Math.ceil(revealRemaining / 1000)).padStart(2, "0")}
                </strong>
              </div>
            </div>

            {currentGame === "shopkeeper" ? (
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
            ) : (
              <div className={styles.questionBlock} data-testid="round-prompt">
                <QuestionArtwork question={currentQuestion} />
                <div className={styles.questionCopy}>
                  <span>{currentQuestion.eyebrow}</span>
                  <h2>{currentQuestion.prompt}</h2>
                  <small>Patch {currentQuestion.patch} · No talents or upgrades unless stated</small>
                </div>
              </div>
            )}

            <div
              className={clsx(
                styles.answers,
                currentGame === "shopkeeper" && styles.itemAnswers,
                currentGame === "spell-link" && styles.heroAnswers,
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
                        kind={currentGame === "spell-link" ? "hero" : "item"}
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

            {phase === "answering" ? (
              <div className={styles.answerHelper}>
                {selectedIndex === null ? (
                  <>
                    <Keyboard />
                    {currentGame === "shopkeeper"
                      ? "Pick the missing component · A–D or 1–4"
                      : currentGame === "spell-link"
                        ? "Link the spell to a hero · A–D or 1–4"
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
            ) : (
              <div
                className={clsx(styles.revealPanel, selectedWasCorrect ? styles.revealCorrect : styles.revealWrong)}
                aria-live="polite"
              >
                <div className={styles.revealIcon}>{selectedWasCorrect ? <Check /> : <X />}</div>
                <div className={styles.revealCopy}>
                  <span>{selectedWasCorrect ? "Correct" : selectedIndex === null ? "Time expired" : "Not quite"}</span>
                  <p>{currentQuestion.explanation}</p>
                  <a href={currentQuestion.source.url} target="_blank" rel="noreferrer">
                    <Info />
                    {currentQuestion.source.label}
                  </a>
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
                  <span>points</span>
                </div>
              </div>
            )}

            {phase === "reveal" && (
              <div className={styles.autoAdvance} aria-live="polite">
                Next round starts automatically
                <strong>{Math.ceil(revealRemaining / 1000)}s</strong>
                <ChevronRight />
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
                  <small>{MODE_INFO[mode].shortLabel} session</small>
                  Endless rounds
                </span>
                <strong>{formatDuration(sessionElapsed)}</strong>
              </div>
              <div className={styles.queueDetails}>
                <span>{skillLevel}</span>
                <i />
                <span>Auto advance</span>
                <i />
                <span>Shared results</span>
              </div>
              <button
                type="button"
                data-testid="end-session"
                onClick={finishSession}
                disabled={phase === "reveal" && roundAward === null}
              >
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
                  Global answers
                </span>
                <span className={styles.livePill}>Shared</span>
              </div>
              <strong>
                {crowd.total.toLocaleString("en-US")} {crowd.total === 1 ? "answer" : "answers"}
              </strong>
              <p>
                {phase === "answering"
                  ? "Your pick joins this question’s shared split. Results stay hidden until time expires."
                  : crowd.total
                    ? "Answer history for this exact question, across every arcade session."
                    : "Be the first player to answer this question."}
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
                      : "Crowd rules"}
                </span>
                <p>
                  {currentGame === "shopkeeper"
                    ? "Look for the real component, not an item that merely has a similar cost or stat."
                    : currentGame === "spell-link"
                      ? `Each extra clue costs ${SPELL_CLUE_PENALTY} points. Answering sooner also preserves up to ${MAX_SPEED_BONUS} speed points.`
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
            <span className={styles.summaryPatch}>Patch {triviaMeta.patch}</span>
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
            <button type="button" className={styles.primaryButton} onClick={startRun}>
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
