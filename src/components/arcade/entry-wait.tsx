import { Signal } from "lucide-react";
import clsx from "clsx";
import { ENTRY_WAIT_HINT } from "@/lib/entry-wait-tips.mjs";
import styles from "../queue-arcade.module.css";
import own from "./entry-wait.module.css";
import { EntryWaitLessons } from "./entry-wait-lessons";

import type { useArcadeRoom } from "./use-arcade-room";
import type { deriveRoundView } from "./round-view";

type EntryWaitProps = Pick<ReturnType<typeof useArcadeRoom>, "roomError"> &
  Pick<ReturnType<typeof deriveRoundView>, "entryWaitRemaining">;

export function EntryWait({ roomError, entryWaitRemaining }: EntryWaitProps) {
  return (
    <section
      className={styles.entryWait}
      data-testid="round-entry-wait"
      data-lessons="true"
      aria-label="Waiting for the next round"
    >
      <h1 className="sr-only">Waiting for the next round</h1>
      <div className={styles.entryWaitContent}>
        <strong data-testid="entry-wait-timer">
          00:{String(Math.ceil(entryWaitRemaining / 1_000)).padStart(2, "0")}
        </strong>
        <p className={own.entryWaitHint} data-testid="entry-wait-hint">
          {ENTRY_WAIT_HINT}
        </p>
        <EntryWaitLessons />
        {roomError && (
          <span className={clsx(own.entryWaitStatus, own.entryWaitStatusError)} aria-live="polite">
            <Signal />
            {roomError}
          </span>
        )}
      </div>
    </section>
  );
}
