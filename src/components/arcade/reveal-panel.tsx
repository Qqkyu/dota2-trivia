import Image from "next/image";
import { isPublicKeyedAnswerQuestion, publicCorrectIndex, type PublicArcadeQuestion } from "@/lib/public-question";
import { Check, Flag, X } from "lucide-react";
import clsx from "clsx";
import { REPORT_REASON_LABELS, REPORT_REASONS } from "@/lib/calibration";
import { crowdSummaryLine } from "@/lib/crowd-summary.mjs";
import { HERO_PICKER_BY_KEY, heroPickerPortraitSrc } from "@/lib/hero-picker";
import { SHOPKEEPER_CATALOG_BY_KEY } from "@/lib/shopkeeper-catalog";
import styles from "../queue-arcade.module.css";
import own from "./reveal-panel.module.css";
import { keyedAnswerLabel, LETTERS } from "./shared";

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
  | "crowd"
  | "selectedIndex"
  | "selectedAnswerKey"
> &
  Pick<ReturnType<typeof deriveRoundView>, "selectedWasCorrect" | "resultCallout" | "isValueOrderRound">;

function crowdSummary(
  question: PublicArcadeQuestion,
  crowd: RevealPanelProps["crowd"],
  selectedIndex: number | null,
  selectedAnswerKey: string | null,
) {
  if (isPublicKeyedAnswerQuestion(question)) {
    const correctKey = question.reveal?.correctAnswerKey ?? null;
    const rightCount = crowd.keyCounts.find((entry) => entry.answerKey === correctKey)?.count ?? 0;
    const top = crowd.keyCounts.reduce<(typeof crowd.keyCounts)[number] | null>(
      (best, entry) => (best === null || entry.count > best.count ? entry : best),
      null,
    );
    return crowdSummaryLine({
      total: crowd.total,
      rightCount,
      playerAnswered: selectedAnswerKey !== null,
      majorityLabel: top ? keyedAnswerLabel(top.answerKey, "another pick", question) : null,
      majorityIsRight: !top || top.answerKey === correctKey || top.count <= rightCount,
    });
  }
  const correctIndex = publicCorrectIndex(question);
  const rightCount = correctIndex === null ? 0 : (crowd.counts[correctIndex] ?? 0);
  const topIndex = crowd.counts.reduce((best, count, index) => (count > crowd.counts[best] ? index : best), 0);
  return crowdSummaryLine({
    total: crowd.total,
    rightCount,
    playerAnswered: selectedIndex !== null,
    majorityLabel: `${LETTERS[topIndex]} · ${question.answers[topIndex] ?? ""}`,
    majorityIsRight: topIndex === correctIndex || crowd.counts[topIndex] <= rightCount,
  });
}

/** The answer as a picture: the question's own mark, else the correct hero or item from a grid pick. */
function revealMedia(question: PublicArcadeQuestion) {
  const media = question.reveal?.media;
  if (media && media.kind !== "photo") {
    return { src: media.src, alt: media.alt, caption: media.caption ?? null, testid: "flashback-reveal-media" };
  }
  if (!isPublicKeyedAnswerQuestion(question)) return null;
  const correctKey = question.reveal?.correctAnswerKey;
  if (!correctKey) return null;
  const hero = HERO_PICKER_BY_KEY.get(correctKey);
  if (hero)
    return { src: heroPickerPortraitSrc(hero.image), alt: hero.name, caption: hero.name, testid: "keyed-reveal-media" };
  const item = SHOPKEEPER_CATALOG_BY_KEY.get(correctKey);
  if (item) return { src: item.image, alt: item.name, caption: item.name, testid: "keyed-reveal-media" };
  return null;
}

export function RevealPanel({
  currentQuestion,
  roundAward,
  activeRoundId,
  reportState,
  reportedReason,
  reportTarget,
  submitQuestionReport,
  toggleQuestionReport,
  crowd,
  selectedIndex,
  selectedAnswerKey,
  selectedWasCorrect,
  resultCallout,
  isValueOrderRound,
}: RevealPanelProps) {
  const media = revealMedia(currentQuestion);
  return (
    <div
      className={clsx(styles.revealPanel, selectedWasCorrect ? own.revealCorrect : own.revealWrong)}
      data-testid="reveal-panel"
      data-has-media={media ? "true" : "false"}
      data-media-kind={media ? "mark" : undefined}
      aria-live="polite"
    >
      <div className={own.revealIcon}>{selectedWasCorrect ? <Check /> : <X />}</div>
      {media && (
        <figure className={styles.revealMedia} data-kind="mark" data-testid={media.testid}>
          <Image src={media.src} alt={media.alt} width={88} height={88} unoptimized />
          {media.caption ? <figcaption>{media.caption}</figcaption> : null}
        </figure>
      )}
      <div className={styles.revealCopy}>
        <span data-testid="reveal-callout" data-callout={resultCallout}>
          {resultCallout}
        </span>
        {!isValueOrderRound && <p data-testid="reveal-explanation">{currentQuestion.reveal?.explanation}</p>}
        <p className={own.crowdLine} data-testid="crowd-summary" data-total={crowd.total}>
          {crowdSummary(currentQuestion, crowd, selectedIndex, selectedAnswerKey)}
        </p>
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
      <div className={styles.pointsAward} data-award={roundAward?.correct ? "scored" : "none"}>
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
