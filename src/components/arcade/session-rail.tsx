import { Check, Flame, Gauge, Radio, Shield, Users, X, Zap } from "lucide-react";
import { useLocale } from "@/i18n/provider";
import { ROUND_GAME_LABEL_KEYS } from "@/lib/arcade-games.mjs";
import { canBuyShopItem, SHOP_ITEMS } from "@/lib/gold-shop.mjs";
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
  | "streak"
  | "shop"
  | "buyShopItem"
  | "activeRoundId"
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
  streak,
  shop,
  buyShopItem,
  activeRoundId,
  roomError,
  activePlayers,
  currentGame,
  recentHistory,
  recentHistoryStart,
}: SessionRailProps) {
  const { t, number } = useLocale();
  const answered = number(crowd.total);
  // The same shape for a room of one as for a full room; no "only you" copy.
  // Only while answering: at the reveal the Room split card has the count. The blank line holds the card's height.
  const roomLine =
    phase === "answering" ? t("session.lockedSoFar", { count: crowd.total, answers: answered }) : "\u00a0";
  return (
    <div className={styles.sideRail} role="region" aria-label={t("session.region")}>
      <div className={own.scoreGrid} data-testid="score-grid">
        <div>
          <span>{t("session.gold")}</span>
          <strong>{number(shop.balance)}</strong>
          <Gauge />
        </div>
        <div>
          <span>{t("session.streak")}</span>
          <strong>{streak}</strong>
          <Flame />
        </div>
      </div>

      {/* Always rendered with the same size, so nothing moves between phases. */}
      <div className={own.shop} role="group" aria-label={t("shop.region")} data-testid="gold-shop">
        {(["aegis", "rune"] as const).map((item) => {
          const atReveal = phase === "reveal";
          const outcome =
            item === "aegis"
              ? atReveal && shop.aegisUsedOn === activeRoundId
                ? t("shop.saved")
                : null
              : atReveal && shop.runeSettled?.roundId === activeRoundId
                ? shop.runeSettled.won
                  ? t("shop.won", { gold: number(SHOP_ITEMS.rune.payout) })
                  : t("shop.lost", { gold: number(SHOP_ITEMS.rune.price) })
                : null;
          const active = item === "aegis" ? shop.aegisReady : shop.runeActive;
          const name = t(item === "aegis" ? "shop.aegis" : "shop.rune");
          const hint = t(item === "aegis" ? "shop.aegisHint" : "shop.runeHint");
          return (
            <button
              key={item}
              type="button"
              data-testid={`shop-${item}`}
              data-state={outcome ? "outcome" : active ? "active" : "idle"}
              title={hint}
              aria-label={`${name}. ${hint}`}
              disabled={!activeRoundId || !canBuyShopItem(shop, item)}
              onClick={() => buyShopItem(item, activeRoundId)}
            >
              {item === "aegis" ? <Shield aria-hidden="true" /> : <Zap aria-hidden="true" />}
              <span>{name}</span>
              <small>{outcome ?? (active ? t("shop.active") : number(SHOP_ITEMS[item].price))}</small>
            </button>
          );
        })}
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
