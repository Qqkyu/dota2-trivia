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
}

function percentLabel(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

export function ProfileRecords({ formats }: { formats: ProfileFormatRow[] }) {
  return (
    <section className={styles.recordGrid} data-testid="profile-records">
      <article className={styles.panel}>
        <header className={styles.formatHeader}>
          <span>Format mastery</span>
          <strong>You vs the room</strong>
        </header>
        {formats.map((format) => (
          <div
            key={format.game}
            className={styles.formatRow}
            data-testid={`format-mastery-${format.game}`}
            data-you={format.you === null ? "" : String(format.you)}
            data-room={format.room === null ? "" : String(format.room)}
            data-early={format.early ? `${format.early.correct}/${format.early.answered}` : ""}
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
                {format.early ? (
                  <small className={styles.sliceLine}>
                    {format.early.correct}/{format.early.answered} early
                  </small>
                ) : null}
              </span>
            </span>
            <span className={styles.compare}>
              <span className={styles.compareCell}>
                <span>You</span>
                <strong>{percentLabel(format.you)}</strong>
                <span className={styles.accuracyTrack} aria-hidden="true">
                  <span
                    className={styles.accuracyFill}
                    style={{ width: `${format.you ?? 0}%` }}
                    data-empty={format.you === null ? "true" : "false"}
                  />
                </span>
              </span>
              <span className={styles.compareCell}>
                <span>Room</span>
                <strong>{percentLabel(format.room)}</strong>
                <span className={styles.accuracyTrack} aria-hidden="true">
                  <span
                    className={styles.accuracyFill}
                    data-tone="room"
                    style={{ width: `${format.room ?? 0}%` }}
                    data-empty={format.room === null ? "true" : "false"}
                  />
                </span>
              </span>
            </span>
          </div>
        ))}
      </article>
    </section>
  );
}
