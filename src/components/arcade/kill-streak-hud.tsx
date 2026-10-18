import own from "./kill-streak-hud.module.css";

import type { deriveRoundView } from "./round-view";

type KillStreakHudProps = Pick<ReturnType<typeof deriveRoundView>, "streakCallout" | "streakBanner">;

export function KillStreakHud({ streakCallout, streakBanner }: KillStreakHudProps) {
  return (
    <>
      {streakCallout === "First Blood" && <div className={own.firstBloodSplash} aria-hidden="true" />}
      {streakBanner && (
        <div className={own.killStreakHud} aria-hidden="true">
          <p
            className={streakCallout === "First Blood" ? own.firstBloodBanner : own.killStreakBanner}
            data-testid="kill-streak-banner"
            data-callout={streakCallout}
          >
            {streakBanner.before}
            <em>{streakBanner.accent}</em>
            {streakBanner.after}
          </p>
        </div>
      )}
    </>
  );
}
