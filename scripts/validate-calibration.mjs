#!/usr/bin/env node

import {
  CALIBRATION_MIN_SAMPLE,
  CALIBRATION_REVIEW_REPORTS,
  REPORT_REASONS,
  calibrationSignal,
  reportTotal,
} from "../src/lib/calibration.mjs";

const noReports = {
  incorrect: 0,
  outdated: 0,
  ambiguous: 0,
  unclear: 0,
};

function signal(difficulty, total, correct, reports = noReports) {
  return calibrationSignal({ difficulty, total, correct, reports });
}

if (
  CALIBRATION_MIN_SAMPLE !== 20 ||
  CALIBRATION_REVIEW_REPORTS !== 3 ||
  REPORT_REASONS.join(",") !== "incorrect,outdated,ambiguous,unclear"
) {
  throw new Error("Calibration thresholds or report reasons changed unexpectedly.");
}

if (signal(2, 19, 19).status !== "collecting" || signal(2, 19, 19).sampleReady) {
  throw new Error("A question received a difficulty recommendation before the minimum sample.");
}

if (signal(2, 20, 20).status !== "too-easy") {
  throw new Error("A sampled question above its expected accuracy band was not marked too easy.");
}

if (signal(2, 20, 4).status !== "too-hard") {
  throw new Error("A sampled question below its expected accuracy band was not marked too hard.");
}

if (signal(2, 20, 12).status !== "on-target") {
  throw new Error("A sampled question inside its expected accuracy band was not marked on target.");
}

const watched = signal(3, 0, 0, { ...noReports, ambiguous: 1 });
const reviewed = signal(3, 30, 18, { ...noReports, ambiguous: 2, incorrect: 1 });
if (
  watched.status !== "reported" ||
  watched.label !== "Watch reports" ||
  reviewed.status !== "reported" ||
  reviewed.label !== "Review reports" ||
  reviewed.reportTotal !== 3 ||
  reportTotal({ ...noReports, unclear: 3 }) !== 3
) {
  throw new Error("Independent player reports did not produce the expected manual-review signals.");
}

console.log(
  `Validated ${REPORT_REASONS.length} report reasons, ${CALIBRATION_MIN_SAMPLE}-answer calibration guardrail, and report escalation at ${CALIBRATION_REVIEW_REPORTS}.`,
);
