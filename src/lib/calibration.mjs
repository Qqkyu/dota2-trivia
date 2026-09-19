export const REPORT_REASONS = Object.freeze(["incorrect", "outdated", "ambiguous", "unclear"]);
export const CALIBRATION_MIN_SAMPLE = 20;
export const CALIBRATION_REVIEW_REPORTS = 3;
export const QUESTION_REPORT_GRACE_MS = 20_000;

const EXPECTED_ACCURACY = {
  1: [0.65, 0.92],
  2: [0.45, 0.78],
  3: [0.25, 0.65],
};

/**
 * @param {Record<string, number> | undefined} reports
 */
export function reportTotal(reports) {
  return REPORT_REASONS.reduce((total, reason) => total + Math.max(0, reports?.[reason] ?? 0), 0);
}

/** Anonymous calibration may show totals and reports, not whether answers were right. */
export function hideCalibrationAnswerCounts(record, liveQuestionId) {
  const reports = Math.max(0, Number(record.reportTotal) || 0);
  const lockedSpellLink = record.game === "spell-link" || record.kind === "spell-owner";
  const hideLiveCounts = Boolean(liveQuestionId && record.questionId === liveQuestionId);
  return {
    ...record,
    questionId: record.questionRevision,
    ...(lockedSpellLink ? { eyebrow: "Spell Link" } : {}),
    counts: [0, 0, 0, 0],
    correct: 0,
    ...(hideLiveCounts ? { total: 0, updatedAt: 0 } : {}),
    signal: {
      status: reports > 0 ? "reported" : "collecting",
      label: reports > 0 ? (record.signal?.label ?? "Watch reports") : "Collecting",
      recommendation:
        reports > 0
          ? (record.signal?.recommendation ?? "Inspect reports.")
          : "Collect more answers before calibration.",
      accuracy: null,
      sampleReady: false,
      expectedMinimum: record.signal?.expectedMinimum ?? 0,
      expectedMaximum: record.signal?.expectedMaximum ?? 1,
      reportTotal: reports,
      priority: reports > 0 ? Math.max(0, Number(record.signal?.priority) || 0) : 0,
    },
  };
}

/**
 * Produces a recommendation only after the sample threshold is met. Reports
 * always remain a manual-review signal and never mutate a live difficulty.
 *
 * @param {{
 *   difficulty: 1 | 2 | 3;
 *   total: number;
 *   correct: number;
 *   reports?: Record<string, number>;
 * }} input
 */
export function calibrationSignal(input) {
  const total = Math.max(0, Math.floor(input.total));
  const correct = Math.max(0, Math.min(total, Math.floor(input.correct)));
  const reports = reportTotal(input.reports);
  const accuracy = total ? correct / total : null;
  const sampleReady = total >= CALIBRATION_MIN_SAMPLE;
  const [expectedMinimum, expectedMaximum] = EXPECTED_ACCURACY[input.difficulty] ?? EXPECTED_ACCURACY[2];

  if (reports > 0) {
    const reviewReady = reports >= CALIBRATION_REVIEW_REPORTS;
    return {
      status: "reported",
      label: reviewReady ? "Review reports" : "Watch reports",
      recommendation: reviewReady
        ? `${reports} independent reports—inspect the answer and wording.`
        : `Wait for ${CALIBRATION_REVIEW_REPORTS} independent reports before escalating.`,
      accuracy,
      sampleReady,
      expectedMinimum,
      expectedMaximum,
      reportTotal: reports,
      priority: 100 + Math.min(40, reports * 8) + (reviewReady ? 20 : 0),
    };
  }

  if (!sampleReady) {
    return {
      status: "collecting",
      label: "Collecting",
      recommendation: `${CALIBRATION_MIN_SAMPLE - total} more answers before calibration.`,
      accuracy,
      sampleReady,
      expectedMinimum,
      expectedMaximum,
      reportTotal: 0,
      priority: Math.min(19, total),
    };
  }

  if (accuracy > expectedMaximum) {
    return {
      status: "too-easy",
      label: "Too easy",
      recommendation:
        input.difficulty === 3 ? "Keep the tier; make the content or distractors harder." : "Consider a higher tier.",
      accuracy,
      sampleReady,
      expectedMinimum,
      expectedMaximum,
      reportTotal: 0,
      priority: 70 + Math.round((accuracy - expectedMaximum) * 100),
    };
  }

  if (accuracy < expectedMinimum) {
    return {
      status: "too-hard",
      label: "Too hard",
      recommendation:
        input.difficulty === 1 ? "Review clarity or correctness before changing the tier." : "Consider a lower tier.",
      accuracy,
      sampleReady,
      expectedMinimum,
      expectedMaximum,
      reportTotal: 0,
      priority: 70 + Math.round((expectedMinimum - accuracy) * 100),
    };
  }

  return {
    status: "on-target",
    label: "On target",
    recommendation: "Observed accuracy fits this tier.",
    accuracy,
    sampleReady,
    expectedMinimum,
    expectedMaximum,
    reportTotal: 0,
    priority: 30 + Math.min(20, Math.floor(total / 25)),
  };
}
