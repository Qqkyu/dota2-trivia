import Image from "next/image";
import type { PublicArcadeQuestion } from "@/lib/public-question";
import { Check, Flag, X } from "lucide-react";
import clsx from "clsx";
import { REPORT_REASON_LABELS, REPORT_REASONS } from "@/lib/calibration";
import styles from "../queue-arcade.module.css";
import own from "./reveal-panel.module.css";

import type { useArcadeRoom } from "./use-arcade-room";
import type { deriveRoundView } from "./round-view";

type RevealPanelProps = { currentQuestion: PublicArcadeQuestion } & Pick<
  ReturnType<typeof useArcadeRoom>,
  | "currentQuestion"
  | "roundAward"
  | "activeRoundId"
  | "reportState"
  | "reportedReason"
  | "reportTarget"
  | "submitQuestionReport"
  | "toggleQuestionReport"
> &
  Pick<ReturnType<typeof deriveRoundView>, "selectedWasCorrect" | "resultCallout" | "isValueOrderRound">;

export function RevealPanel({
  currentQuestion,
  roundAward,
  activeRoundId,
  reportState,
  reportedReason,
  reportTarget,
  submitQuestionReport,
  toggleQuestionReport,
  selectedWasCorrect,
  resultCallout,
  isValueOrderRound,
}: RevealPanelProps) {
  return (
    <div
      className={clsx(styles.revealPanel, selectedWasCorrect ? own.revealCorrect : own.revealWrong)}
      data-testid="reveal-panel"
      data-has-media={currentQuestion.reveal?.media && currentQuestion.reveal.media.kind !== "photo" ? "true" : "false"}
      data-media-kind={
        currentQuestion.reveal?.media && currentQuestion.reveal.media.kind !== "photo" ? "mark" : undefined
      }
      aria-live="polite"
    >
      <div className={own.revealIcon}>{selectedWasCorrect ? <Check /> : <X />}</div>
      {currentQuestion.reveal?.media && currentQuestion.reveal.media.kind !== "photo" && (
        <figure className={styles.revealMedia} data-kind="mark" data-testid="flashback-reveal-media">
          <Image
            src={currentQuestion.reveal.media.src}
            alt={currentQuestion.reveal.media.alt}
            width={88}
            height={88}
            unoptimized
          />
          {currentQuestion.reveal.media.caption ? (
            <figcaption>{currentQuestion.reveal.media.caption}</figcaption>
          ) : null}
        </figure>
      )}
      <div className={styles.revealCopy}>
        <span data-testid="reveal-callout" data-callout={resultCallout}>
          {resultCallout}
        </span>
        {!isValueOrderRound && <p data-testid="reveal-explanation">{currentQuestion.reveal?.explanation}</p>}
        <div className={own.reportControl}>
          <button
            type="button"
            className={styles.reportButton}
            data-testid="report-question"
            aria-expanded={reportTarget?.roundId === activeRoundId}
            onClick={toggleQuestionReport}
            disabled={reportState === "sending" || reportState === "sent"}
          >
            <Flag />
            {reportedReason
              ? `Reported · ${REPORT_REASON_LABELS[reportedReason]}`
              : reportState === "sending"
                ? "Sending…"
                : reportState === "error"
                  ? "Try report again"
                  : "Report question"}
          </button>
          {reportTarget?.roundId === activeRoundId && !reportedReason && (
            <div className={own.reportMenu} role="group" aria-label="Why are you reporting this question?">
              {REPORT_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  data-testid="report-reason"
                  data-report-reason={reason}
                  onClick={() => void submitQuestionReport(reason)}
                >
                  {REPORT_REASON_LABELS[reason]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className={styles.pointsAward}>
        <small>
          {roundAward?.majorityBonus
            ? "2× crowd breaker"
            : roundAward?.correct
              ? `+${roundAward.speedBonus} speed${roundAward.cluePenalty ? ` · −${roundAward.cluePenalty} hints` : ""}`
              : "No score"}
        </small>
        <strong>+{roundAward?.points ?? 0}</strong>
        <span>gold</span>
      </div>
    </div>
  );
}
