import { Signal } from "lucide-react";
import { useLocale } from "@/i18n/provider";
import { revealCalloutKey } from "@/lib/dota-flavor.mjs";
import { isPublicKeyedAnswerQuestion, publicCorrectIndex } from "@/lib/public-question";
import type { useArcadeRoom } from "./use-arcade-room";
import type { deriveRoundView } from "./round-view";
import own from "./round-feedback.module.css";

type RoundFeedbackProps = Pick<
  ReturnType<typeof useArcadeRoom>,
  "phase" | "currentQuestion" | "crowd" | "roundAward" | "selectedIndex" | "roomError"
> &
  Pick<ReturnType<typeof deriveRoundView>, "resultCallout" | "liveAward">;

/** A reserved line keeps the outcome beside the clock without moving answer targets. */
export function RoundFeedback({
  phase,
  currentQuestion,
  crowd,
  roundAward,
  selectedIndex,
  roomError,
  resultCallout,
  liveAward,
}: RoundFeedbackProps) {
  const { t, number } = useLocale();
  const correctIndex = currentQuestion ? publicCorrectIndex(currentQuestion) : null;
  const rightCount =
    currentQuestion && isPublicKeyedAnswerQuestion(currentQuestion)
      ? (crowd.keyCounts.find((entry) => entry.answerKey === currentQuestion.reveal?.correctAnswerKey)?.count ?? 0)
      : correctIndex === null
        ? 0
        : (crowd.counts[correctIndex] ?? 0);
  const share = crowd.total > 0 ? Math.round((rightCount / crowd.total) * 100) : null;

  return (
    <p
      className={own.feedback}
      data-testid="round-feedback"
      data-error={roomError ? "true" : undefined}
      data-correct={phase === "reveal" && roundAward?.correct ? "true" : undefined}
      role="status"
      aria-live={roomError || phase === "reveal" ? "polite" : "off"}
    >
      {roomError ? (
        <span className={own.connection} data-testid="round-connection-status">
          <Signal aria-hidden="true" />
          {roomError}
        </span>
      ) : phase === "reveal" ? (
        <>
          <span data-testid="round-result-summary">
            {t("round.feedback.result", {
              result: t(revealCalloutKey(resultCallout)),
              points: number(roundAward?.points ?? 0),
            })}
          </span>
          {share !== null && (
            <span className={own.crowd} data-testid="round-crowd-summary">
              {t("round.feedback.crowd", { share })}
            </span>
          )}
        </>
      ) : (
        <span>
          {selectedIndex !== null
            ? t("round.helper.locked")
            : t("round.helper.goldNow", { points: liveAward?.rawPoints ?? 0 })}
        </span>
      )}
    </p>
  );
}
