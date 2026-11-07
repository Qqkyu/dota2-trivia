import { ArrowRight, Check, ChevronRight, X } from "lucide-react";
import type { PublicArcadeQuestion } from "@/lib/public-question";
import clsx from "clsx";
import { type CSSProperties } from "react";
import { useLocale } from "@/i18n/provider";
import { publicCorrectIndex } from "@/lib/public-question";
import styles from "../queue-arcade.module.css";
import own from "./answer-boards.module.css";
import { AnswerArtwork } from "./artwork";
import { FlashbackOrderBoard, FlashbackYearBoard } from "./flashback-boards";
import { HeroPicker } from "./hero-picker";
import { LETTERS } from "./shared";
import { ShopkeeperTray } from "./shopkeeper-parts";
import { ShopkeeperStore } from "./shopkeeper-store";
import { ValueOrderBoard } from "./value-order-board";

import type { useArcadeAudio } from "./use-arcade-audio";
import type { useArcadeRoom } from "./use-arcade-room";
import type { deriveRoundView } from "./round-view";
import { firstPartyArtSrc } from "@/lib/steam-art.mjs";

type AnswerBoardsProps = { currentQuestion: PublicArcadeQuestion; partyPlay: boolean } & Pick<
  ReturnType<typeof useArcadeRoom>,
  | "phase"
  | "currentQuestion"
  | "selectedIndex"
  | "selectedAnswerKey"
  | "crowd"
  | "activeRoundId"
  | "chooseAnswer"
  | "chooseKeyedAnswer"
  | "roundAward"
> &
  Pick<ReturnType<typeof useArcadeAudio>, "playPickSound"> &
  Pick<
    ReturnType<typeof deriveRoundView>,
    | "currentGame"
    | "resultCallout"
    | "isOpenShopRound"
    | "isHeroPickerRound"
    | "isValueOrderRound"
    | "isFlashbackOrderRound"
    | "isFlashbackYearRound"
  >;

