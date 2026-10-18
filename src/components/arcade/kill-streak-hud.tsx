import styles from "../queue-arcade.module.css";

import type { deriveRoundView } from "./round-view";

type KillStreakHudProps = Pick<ReturnType<typeof deriveRoundView>, "streakCallout" | "streakBanner">;

export function KillStreakHud({ streakCallout, streakBanner }: KillStreakHudProps) {
  return (
    <>
      {streakCallout === "First Blood" && <div className={styles.firstBloodSplash} aria-hidden="true" />}
      {streakBanner && (
        <div className={styles.killStreakHud} aria-hidden="true">
          <p
            className={streakCallout === "First Blood" ? styles.firstBloodBanner : styles.killStreakBanner}
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
