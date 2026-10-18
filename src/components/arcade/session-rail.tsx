import { Check, Flame, Gauge, Radio, X } from "lucide-react";
import type { PublicArcadeQuestion } from "@/lib/public-question";
import clsx from "clsx";
import { isPublicKeyedAnswerQuestion } from "@/lib/public-question";
import styles from "../queue-arcade.module.css";
import { ChoiceCrowdSplit, KeyedCrowdSplit } from "./crowd-split";
import { ModeIcon } from "./mode-icon";
import { gameLabel } from "./shared";

import type { useArcadeRoom } from "./use-arcade-room";
import type { deriveRoundView } from "./round-view";

type SessionRailProps = { currentQuestion: PublicArcadeQuestion } & Pick<
  ReturnType<typeof useArcadeRoom>,
  | "phase"
  | "currentQuestion"
  | "roundIndex"
  | "selectedIndex"
  | "selectedAnswerKey"
  | "crowd"
  | "score"
  | "streak"
  | "roomError"
> &
  Pick<ReturnType<typeof deriveRoundView>, "currentGame" | "recentHistory" | "recentHistoryStart">;

export function SessionRail({
  phase,
  currentQuestion,
  roundIndex,
  selectedIndex,
  selectedAnswerKey,
  crowd,
  score,
  streak,
  roomError,
  currentGame,
  recentHistory,
  recentHistoryStart,
}: SessionRailProps) {
  return (
    <div className={styles.sideRail} role="region" aria-label="Your session">
      <div className={styles.scoreGrid} data-testid="score-grid">
        <div>
          <span>Gold</span>
          <strong>{score.toLocaleString("en-US")}</strong>
          <Gauge />
        </div>
        <div>
          <span>Streak</span>
          <strong>{streak}</strong>
          <Flame />
        </div>
      </div>

      <div className={styles.progressCard}>
        <div className={styles.cardTitle}>
          <span>Recent rounds</span>
          <div className={styles.progressActions}>
            {roomError && (
              <span className={styles.roomSyncStatus} title={roomError} role="status">
                Syncing
              </span>
            )}
            <strong>Round {roundIndex + 1}</strong>
          </div>
        </div>
        <div className={styles.roundPips}>
          {Array.from({ length: 10 }, (_, index) => {
            const record = recentHistory[index];
            const isCurrent = phase === "answering" && index === recentHistory.length;
            const roundNumber = record ? recentHistoryStart + index : roundIndex + 1;

            return (
              <span
                key={`${record?.id ?? "slot"}:${index}`}
                title={
                  record
                    ? `Round ${roundNumber} · ${gameLabel(record.game)}`
                    : isCurrent
                      ? `Round ${roundNumber} · ${gameLabel(currentGame)}`
                      : undefined
                }
                className={clsx(
                  isCurrent && styles.pipCurrent,
                  record?.correct && styles.pipCorrect,
                  record && !record.correct && styles.pipWrong,
                  !record && !isCurrent && styles.pipEmpty,
                )}
              >
                {record ? record.correct ? <Check /> : <X /> : isCurrent ? <ModeIcon mode={currentGame} /> : "·"}
              </span>
            );
          })}
        </div>
      </div>

      {phase === "reveal" && (
        <div className={styles.crowdCard} data-testid="crowd-card" data-phase={phase}>
          <div className={styles.cardTitle}>
            <span>
              <Radio />
              Global split
            </span>
            <span className={styles.livePill}>Final</span>
          </div>
          <strong>
            {crowd.total.toLocaleString("en-US")} {crowd.total === 1 ? "answer" : "answers"}
          </strong>
          {crowd.total === 0 && <p>Nobody answered before this room’s deadline.</p>}
          {crowd.total > 0 ? (
            isPublicKeyedAnswerQuestion(currentQuestion) ? (
              <KeyedCrowdSplit question={currentQuestion} crowd={crowd} selectedKey={selectedAnswerKey} />
            ) : (
              <ChoiceCrowdSplit question={currentQuestion} crowd={crowd} selectedIndex={selectedIndex} />
            )
          ) : (
            <div className={styles.crowdSplitEmpty} aria-hidden="true">
              —
            </div>
          )}
          {crowd.total > 0 && crowd.scoreSummary && (
            <div className={styles.crowdScoreSummary} data-testid="crowd-score-summary">
              <span>
                <small>You</small>
                <strong>
                  {crowd.scoreSummary.playerPoints === null ? "—" : `+${crowd.scoreSummary.playerPoints}`}
                </strong>
              </span>
              <span>
                <small>Correct avg</small>
                <strong>{crowd.scoreSummary.average === null ? "—" : `+${crowd.scoreSummary.average}`}</strong>
              </span>
              <span>
                <small>Best</small>
                <strong>{crowd.scoreSummary.best === null ? "—" : `+${crowd.scoreSummary.best}`}</strong>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
