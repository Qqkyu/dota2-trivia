import { useLocale } from "@/i18n/provider";
import { streakBannerParts } from "@/lib/dota-flavor.mjs";
import own from "./kill-streak-hud.module.css";

import type { deriveRoundView } from "./round-view";

type KillStreakHudProps = Pick<ReturnType<typeof deriveRoundView>, "streakCallout" | "streakBanner">;

export function KillStreakHud({ streakCallout, streakBanner }: KillStreakHudProps) {
  const { t } = useLocale();
  const parts = streakBanner ? streakBannerParts(streakBanner.callout, streakBanner.playerName, t) : null;
  return (
    <>
      {streakCallout === "First Blood" && <div className={own.firstBloodSplash} aria-hidden="true" />}
      {parts && (
        <div className={own.killStreakHud} aria-hidden="true">
          <p
            className={streakCallout === "First Blood" ? own.firstBloodBanner : own.killStreakBanner}
            data-testid="kill-streak-banner"
            data-callout={streakCallout}
          >
            {parts.before}
            <em>{parts.accent}</em>
            {parts.after}
          </p>
        </div>
      )}
    </>
  );
}
