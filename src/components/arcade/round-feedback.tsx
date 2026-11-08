import { Signal } from "lucide-react";
import { useLocale } from "@/i18n/provider";
import { revealCalloutKey } from "@/lib/dota-flavor.mjs";
import type { useArcadeRoom } from "./use-arcade-room";
import type { deriveRoundView } from "./round-view";
import own from "./round-feedback.module.css";

type RoundFeedbackProps = Pick<
  ReturnType<typeof useArcadeRoom>,
  "phase" | "roundAward" | "selectedIndex" | "roomError"
> &
  Pick<ReturnType<typeof deriveRoundView>, "resultCallout" | "liveAward">;

/** A reserved line keeps the outcome beside the clock and the header height stable. */
export function RoundFeedback({
  phase,
  roundAward,
  selectedIndex,
  roomError,
  resultCallout,
  liveAward,
}: RoundFeedbackProps) {
  const { t, number } = useLocale();

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
        <span data-testid="round-result-summary">
          {t("round.feedback.result", {
            result: t(revealCalloutKey(resultCallout)),
            points: number(roundAward?.points ?? 0),
          })}
        </span>
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
