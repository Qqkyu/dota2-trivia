import { Check, Flame, Gauge, Radio, Users, X } from "lucide-react";
import { useLocale } from "@/i18n/provider";
import { ROUND_GAME_LABEL_KEYS } from "@/lib/arcade-games.mjs";
import type { PublicArcadeQuestion } from "@/lib/public-question";
import clsx from "clsx";
import { isPublicKeyedAnswerQuestion } from "@/lib/public-question";
import styles from "../queue-arcade.module.css";
import own from "./session-rail.module.css";
import { ChoiceCrowdSplit, KeyedCrowdSplit } from "./crowd-split";
import { ModeIcon } from "./mode-icon";

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
  | "activePlayers"
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
  activePlayers,
  currentGame,
  recentHistory,
  recentHistoryStart,
}: SessionRailProps) {
  const { t, number } = useLocale();
  const answered = number(crowd.total);
  // The same shape for a room of one as for a full room; no "only you" copy.
  const roomLine = t(phase === "answering" ? "session.lockedSoFar" : "session.answeredThisRound", {
    count: crowd.total,
    answers: answered,
  });
  return (
    <div className={styles.sideRail} role="region" aria-label={t("session.region")}>
      <div className={own.scoreGrid} data-testid="score-grid">
        <div>
          <span>{t("session.gold")}</span>
          <strong>{number(score)}</strong>
          <Gauge />
        </div>
        <div>
          <span>{t("session.streak")}</span>
          <strong>{streak}</strong>
          <Flame />
        </div>
      </div>

      <div className={own.roomCard} data-testid="room-card" data-phase={phase}>
        <div className={own.cardTitle}>
          <span>
            <Users />
            {t("session.room")}
          </span>
          <span className={own.livePill}>{t(phase === "answering" ? "session.live" : "session.final")}</span>
        </div>
        <strong data-testid="room-card-players">
          {activePlayers > 0
            ? t("roomStatus.playing", { count: activePlayers, players: number(activePlayers) })
            : t("roomStatus.open")}
        </strong>
        <p data-testid="room-card-answers">{roomLine}</p>
      </div>

      <div className={own.progressCard}>
        <div className={own.cardTitle}>
          <span>{t("session.recentRounds")}</span>
          <div className={own.progressActions}>
            {roomError && (
              <span className={own.roomSyncStatus} title={roomError} role="status">
                {t("session.syncing")}
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
                    ? t("session.roundGame", { number: roundNumber, game: t(ROUND_GAME_LABEL_KEYS[record.game]) })
                    : isCurrent
                      ? t("session.roundGame", { number: roundNumber, game: t(ROUND_GAME_LABEL_KEYS[currentGame]) })
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

      {phase === "reveal" && crowd.total > 0 && (
        <div className={own.crowdCard} data-testid="crowd-card" data-phase={phase}>
          <div className={own.cardTitle}>
            <span>
              <Radio />
              {t("session.roomSplit")}
            </span>
            <span className={own.livePill}>{t("session.final")}</span>
          </div>
          <strong>{t("session.answerTotal", { count: crowd.total, answers: answered })}</strong>
          {isPublicKeyedAnswerQuestion(currentQuestion) ? (
            <KeyedCrowdSplit question={currentQuestion} crowd={crowd} selectedKey={selectedAnswerKey} />
          ) : (
            <ChoiceCrowdSplit question={currentQuestion} crowd={crowd} selectedIndex={selectedIndex} />
          )}
          {crowd.scoreSummary && (
            <div className={own.crowdScoreSummary} data-testid="crowd-score-summary">
              <span>
                <small>{t("session.you")}</small>
                <strong>
                  {crowd.scoreSummary.playerPoints === null ? "—" : `+${crowd.scoreSummary.playerPoints}`}
                </strong>
              </span>
              <span>
                <small>{t("session.correctAverage")}</small>
                <strong>{crowd.scoreSummary.average === null ? "—" : `+${crowd.scoreSummary.average}`}</strong>
              </span>
              <span>
                <small>{t("session.best")}</small>
                <strong>{crowd.scoreSummary.best === null ? "—" : `+${crowd.scoreSummary.best}`}</strong>
              </span>
            </div>
          )}
          {crowd.community && (
            <p className={own.crowdCommunity} data-testid="crowd-community">
              {t("session.communityShare", { share: crowd.community.share })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
