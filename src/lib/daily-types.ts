import type { DAILY_ESTIMATE_FAMILIES, DAILY_SLOTS } from "@/lib/daily.mjs";
import type { PublicArcadeQuestion } from "@/lib/public-question";

/** Daily shapes shared by the server and the browser. No catalog data lives here. */
export type DailyGame = (typeof DAILY_SLOTS)[number];
export type EstimateFamily = keyof typeof DAILY_ESTIMATE_FAMILIES;

export interface DailyEstimate {
  family: EstimateFamily;
  unit: string;
  subject: { name: string; context?: string; image: string; kind: string };
  slider: { min: number; max: number; step: number };
  reveal: { value: number; label: string } | null;
}

export interface DailyRoundPayload {
  day: number;
  slot: number;
  game: DailyGame;
  stage: 1 | 2 | 3;
  maxStage: 1 | 3;
  question?: PublicArcadeQuestion;
  estimate?: DailyEstimate;
}

export interface DailyAnswer {
  answerIndex?: number;
  answerKey?: string;
  value?: number;
}
