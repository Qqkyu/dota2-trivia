import { ArrowRight, Check, ChevronRight, X } from "lucide-react";
import type { PublicArcadeQuestion } from "@/lib/public-question";
import clsx from "clsx";
import { type CSSProperties } from "react";
import { publicCorrectIndex } from "@/lib/public-question";
import styles from "../queue-arcade.module.css";
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

type AnswerBoardsProps = { currentQuestion: PublicArcadeQuestion } & Pick<
  ReturnType<typeof useArcadeRoom>,
  | "phase"
  | "currentQuestion"
  | "selectedIndex"
  | "selectedAnswerKey"
  | "crowd"
  | "activeRoundId"
  | "chooseAnswer"
  | "chooseKeyedAnswer"
> &
  Pick<ReturnType<typeof useArcadeAudio>, "playPickSound"> &
  Pick<
    ReturnType<typeof deriveRoundView>,
    | "currentGame"
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
  activeRoundId,
  chooseAnswer,
  chooseKeyedAnswer,
  playPickSound,
  currentGame,
  isOpenShopRound,
  isHeroPickerRound,
  isValueOrderRound,
  isFlashbackOrderRound,
  isFlashbackYearRound,
}: AnswerBoardsProps) {
  return (
    <>
      {isOpenShopRound && (
        <ShopkeeperStore
          key={`${activeRoundId}:${phase}`}
          question={currentQuestion}
          phase={phase}
          selectedKey={selectedAnswerKey}
          crowd={crowd}
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
          onChoose={chooseKeyedAnswer}
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
              currentGame === "shopkeeper" && styles.itemAnswers,
              (currentQuestion.answerImageKind === "hero" || currentGame === "spell-link") && styles.heroAnswers,
              currentGame === "fogged-vision" && styles.fogAnswers,
              currentGame === "echo-hunt" && styles.echoAnswers,
              currentGame === "soundcheck" && styles.soundcheckAnswers,
              currentGame === "quote-hunt" && styles.quoteAnswers,
            )}
            role="group"
            aria-label="Answer choices"
            data-testid="answer-grid"
          >
            {currentQuestion.answers.map((answer, index) => {
              const isSelected = selectedIndex === index;
              const isCorrect = publicCorrectIndex(currentQuestion) === index;
              const percentage = crowd.total ? Math.round((crowd.counts[index] / crowd.total) * 100) : 0;
              const answerImagePair = currentQuestion.answerImagePairs?.[index];
              const shopkeeperAnswerGroup = currentQuestion.shopkeeper?.answerGroups?.[index];
              const answerPairNames = answerImagePair ? answer.split(" → ") : [];
              const resultStyle = {
                "--result-width": `${percentage}%`,
              } as CSSProperties;

              return (
                <button
                  key={`${currentQuestion.id}:${answer}`}
                  type="button"
                  data-testid="arcade-answer"
                  className={clsx(
                    styles.answer,
                    (currentQuestion.answerImages || answerImagePair || shopkeeperAnswerGroup) && styles.visualAnswer,
                    answerImagePair && styles.sequenceAnswer,
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
                            .map((item) => `${item.name}${item.count > 1 ? ` times ${item.count}` : ""}`)
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
                    <span className={styles.sequenceAnswerChoice} data-testid="sound-sequence-choice">
                      <AnswerArtwork
                        src={answerImagePair[0]}
                        alt={answerPairNames[0] ?? "First sound"}
                        kind={currentQuestion.answerImageKind ?? "ability"}
                      />
                      <ArrowRight className={styles.sequenceAnswerArrow} aria-hidden="true" />
                      <AnswerArtwork
                        src={answerImagePair[1]}
                        alt={answerPairNames[1] ?? "Second sound"}
                        kind={currentQuestion.answerImageKind ?? "ability"}
                      />
                    </span>
                  ) : currentQuestion.answerImages?.[index] ? (
                    <AnswerArtwork
                      src={currentQuestion.answerImages[index]}
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
                      {isSelected && phase === "answering" && <small>Your answer · locked</small>}
                      {isSelected && phase === "reveal" && <small>Your answer</small>}
                    </span>
                  )}
                  {phase === "reveal" ? (
                    <span className={styles.answerResult}>
                      <strong>{percentage}%</strong>
                      {isCorrect ? <Check /> : isSelected ? <X /> : null}
                    </span>
                  ) : (
                    <span className={styles.answerChevron}>
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
