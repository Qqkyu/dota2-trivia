import { ALPHA_SESSION_RETENTION_DAYS, summarizeAlphaSessions } from "@/lib/alpha-analytics.mjs";
import { getAlphaSummary, getDailyCounts } from "@/lib/alpha-store";
import { DAILY_MAX_POINTS, openDailyNumbers } from "@/lib/daily.mjs";
import { PUBLIC_ARCADE_MODE, PUBLIC_ROUND_FORMATS, roundFormatForQuestion } from "@/lib/arcade-games.mjs";
import { getCalibrationSnapshot } from "@/lib/calibration-data";
import { DEFAULT_GAME_ID } from "@/lib/game-catalogs";
import { publicRoomFor } from "@/lib/public-rooms";
import { getRoomPresence } from "@/lib/room-presence.mjs";

const FORMAT_LABELS: Record<string, string> = {
  "classic-ability-values": "Ability values",
  "classic-hero-stats": "Hero stats",
  "classic-item-prices": "Item prices",
  "shopkeeper-builds": "Shopkeeper builds",
  "shopkeeper-paths": "Shopkeeper paths",
  "spell-link": "Spell Link",
  "fogged-vision": "Fogged Vision",
  "echo-hunt": "Echo Hunt",
  soundcheck: "Soundcheck",
  "quote-hunt": "Quote Hunt",
  "aghanim-upgrades": "Aghanim's Lab",
  "value-order": "Order Up",
  flashback: "Flashback",
};

export type AlphaFormatSignal = "collecting" | "healthy" | "too-easy" | "too-hard" | "reported";

export interface AlphaFormatHealth {
  format: string;
  label: string;
  answers: number;
  correct: number;
  accuracy: number;
  reports: number;
  reportRate: number;
  signal: AlphaFormatSignal;
}

export interface DailyDayFigures {
  day: number;
  starts: number;
  finishes: number;
  /** Finishers who also finished the day before, as their browser reported it. */
  backFromYesterday: number;
  /** backFromYesterday as a share of the day before's finishers. Null without a day before. */
  nextDayReturn: number | null;
  averageScore: number | null;
}

export interface DailyFigures {
  days: DailyDayFigures[];
  /** Next-day return over the whole window: returns divided by the day-before finishes. */
  nextDayReturn: number | null;
}

/** The owner judges the daily over four weeks after the launch post. */
export const DAILY_OPS_WINDOW_DAYS = 28;

export function summarizeDailyFigures(
  counts: Record<number, Record<string, number>>,
  firstDay: number,
  lastDay: number,
) {
  const days: DailyDayFigures[] = [];
  let returns = 0;
  let previousFinishes = 0;
  for (let day = lastDay; day >= firstDay; day -= 1) {
    const today = counts[day] ?? {};
    const yesterday = counts[day - 1];
    const finishes = today.finish ?? 0;
    const backFromYesterday = today["finish:yesterday"] ?? 0;
    let scored = 0;
    for (let score = 0; score <= DAILY_MAX_POINTS; score += 1) scored += score * (today[`score:${score}`] ?? 0);
    const yesterdayFinishes = yesterday?.finish ?? 0;
    if (day > firstDay && yesterdayFinishes) {
      returns += backFromYesterday;
      previousFinishes += yesterdayFinishes;
    }
    days.push({
      day,
      starts: today.start ?? 0,
      finishes,
      backFromYesterday,
      nextDayReturn: yesterdayFinishes ? backFromYesterday / yesterdayFinishes : null,
      averageScore: finishes ? scored / finishes : null,
    });
  }
  return { days, nextDayReturn: previousFinishes ? returns / previousFinishes : null } satisfies DailyFigures;
}

export interface AlphaOpsSnapshot {
  generatedAt: number;
  retentionDays: number;
  activePlayers: number;
  sessions: ReturnType<typeof summarizeAlphaSessions>;
  formats: AlphaFormatHealth[];
  daily: DailyFigures;
}

function formatSignal(answers: number, accuracy: number, reports: number, reportRate: number): AlphaFormatSignal {
  if (answers < 20) return "collecting";
  if (reports >= 2 && reportRate >= 2) return "reported";
  if (accuracy >= 85) return "too-easy";
  if (accuracy <= 35) return "too-hard";
  return "healthy";
}

export async function getAlphaOpsSnapshot(now = Date.now()): Promise<AlphaOpsSnapshot> {
  const [sessions, calibration] = await Promise.all([getAlphaSummary(now), getCalibrationSnapshot(DEFAULT_GAME_ID)]);
  const grouped = new Map(
    PUBLIC_ROUND_FORMATS.map((format) => [
      format,
      { format, label: FORMAT_LABELS[format] ?? format, answers: 0, correct: 0, reports: 0 },
    ]),
  );

  for (const record of calibration.records) {
    const format = roundFormatForQuestion(record);
    if (!format) continue;
    const aggregate = grouped.get(format);
    if (!aggregate) continue;
    aggregate.answers += record.total;
    aggregate.correct += record.correct;
    aggregate.reports += record.reportTotal;
  }

  const formats = [...grouped.values()].map((format): AlphaFormatHealth => {
    const accuracy = format.answers ? Math.round((format.correct / format.answers) * 100) : 0;
    const reportRate = format.answers ? Math.round((format.reports / format.answers) * 1_000) / 10 : 0;
    return {
      ...format,
      accuracy,
      reportRate,
      signal: formatSignal(format.answers, accuracy, format.reports, reportRate),
    };
  });

  const room = publicRoomFor({ gameId: DEFAULT_GAME_ID, mode: PUBLIC_ARCADE_MODE, filter: "Mixed" });
  const lastDay = openDailyNumbers(now).latest;
  const firstDay = Math.max(1, lastDay - DAILY_OPS_WINDOW_DAYS + 1);
  const dailyCounts = await getDailyCounts(Math.max(1, firstDay - 1), lastDay);
  return {
    generatedAt: now,
    retentionDays: ALPHA_SESSION_RETENTION_DAYS,
    activePlayers: getRoomPresence(room.id, now),
    sessions,
    formats,
    daily: summarizeDailyFigures(dailyCounts, firstDay, lastDay),
  };
}
