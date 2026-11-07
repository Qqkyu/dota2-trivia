import type { FormatPreview } from "@/components/format-look";
import { FormatPreviewCard } from "@/components/format-preview-card";
import { getTranslator } from "@/i18n/server";
import type { MessageKey } from "@/i18n/types";
import { ROUND_GAME_SHORT_LABEL_KEYS } from "@/lib/arcade-games.mjs";
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

export async function ProfileRecords({ formats }: { formats: ProfileFormatRow[] }) {
  const t = await getTranslator();
  return (
    <section className={styles.recordGrid} data-testid="profile-records">
      <div className={styles.cardGrid}>
        {formats.map((format) => (
          <FormatPreviewCard
            key={format.game}
            game={format.game}
            label={t(ROUND_GAME_SHORT_LABEL_KEYS[format.game as keyof typeof ROUND_GAME_SHORT_LABEL_KEYS])}
            look={t(`profile.look.${format.game}` as MessageKey)}
            preview={format.preview}
            data-empty={format.you === null ? "true" : "false"}
            data-testid={`format-mastery-${format.game}`}
            data-you={format.you === null ? "" : String(format.you)}
            data-room={format.room === null ? "" : String(format.room)}
            data-early={format.early ? `${format.early.correct}/${format.early.answered}` : ""}
            data-clues={format.clues.map((clue) => `${clue.correct}/${clue.answered}`).join(",") || ""}
            subtitle={format.answered ? <small>{t("profile.record.played", { count: format.answered })}</small> : null}
          >
            <div className={styles.duel}>
              <div className={styles.duelScores}>
                <span>
                  <small>{t("profile.record.you")}</small>
                  <strong>{percentLabel(format.you)}</strong>
                </span>
                <span>
                  <small>{t("profile.record.crowd")}</small>
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
                    <span>{t(`profile.slice.${slice.format}` as MessageKey)}</span>
                    <strong>{slice.accuracy}%</strong>
                  </li>
                ))}
                {format.clues.map((clue) => (
                  <li key={clue.stage}>
                    <span>{t(`profile.clue.${clue.stage}` as MessageKey)}</span>
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
