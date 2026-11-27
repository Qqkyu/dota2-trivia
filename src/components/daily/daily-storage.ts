import { safeBrowserStorage } from "@/lib/browser-storage.mjs";
import { DAILY_SLOTS, nextDailyStreak } from "@/lib/daily.mjs";
import type { DailyRoundPayload } from "@/lib/daily-types";

/** The daily lives in this browser only: progress for recent days and the day streak. */
export const DAILY_STORAGE_KEY = "queue-arcade:daily:v1";
const KEPT_DAYS = 3;

export interface DailySlotResult {
  points: number;
  correct: boolean;
  /** What the player answered, so the reveal can show it again. */
  answer: { answerIndex?: number; answerKey?: string; value?: number };
  round: DailyRoundPayload;
}

export interface DailyDayState {
  stages: number[];
  results: Array<DailySlotResult | null>;
  finished: boolean;
}

export interface DailyStreak {
  lastDay: number;
  streak: number;
  best: number;
}

export interface DailyState {
  version: 1;
  streak: DailyStreak | null;
  days: Record<string, DailyDayState>;
}

export function emptyDay(): DailyDayState {
  return { stages: DAILY_SLOTS.map(() => 1), results: DAILY_SLOTS.map(() => null), finished: false };
}

function isDayState(value: unknown): value is DailyDayState {
  if (!value || typeof value !== "object") return false;
  const day = value as Partial<DailyDayState>;
  return (
    Array.isArray(day.stages) &&
    day.stages.length === DAILY_SLOTS.length &&
    Array.isArray(day.results) &&
    day.results.length === DAILY_SLOTS.length &&
    typeof day.finished === "boolean"
  );
}

export function readDailyState(): DailyState {
  try {
    const raw = safeBrowserStorage("local").getItem(DAILY_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<DailyState>) : null;
    if (!parsed || parsed.version !== 1) return { version: 1, streak: null, days: {} };
    const streak =
      parsed.streak && Number.isInteger(parsed.streak.lastDay) && Number.isInteger(parsed.streak.streak)
        ? parsed.streak
        : null;
    const days = Object.fromEntries(
      Object.entries(parsed.days ?? {}).filter((entry): entry is [string, DailyDayState] => isDayState(entry[1])),
    );
    return { version: 1, streak, days };
  } catch {
    return { version: 1, streak: null, days: {} };
  }
}

export function writeDailyState(state: DailyState, today: number) {
  const days = Object.fromEntries(Object.entries(state.days).filter(([day]) => Number(day) > today - KEPT_DAYS));
  try {
    safeBrowserStorage("local").setItem(DAILY_STORAGE_KEY, JSON.stringify({ ...state, days }));
  } catch {
    // Private windows may refuse storage; the daily still plays, it just forgets on reload.
  }
}

export function finishDay(state: DailyState, day: number): DailyState {
  const current = state.days[day] ?? emptyDay();
  return {
    ...state,
    streak: nextDailyStreak(state.streak, day),
    days: { ...state.days, [day]: { ...current, finished: true } },
  };
}
