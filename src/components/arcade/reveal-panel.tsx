import Image from "next/image";
import { isPublicKeyedAnswerQuestion, publicCorrectIndex, type PublicArcadeQuestion } from "@/lib/public-question";
import { Check, Flag, X } from "lucide-react";
import clsx from "clsx";
import { useLocale } from "@/i18n/provider";
import type { Translate } from "@/i18n/translator";
import { REPORT_REASON_LABEL_KEYS, REPORT_REASONS } from "@/lib/calibration";
import { crowdSummaryLine } from "@/lib/crowd-summary.mjs";
import { revealCalloutKey } from "@/lib/dota-flavor.mjs";
import { HERO_PICKER_BY_KEY, heroPickerPortraitSrc } from "@/lib/hero-picker";
import { SHOPKEEPER_CATALOG_BY_KEY } from "@/lib/shopkeeper-catalog";
import styles from "../queue-arcade.module.css";
import own from "./reveal-panel.module.css";
import { keyedAnswerLabel, LETTERS } from "./shared";

import type { useArcadeRoom } from "./use-arcade-room";
import type { deriveRoundView } from "./round-view";
import { firstPartyArtSrc } from "@/lib/steam-art.mjs";

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
> &
  Pick<ReturnType<typeof deriveRoundView>, "selectedWasCorrect" | "resultCallout" | "isValueOrderRound">;

function crowdSummary(
  question: PublicArcadeQuestion,
  crowd: RevealPanelProps["crowd"],
  t: Translate,
  number: (value: number) => string,
) {
  if (isPublicKeyedAnswerQuestion(question)) {
    const correctKey = question.reveal?.correctAnswerKey ?? null;
    const rightCount = crowd.keyCounts.find((entry) => entry.answerKey === correctKey)?.count ?? 0;
    const top = crowd.keyCounts.reduce<(typeof crowd.keyCounts)[number] | null>(
      (best, entry) => (best === null || entry.count > best.count ? entry : best),
      null,
    );
    return crowdSummaryLine(
      {
        total: crowd.total,
        rightCount,
        majorityLabel: top ? keyedAnswerLabel(top.answerKey, t("round.crowd.anotherPick"), question) : null,
        majorityIsRight: !top || top.answerKey === correctKey || top.count <= rightCount,
      },
      t,
      number,
    );
  }
  const correctIndex = publicCorrectIndex(question);
  const rightCount = correctIndex === null ? 0 : (crowd.counts[correctIndex] ?? 0);
  const topIndex = crowd.counts.reduce((best, count, index) => (count > crowd.counts[best] ? index : best), 0);
  return crowdSummaryLine(
    {
      total: crowd.total,
      rightCount,
      majorityLabel: `${LETTERS[topIndex]} · ${question.answers[topIndex] ?? ""}`,
      majorityIsRight: topIndex === correctIndex || crowd.counts[topIndex] <= rightCount,
    },
    t,
    number,
  );
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
  selectedWasCorrect,
  resultCallout,
  isValueOrderRound,
}: RevealPanelProps) {
  const { t, number } = useLocale();
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
          <Image src={firstPartyArtSrc(media.src)} alt={media.alt} width={88} height={88} unoptimized />
          {media.caption ? <figcaption>{media.caption}</figcaption> : null}
        </figure>
      )}
      <div className={styles.revealCopy}>
        <span data-testid="reveal-callout" data-callout={resultCallout}>
          {t(revealCalloutKey(resultCallout))}
        </span>
        {!isValueOrderRound && <p data-testid="reveal-explanation">{currentQuestion.reveal?.explanation}</p>}
        <p className={own.crowdLine} data-testid="crowd-summary" data-total={crowd.total}>
          {crowdSummary(currentQuestion, crowd, t, number)}
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
              ? t("round.report.reported", { reason: t(REPORT_REASON_LABEL_KEYS[reportedReason]) })
              : reportState === "sending"
                ? t("round.report.sending")
                : reportState === "error"
                  ? t("round.report.retry")
                  : t("round.report.button")}
          </button>
          {reportTarget?.roundId === activeRoundId && !reportedReason && (
            <div className={own.reportMenu} role="group" aria-label={t("round.report.whyAria")}>
              {REPORT_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  data-testid="report-reason"
                  data-report-reason={reason}
                  onClick={() => void submitQuestionReport(reason)}
                >
                  {t(REPORT_REASON_LABEL_KEYS[reason])}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className={styles.pointsAward} data-award={roundAward?.correct ? "scored" : "none"}>
        <small>
          {roundAward?.majorityBonus
            ? t("round.reveal.crowdBreaker")
            : roundAward?.correct
              ? roundAward.cluePenalty
                ? t("round.reveal.speedHints", { speed: roundAward.speedBonus, penalty: roundAward.cluePenalty })
                : t("round.reveal.speed", { speed: roundAward.speedBonus })
              : t("round.reveal.noScore")}
        </small>
        <strong>+{roundAward?.points ?? 0}</strong>
        <span>{t("round.reveal.gold")}</span>
      </div>
    </div>
  );
}
