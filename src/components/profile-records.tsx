import type { FormatPreview } from "@/components/format-look";
import { FormatPreviewCard } from "@/components/format-preview-card";
import styles from "../app/profile/profile.module.css";

export interface ProfileFormatRow {
  game: string;
  label: string;
  look: string;
  answered: number;
  you: number | null;
  room: number | null;
  early: { correct: number; answered: number } | null;
  clues: Array<{ stage: number; label: string; correct: number; answered: number }>;
  slices: Array<{ format: string; label: string; answered: number; accuracy: number }>;
  preview?: FormatPreview | null;
}

function percentLabel(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

export function ProfileRecords({ formats }: { formats: ProfileFormatRow[] }) {
  return (
    <section className={styles.recordGrid} data-testid="profile-records">
      <div className={styles.cardGrid}>
        {formats.map((format) => (
          <FormatPreviewCard
            key={format.game}
            game={format.game}
            label={format.label}
            look={format.look}
            preview={format.preview}
            data-empty={format.you === null ? "true" : "false"}
            data-testid={`format-mastery-${format.game}`}
            data-you={format.you === null ? "" : String(format.you)}
            data-room={format.room === null ? "" : String(format.room)}
            data-early={format.early ? `${format.early.correct}/${format.early.answered}` : ""}
            data-clues={format.clues.map((clue) => `${clue.correct}/${clue.answered}`).join(",") || ""}
            subtitle={format.answered ? <small>{format.answered} played</small> : null}
          >
            <div className={styles.duel}>
              <div className={styles.duelScores}>
                <span>
                  <small>You</small>
                  <strong>{percentLabel(format.you)}</strong>
                </span>
                <span>
                  <small>Crowd</small>
                  <strong>{percentLabel(format.room)}</strong>
                </span>
              </div>
              <span className={styles.duelTrack} aria-hidden="true">
                <span
                  className={styles.accuracyFill}
                  style={{ width: `${format.you ?? 0}%` }}
                  data-empty={format.you === null ? "true" : "false"}
                />
                {format.room === null ? null : <i className={styles.crowdMark} style={{ left: `${format.room}%` }} />}
              </span>
            </div>
            {format.slices.length || format.clues.length ? (
              <ul className={styles.kinds}>
                {format.slices.map((slice) => (
                  <li key={slice.format}>
                    <span>{slice.label}</span>
                    <strong>{slice.accuracy}%</strong>
                  </li>
                ))}
                {format.clues.map((clue) => (
                  <li key={clue.stage}>
                    <span>{clue.label}</span>
                    <strong>
                      {clue.correct}/{clue.answered}
                    </strong>
                  </li>
                ))}
              </ul>
            ) : null}
          </FormatPreviewCard>
        ))}
      </div>
    </section>
  );
}
