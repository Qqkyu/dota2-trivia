import {
  CALIBRATION_MIN_SAMPLE as minimumSample,
  CALIBRATION_REVIEW_REPORTS as reviewReports,
  REPORT_REASONS as reportReasons,
  calibrationSignal as buildSignal,
  reportTotal as sumReports,
} from "@/lib/calibration.mjs";

export const REPORT_REASONS = reportReasons as readonly ["incorrect", "outdated", "ambiguous", "unclear"];
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  incorrect: "Wrong answer",
  outdated: "Outdated",
  ambiguous: "Ambiguous",
  unclear: "Unclear",
};

export const CALIBRATION_MIN_SAMPLE = minimumSample;
export const CALIBRATION_REVIEW_REPORTS = reviewReports;

export type CalibrationStatus = "reported" | "collecting" | "too-easy" | "too-hard" | "on-target";

export interface ReportCounts {
  [reason: string]: number;
  incorrect: number;
  outdated: number;
  ambiguous: number;
  unclear: number;
}

export interface CalibrationSignal {
  status: CalibrationStatus;
  label: string;
  recommendation: string;
  accuracy: number | null;
  sampleReady: boolean;
  expectedMinimum: number;
  expectedMaximum: number;
  reportTotal: number;
  priority: number;
}

export function emptyReportCounts(): ReportCounts {
  return { incorrect: 0, outdated: 0, ambiguous: 0, unclear: 0 };
}

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === "string" && REPORT_REASONS.some((reason) => reason === value);
}

export function reportTotal(reports: ReportCounts) {
  return sumReports(reports);
}

export function calibrationSignal(input: {
  difficulty: 1 | 2 | 3;
  total: number;
  correct: number;
  reports: ReportCounts;
}): CalibrationSignal {
  return buildSignal(input) as CalibrationSignal;
}
