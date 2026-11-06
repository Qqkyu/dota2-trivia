import { describe, expect, it } from "vitest";
import {
  CALIBRATION_MIN_SAMPLE,
  CALIBRATION_REVIEW_REPORTS,
  QUESTION_REPORT_GRACE_MS,
  REPORT_REASONS,
  calibrationSignal,
  hideCalibrationAnswerCounts,
  publicAnswersOpen,
  reportTotal,
} from "../src/lib/calibration.mjs";

const noReports = { incorrect: 0, outdated: 0, ambiguous: 0, unclear: 0 };
const signal = (difficulty, total, correct, reports = noReports) =>
  calibrationSignal({ difficulty, total, correct, reports });

describe("calibration thresholds", () => {
  it("keeps the reviewed constants", () => {
    expect(CALIBRATION_MIN_SAMPLE).toBe(20);
    expect(CALIBRATION_REVIEW_REPORTS).toBe(3);
    expect(QUESTION_REPORT_GRACE_MS).toBe(20_000);
    expect([...REPORT_REASONS]).toEqual(["incorrect", "outdated", "ambiguous", "unclear"]);
  });
});

describe("calibrationSignal", () => {
  it("collects until the minimum sample", () => {
    expect(signal(2, 19, 19)).toMatchObject({ status: "collecting", sampleReady: false });
  });

  it("classifies sampled accuracy against the tier band", () => {
    expect(signal(2, 20, 20).status).toBe("too-easy");
    expect(signal(2, 20, 4).status).toBe("too-hard");
    expect(signal(2, 20, 12).status).toBe("on-target");
  });

  it("escalates reports after three independent players", () => {
    const watched = signal(3, 0, 0, { ...noReports, ambiguous: 1 });
    const reviewed = signal(3, 30, 18, { ...noReports, ambiguous: 2, incorrect: 1 });
    expect(watched).toMatchObject({ status: "reported", label: "Watch reports" });
    expect(reviewed).toMatchObject({ status: "reported", label: "Review reports", reportTotal: 3 });
    expect(reportTotal({ ...noReports, unclear: 3 })).toBe(3);
  });
});

describe("publicAnswersOpen", () => {
  it("allows a new public snapshot only in the early part of a reveal", () => {
    expect(publicAnswersOpen({ phase: "answering", msIntoPhase: 0 }, 7_000)).toBe(true);
    expect(publicAnswersOpen({ phase: "answering", msIntoPhase: 14_999 }, 7_000)).toBe(true);
    expect(publicAnswersOpen({ phase: "reveal", msIntoPhase: 0 }, 7_000)).toBe(false);
    expect(publicAnswersOpen({ phase: "reveal", msIntoPhase: 4_999 }, 7_000)).toBe(false);
    expect(publicAnswersOpen({ phase: "reveal", msIntoPhase: 5_000 }, 7_000)).toBe(true);
  });
});

describe("hideCalibrationAnswerCounts", () => {
  it("keeps totals but hides per-option counts", () => {
    const publicRecord = hideCalibrationAnswerCounts({
      questionId: "damage:axe_culling_blade:1",
      questionRevision: "rev-1",
      prompt: "What is Culling Blade's damage?",
      counts: [0, 0, 1, 0],
      total: 1,
      correct: 1,
      signal: { status: "collecting", accuracy: 1, sampleReady: false },
    });
    expect(publicRecord.questionId).toBe("rev-1");
    expect(publicRecord.counts).toEqual([0, 0, 0, 0]);
    expect(publicRecord.total).toBe(1);
    expect(publicRecord.correct).toBe(0);
    expect(publicRecord.signal.accuracy).toBeNull();
    expect(publicRecord.signal.status).toBe("collecting");
    expect(publicRecord.signal.priority).toBe(0);
  });

  it("hides Spell Link ability names while public calibration is open", () => {
    const publicRecord = hideCalibrationAnswerCounts({
      questionId: "ability-owner:huskar_burning_spear",
      questionRevision: "rev-spear",
      game: "spell-link",
      kind: "spell-owner",
      eyebrow: "Burning Spear",
      prompt: "Which hero owns this ability?",
      counts: [0, 0, 1, 0],
      total: 1,
      correct: 1,
      reportTotal: 0,
      signal: { status: "collecting", accuracy: 1, sampleReady: false, label: "Collecting" },
    });
    expect(publicRecord.eyebrow).toBe("Spell Link");
    expect(publicRecord.questionId).toBe("rev-spear");
  });

  it("treats every record alike, so no record marks the open public question", () => {
    const publicRecord = hideCalibrationAnswerCounts({
      questionId: "ability-owner:huskar_burning_spear",
      questionRevision: "rev-spear",
      game: "spell-link",
      kind: "spell-owner",
      eyebrow: "Burning Spear",
      total: 1,
      updatedAt: 99,
      reportTotal: 0,
      signal: { status: "collecting", accuracy: 1, sampleReady: false },
    });
    expect(publicRecord.total).toBe(1);
    expect(publicRecord.updatedAt).toBe(99);
    expect(publicRecord.eyebrow).toBe("Spell Link");
  });
});
