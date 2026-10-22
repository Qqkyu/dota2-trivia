import { Check, Flame, Gauge, Radio, X } from "lucide-react";
import type { PublicArcadeQuestion } from "@/lib/public-question";
import clsx from "clsx";
import { isPublicKeyedAnswerQuestion } from "@/lib/public-question";
import styles from "../queue-arcade.module.css";
import own from "./session-rail.module.css";
import { KeyedCrowdSplit } from "./crowd-split";
import { ModeIcon } from "./mode-icon";
import { gameLabel } from "./shared";

import type { useArcadeRoom } from "./use-arcade-room";
import type { deriveRoundView } from "./round-view";

type SessionRailProps = { currentQuestion: PublicArcadeQuestion } & Pick<
  ReturnType<typeof useArcadeRoom>,
  "phase" | "currentQuestion" | "roundIndex" | "selectedAnswerKey" | "crowd" | "score" | "streak" | "roomError"
> &
  Pick<ReturnType<typeof deriveRoundView>, "currentGame" | "recentHistory" | "recentHistoryStart">;

export function SessionRail({
  phase,
  currentQuestion,
  roundIndex,
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
      <div className={own.scoreGrid} data-testid="score-grid">
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

      <div className={own.progressCard}>
        <div className={own.cardTitle}>
          <span>Recent rounds</span>
          <div className={own.progressActions}>
            {roomError && (
              <span className={own.roomSyncStatus} title={roomError} role="status">
                Syncing
              </span>
            )}
          </div>
        </div>
        <div className={own.roundPips}>
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
                  isCurrent && own.pipCurrent,
                  record?.correct && own.pipCorrect,
                  record && !record.correct && own.pipWrong,
                  !record && !isCurrent && own.pipEmpty,
                )}
              >
                {record ? record.correct ? <Check /> : <X /> : isCurrent ? <ModeIcon mode={currentGame} /> : "·"}
              </span>
            );
          })}
        </div>
      </div>

      {phase === "reveal" && isPublicKeyedAnswerQuestion(currentQuestion) && crowd.total > 0 && (
        <div className={own.crowdCard} data-testid="crowd-card" data-phase={phase}>
          <div className={own.cardTitle}>
            <span>
              <Radio />
              Room split
            </span>
            <span className={own.livePill}>Final</span>
          </div>
          <strong>
            {crowd.total.toLocaleString("en-US")} {crowd.total === 1 ? "answer" : "answers"}
          </strong>
          <KeyedCrowdSplit question={currentQuestion} crowd={crowd} selectedKey={selectedAnswerKey} />
          {crowd.scoreSummary && (
            <div className={own.crowdScoreSummary} data-testid="crowd-score-summary">
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
