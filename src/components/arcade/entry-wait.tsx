import { Signal } from "lucide-react";
import clsx from "clsx";
import { useLocale } from "@/i18n/provider";
import styles from "../queue-arcade.module.css";
import own from "./entry-wait.module.css";
import { EntryWaitLessons } from "./entry-wait-lessons";

import type { useArcadeRoom } from "./use-arcade-room";
import type { deriveRoundView } from "./round-view";

type EntryWaitProps = Pick<ReturnType<typeof useArcadeRoom>, "roomError"> &
  Pick<ReturnType<typeof deriveRoundView>, "entryWaitRemaining">;

export function EntryWait({ roomError, entryWaitRemaining }: EntryWaitProps) {
  const { t } = useLocale();
  return (
    <section
      className={styles.entryWait}
      data-testid="round-entry-wait"
      data-lessons="true"
      aria-label={t("wait.heading")}
    >
      <h1 className="sr-only">{t("wait.heading")}</h1>
      <div className={styles.entryWaitContent}>
        <strong data-testid="entry-wait-timer" aria-hidden={roomError ? true : undefined}>
          {roomError ? "--:--" : `00:${String(Math.ceil(entryWaitRemaining / 1_000)).padStart(2, "0")}`}
        </strong>
        <p className={own.entryWaitHint} data-testid="entry-wait-hint">
          {t(roomError ? "wait.reconnecting" : "wait.hint")}
        </p>
        <div className={own.statusSlot} role="status" aria-live="polite" aria-atomic="true">
          {roomError && (
            <span className={clsx(own.entryWaitStatus, own.entryWaitStatusError)}>
              <Signal aria-hidden="true" />
              {roomError}
            </span>
          )}
        </div>
        <EntryWaitLessons />
      </div>
    </section>
  );
}
