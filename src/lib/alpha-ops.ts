import { ALPHA_SESSION_RETENTION_DAYS, summarizeAlphaSessions } from "@/lib/alpha-analytics.mjs";
import { getAlphaSessionsSince } from "@/lib/alpha-store";
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

export interface AlphaOpsSnapshot {
  generatedAt: number;
  retentionDays: number;
  activePlayers: number;
  sessions: ReturnType<typeof summarizeAlphaSessions>;
  formats: AlphaFormatHealth[];
}

function formatSignal(answers: number, accuracy: number, reports: number, reportRate: number): AlphaFormatSignal {
  if (answers < 20) return "collecting";
  if (reports >= 2 && reportRate >= 2) return "reported";
  if (accuracy >= 85) return "too-easy";
  if (accuracy <= 35) return "too-hard";
  return "healthy";
}

export async function getAlphaOpsSnapshot(now = Date.now()): Promise<AlphaOpsSnapshot> {
  const since = now - ALPHA_SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1_000;
  const [storedSessions, calibration] = await Promise.all([
    getAlphaSessionsSince(since),
    getCalibrationSnapshot(DEFAULT_GAME_ID),
  ]);
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
  return {
    generatedAt: now,
    retentionDays: ALPHA_SESSION_RETENTION_DAYS,
    activePlayers: getRoomPresence(room.id, now),
    sessions: summarizeAlphaSessions(storedSessions, {
      now,
      windowDays: ALPHA_SESSION_RETENTION_DAYS,
      dailyDays: 14,
    }),
    formats,
  };
}
