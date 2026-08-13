import { FormatLook, type FormatPreview } from "@/components/format-look";
import { RoundMark } from "@/components/round-mark";
import styles from "../app/profile/profile.module.css";

export interface ProfileFormatRow {
  game: string;
  label: string;
  look: string;
  answered: number;
  you: number | null;
  room: number | null;
  early: { correct: number; answered: number } | null;
  slices: Array<{ format: string; label: string; answered: number; accuracy: number }>;
  preview?: FormatPreview | null;
}

function percentLabel(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

export function ProfileRecords({ formats }: { formats: ProfileFormatRow[] }) {
  return (
    <section className={styles.recordGrid} data-testid="profile-records">
      <header className={styles.formatHeader}>
        <span>Format mastery</span>
        <strong>You vs the crowd</strong>
      </header>
      <div className={styles.cardGrid}>
        {formats.map((format) => (
          <article
            key={format.game}
            className={styles.formatCard}
            data-empty={format.you === null ? "true" : "false"}
            data-testid={`format-mastery-${format.game}`}
            data-you={format.you === null ? "" : String(format.you)}
            data-room={format.room === null ? "" : String(format.room)}
            data-early={format.early ? `${format.early.correct}/${format.early.answered}` : ""}
          >
            <div
              className={styles.previewStage}
              aria-hidden="true"
              data-testid={`format-preview-stage-${format.game}`}
            >
              <FormatLook game={format.game} label={format.label} look={format.look} preview={format.preview} />
            </div>
            <div className={styles.cardBody}>
              <div className={styles.identity}>
                <RoundMark game={format.game} />
                <div className={styles.identityCopy}>
                  <strong className={styles.identityLabel}>{format.label}</strong>
                  <small>{format.look}</small>
                </div>
              </div>
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
              {format.slices.length ? (
                <ul className={styles.kinds}>
                  {format.slices.map((slice) => (
                    <li key={slice.format}>
                      <span>{slice.label}</span>
                      <strong>{slice.accuracy}%</strong>
                    </li>
                  ))}
                </ul>
              ) : null}
              {format.early ? (
                <p className={styles.earlyLine}>
                  {format.early.correct} of {format.early.answered} early
                </p>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
