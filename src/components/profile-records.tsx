"use client";

import { useState } from "react";
import clsx from "clsx";
import { RoundMark } from "@/components/round-mark";
import { presentProfileRecent } from "@/lib/profile-records-state.mjs";
import styles from "../app/profile/profile.module.css";

export interface ProfileFormatRow {
  game: string;
  label: string;
  look: string;
  answered: number;
  accuracy: number | null;
  slices: Array<{ format: string; label: string; answered: number; accuracy: number }>;
}

export interface ProfileRecentRow {
  roundId: string;
  game: string;
  label: string;
  correct: boolean;
  detail: string | null;
}

export function ProfileRecords({ formats, recent }: { formats: ProfileFormatRow[]; recent: ProfileRecentRow[] }) {
  const [selectedGame, setSelectedGame] = useState<string | null>(null);

  function toggleGame(game: string) {
    setSelectedGame((current) => (current === game ? null : game));
  }

  const presentedRecent = presentProfileRecent(recent, selectedGame);

  return (
    <section className={styles.recordGrid} data-testid="profile-records">
      <article className={styles.panel}>
        <header className={styles.formatHeader}>
          <span>Format mastery</span>
        </header>
        {formats.map((format) => {
          const selected = selectedGame === format.game;
          const dimmed = Boolean(selectedGame) && !selected;
          return (
            <button
              key={format.game}
              type="button"
              className={clsx(styles.formatRow, selected && styles.formatRowSelected, dimmed && styles.rowDimmed)}
              data-testid={`format-mastery-${format.game}`}
              aria-pressed={selected}
              onClick={() => toggleGame(format.game)}
            >
              <span className={styles.identity}>
                <RoundMark game={format.game} />
                <span className={styles.identityCopy}>
                  <strong className={styles.identityLabel}>{format.label}</strong>
                  <small>{format.look}</small>
                  {format.slices.length > 1 ? (
                    <small className={styles.sliceLine}>
                      {format.slices.map((slice) => `${slice.label} ${slice.accuracy}%`).join(" · ")}
                    </small>
                  ) : null}
                </span>
              </span>
              <span className={styles.accuracyCell}>
                <span className={styles.accuracyTrack} aria-hidden="true">
                  <span
                    className={styles.accuracyFill}
                    style={{ width: `${format.accuracy ?? 0}%` }}
                    data-empty={format.accuracy === null ? "true" : "false"}
                  />
                </span>
                <strong>{format.accuracy === null ? "—" : `${format.accuracy}%`}</strong>
              </span>
            </button>
          );
        })}
      </article>

      <article className={styles.panel} data-testid="recent-answers-panel">
        <header className={styles.recentHeader}>
          <span>Recent answers</span>
        </header>
        {presentedRecent.length ? (
          presentedRecent.map((round) => (
            <div
              className={clsx(
                styles.recentRow,
                round.correct ? styles.recentCorrect : styles.recentWrong,
                round.dimmed && styles.rowDimmed,
                round.highlighted && styles.recentRowSelected,
              )}
              data-testid="recent-answer"
              data-game={round.game}
              data-dimmed={round.dimmed ? "true" : "false"}
              data-highlighted={round.highlighted ? "true" : "false"}
              key={round.roundId}
            >
              <span className={styles.identity}>
                <RoundMark game={round.game} />
                <span className={styles.identityCopy}>
                  <strong className={styles.identityLabel}>{round.label}</strong>
                  {round.detail ? <small>{round.detail}</small> : null}
                </span>
              </span>
              <strong>{round.correct ? "✓" : "×"}</strong>
            </div>
          ))
        ) : (
          <p className={styles.emptyRows}>No connected rounds yet.</p>
        )}
      </article>
    </section>
  );
}