export function AnswerBoards({
  phase,
  currentQuestion,
  selectedIndex,
  selectedAnswerKey,
  crowd,
  partyPlay,
  activeRoundId,
  chooseAnswer,
  chooseKeyedAnswer,
  playPickSound,
  currentGame,
  resultCallout,
  roundAward,
  isOpenShopRound,
  isHeroPickerRound,
  isValueOrderRound,
  isFlashbackOrderRound,
  isFlashbackYearRound,
}: AnswerBoardsProps) {
  const { t } = useLocale();
  return (
    <>
      {isOpenShopRound && (
        <ShopkeeperStore
          key={`${activeRoundId}:${phase}`}
          question={currentQuestion}
          phase={phase}
          selectedKey={selectedAnswerKey}
          crowd={crowd}
          showShares={partyPlay}
          onChoose={chooseKeyedAnswer}
          onPick={playPickSound}
        />
      )}

      {isHeroPickerRound && (
        <HeroPicker
          key={`${activeRoundId}:${phase}`}
          question={currentQuestion}
          phase={phase}
          selectedKey={selectedAnswerKey}
          crowd={crowd}
          showShares={partyPlay}
          onChoose={chooseKeyedAnswer}
          resultCallout={phase === "reveal" ? resultCallout : null}
          roundAward={roundAward}
        />
      )}

      {isValueOrderRound && (
        <ValueOrderBoard
          key={`${activeRoundId}:${phase}`}
          question={currentQuestion}
          phase={phase}
          selectedKey={selectedAnswerKey}
          onChoose={chooseKeyedAnswer}
          onPick={playPickSound}
        />
      )}

      {isFlashbackOrderRound && (
        <FlashbackOrderBoard
          key={`${activeRoundId}:${phase}`}
          question={currentQuestion}
          phase={phase}
          selectedKey={selectedAnswerKey}
          onChoose={chooseKeyedAnswer}
          onPick={playPickSound}
        />
      )}

      {isFlashbackYearRound && (
        <FlashbackYearBoard
          key={`${activeRoundId}:${phase}`}
          question={currentQuestion}
          phase={phase}
          selectedKey={selectedAnswerKey}
          onChoose={chooseKeyedAnswer}
        />
      )}

      {!isOpenShopRound &&
        !isHeroPickerRound &&
        !isValueOrderRound &&
        !isFlashbackOrderRound &&
        !isFlashbackYearRound && (
          <div
            className={clsx(
              styles.answers,
              isFlashbackYearRound && styles.flashbackYears,
              currentGame === "shopkeeper" && own.itemAnswers,
              (currentQuestion.answerImageKind === "hero" || currentGame === "spell-link") && own.heroAnswers,
              currentGame === "fogged-vision" && styles.fogAnswers,
              currentGame === "echo-hunt" && styles.echoAnswers,
              currentGame === "soundcheck" && styles.soundcheckAnswers,
              currentGame === "quote-hunt" && styles.quoteAnswers,
            )}
            role="group"
            aria-label={t("round.answers.aria")}
            data-testid="answer-grid"
            data-split-kind="answer-rows"
            data-total={phase === "reveal" ? crowd.total : undefined}
          >
            {currentQuestion.answers.map((answer, index) => {
              const isSelected = selectedIndex === index;
              const isCorrect = publicCorrectIndex(currentQuestion) === index;
              const percentage = crowd.total ? Math.round((crowd.counts[index] / crowd.total) * 100) : 0;
              const answerImagePair = currentQuestion.answerImagePairs?.[index];
              const shopkeeperAnswerGroup = currentQuestion.shopkeeper?.answerGroups?.[index];
              const answerPairNames = answerImagePair ? answer.split(" → ") : [];
              const resultStyle = {
                "--result-width": `${partyPlay ? percentage : 0}%`,
              } as CSSProperties;

              return (
                <button
                  key={`${currentQuestion.id}:${answer}`}
                  type="button"
                  data-testid="arcade-answer"
                  data-count={phase === "reveal" ? crowd.counts[index] : undefined}
                  data-correct={phase === "reveal" ? String(isCorrect) : undefined}
                  data-selected={phase === "reveal" ? String(isSelected) : undefined}
                  className={clsx(
                    styles.answer,
                    (currentQuestion.answerImages || answerImagePair || shopkeeperAnswerGroup) && styles.visualAnswer,
                    answerImagePair && own.sequenceAnswer,
                    shopkeeperAnswerGroup && styles.shopkeeperRecipeAnswer,
                    phase === "answering" && isSelected && styles.answerLocked,
                    phase === "answering" && selectedIndex !== null && !isSelected && styles.answerMuted,
                    phase === "reveal" && isCorrect && styles.answerCorrect,
                    phase === "reveal" && isSelected && !isCorrect && styles.answerWrong,
                  )}
                  onClick={() => chooseAnswer(index)}
                  disabled={phase !== "answering" || selectedIndex !== null}
                  aria-pressed={isSelected}
                  aria-label={
                    answerImagePair
                      ? `${LETTERS[index]}. ${answer}`
                      : shopkeeperAnswerGroup
                        ? `${LETTERS[index]}. ${shopkeeperAnswerGroup
                            .map((item) =>
                              item.count > 1
                                ? t("round.shop.itemTimes", { name: item.name, count: item.count })
                                : item.name,
                            )
                            .join(", ")}`
                        : undefined
                  }
                  style={resultStyle}
                >
                  {phase === "reveal" && <span className={styles.resultFill} />}
                  <span className={styles.answerKey}>{LETTERS[index]}</span>
                  {shopkeeperAnswerGroup ? (
                    <ShopkeeperTray items={shopkeeperAnswerGroup} compact testId="shopkeeper-recipe-choice" />
                  ) : answerImagePair ? (
                    <span className={own.sequenceAnswerChoice} data-testid="sound-sequence-choice">
                      <AnswerArtwork
                        src={firstPartyArtSrc(answerImagePair[0])}
                        alt={answerPairNames[0] ?? t("round.answers.firstSound")}
                        kind={currentQuestion.answerImageKind ?? "ability"}
                      />
                      <ArrowRight className={own.sequenceAnswerArrow} aria-hidden="true" />
                      <AnswerArtwork
                        src={firstPartyArtSrc(answerImagePair[1])}
                        alt={answerPairNames[1] ?? t("round.answers.secondSound")}
                        kind={currentQuestion.answerImageKind ?? "ability"}
                      />
                    </span>
                  ) : currentQuestion.answerImages?.[index] ? (
                    <AnswerArtwork
                      src={firstPartyArtSrc(currentQuestion.answerImages[index])}
                      alt={answer}
                      kind={
                        currentQuestion.answerImageKind ??
                        (currentGame === "spell-link" || currentGame === "echo-hunt" || currentGame === "quote-hunt"
                          ? "hero"
                          : "item")
                      }
                    />
                  ) : null}
                  {!answerImagePair && !shopkeeperAnswerGroup && (
                    <span className={styles.answerText}>
                      {answer}
                      {isSelected && phase === "answering" && <small>{t("round.answers.yoursLocked")}</small>}
                      {isSelected && phase === "reveal" && <small>{t("round.answers.yours")}</small>}
                    </span>
                  )}
                  {phase === "reveal" ? (
                    <span className={styles.answerResult}>
                      {partyPlay && <strong>{percentage}%</strong>}
                      {isCorrect ? <Check /> : isSelected ? <X /> : null}
                    </span>
                  ) : (
                    <span className={own.answerChevron}>
                      <ChevronRight />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
    </>
  );
}
