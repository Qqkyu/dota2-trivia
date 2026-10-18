import { Flag, X } from "lucide-react";
import type { QuestionReportTarget } from "./shared";
import { REPORT_REASON_LABELS, REPORT_REASONS } from "@/lib/calibration";
import own from "./report-carryover.module.css";

import type { useArcadeRoom } from "./use-arcade-room";

type ReportCarryoverProps = { reportTarget: QuestionReportTarget } & Pick<
  ReturnType<typeof useArcadeRoom>,
  "reportState" | "reportTarget" | "submitQuestionReport" | "dismissQuestionReport"
>;

export function ReportCarryover({
  reportState,
  reportTarget,
  submitQuestionReport,
  dismissQuestionReport,
}: ReportCarryoverProps) {
  return (
    <aside className={own.reportCarryover} data-testid="report-carryover" aria-label="Report previous question">
      <div className={own.reportCarryoverTitle}>
        <Flag />
        <span>
          <small>Report previous question</small>
          <strong>{reportTarget.prompt}</strong>
          <em>Answer · {reportTarget.answer}</em>
        </span>
        <button type="button" aria-label="Dismiss question report" onClick={dismissQuestionReport}>
          <X />
        </button>
      </div>
      <div className={own.reportCarryoverReasons} role="group" aria-label="Why are you reporting this question?">
        {REPORT_REASONS.map((reason) => (
          <button
            key={reason}
            type="button"
            data-testid="report-reason"
            data-report-reason={reason}
            onClick={() => void submitQuestionReport(reason)}
            disabled={reportState === "sending"}
          >
            {reportState === "sending" ? "Sending…" : REPORT_REASON_LABELS[reason]}
          </button>
        ))}
      </div>
      {reportState === "error" && <small className={own.reportCarryoverError}>Couldn’t send · try again</small>}
    </aside>
  );
}
