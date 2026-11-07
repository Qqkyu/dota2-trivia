import { Flag, X } from "lucide-react";
import type { QuestionReportTarget } from "./shared";
import { useLocale } from "@/i18n/provider";
import { REPORT_REASON_LABEL_KEYS, REPORT_REASONS } from "@/lib/calibration";
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
  const { t } = useLocale();
  return (
    <aside className={own.reportCarryover} data-testid="report-carryover" aria-label={t("round.report.previous")}>
      <div className={own.reportCarryoverTitle}>
        <Flag />
        <span>
          <small>{t("round.report.previous")}</small>
          <strong>{reportTarget.prompt}</strong>
          <em>{t("round.report.answer", { answer: reportTarget.answer })}</em>
        </span>
        <button type="button" aria-label={t("round.report.dismissAria")} onClick={dismissQuestionReport}>
          <X />
        </button>
      </div>
      <div className={own.reportCarryoverReasons} role="group" aria-label={t("round.report.whyAria")}>
        {REPORT_REASONS.map((reason) => (
          <button
            key={reason}
            type="button"
            data-testid="report-reason"
            data-report-reason={reason}
            onClick={() => void submitQuestionReport(reason)}
            disabled={reportState === "sending"}
          >
            {reportState === "sending" ? t("round.report.sending") : t(REPORT_REASON_LABEL_KEYS[reason])}
          </button>
        ))}
      </div>
      {reportState === "error" && <small className={own.reportCarryoverError}>{t("round.report.sendFailed")}</small>}
    </aside>
  );
}
