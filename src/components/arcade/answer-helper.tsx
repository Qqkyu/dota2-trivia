import type { PublicArcadeQuestion } from "@/lib/public-question";
import { Keyboard, ListOrdered, ShoppingBag, Signal, Users } from "lucide-react";
import styles from "../queue-arcade.module.css";
import own from "./answer-helper.module.css";
import { shopkeeperAnswerAction } from "./shared";

import type { useArcadeRoom } from "./use-arcade-room";
import type { deriveRoundView } from "./round-view";

type AnswerHelperProps = { currentQuestion: PublicArcadeQuestion } & Pick<
  ReturnType<typeof useArcadeRoom>,
  "currentQuestion" | "selectedIndex" | "answerTimeLeft"
> &
  Pick<
    ReturnType<typeof deriveRoundView>,
    | "currentGame"
    | "isRecipeBuilderRound"
    | "isOpenShopRound"
    | "isHeroPickerRound"
    | "isValueOrderRound"
    | "isFlashbackOrderRound"
    | "isFlashbackYearRound"
    | "isSoundcheckRound"
    | "isSoundSequence"
    | "liveAward"
  >;

export function AnswerHelper({
  currentQuestion,
  selectedIndex,
  answerTimeLeft,
  currentGame,
  isRecipeBuilderRound,
  isOpenShopRound,
  isHeroPickerRound,
  isValueOrderRound,
  isFlashbackOrderRound,
  isFlashbackYearRound,
  isSoundcheckRound,
  isSoundSequence,
  liveAward,
}: AnswerHelperProps) {
  return (
    <div className={styles.answerHelper} data-testid="answer-helper">
      {selectedIndex === null ? (
        <>
          {isOpenShopRound ? (
            <ShoppingBag />
          ) : isHeroPickerRound ? (
            <Users />
          ) : isValueOrderRound ? (
            <ListOrdered />
          ) : (
            <Keyboard />
          )}
          <span className={own.answerHelperCopy}>
            {isOpenShopRound
              ? isRecipeBuilderRound
                ? shopkeeperAnswerAction(currentQuestion)
                : isSoundcheckRound
                  ? "Choose the item that made the sound"
                  : "Choose an item from the shop · Enter picks the only match"
              : isHeroPickerRound
                ? "Choose a hero · type to search · Enter picks the only match"
                : isValueOrderRound
                  ? "Choose four in order"
                  : isFlashbackOrderRound
                    ? "Choose four in order · A–D or 1–4"
                    : isFlashbackYearRound
                      ? "Slide to the year, then press Lock · Enter also locks"
                      : currentGame === "shopkeeper"
                        ? `${shopkeeperAnswerAction(currentQuestion)} · A–D or 1–4`
                        : currentGame === "spell-link"
                          ? "Link the spell to a hero · A–D or 1–4"
                          : currentGame === "fogged-vision"
                            ? "Name the silhouette · A–D or 1–4"
                            : currentGame === "echo-hunt"
                              ? "Match the voice · A–D or 1–4"
                              : currentGame === "soundcheck"
                                ? isSoundSequence
                                  ? "Match the order · A–D or 1–4"
                                  : "Match the sound · A–D or 1–4"
                                : currentGame === "quote-hunt"
                                  ? "Match the line to its hero · A–D or 1–4"
                                  : "Use A–D or 1–4 to answer"}
          </span>
          <span className={own.answerHelperGold}>Correct now: {liveAward?.rawPoints ?? 0} gold</span>
        </>
      ) : (
        <>
          <Signal className={own.signalIcon} />
          <span className={own.answerHelperCopy}>Answer locked with {Math.ceil(answerTimeLeft / 1000)}s left</span>
          <span className={own.answerHelperGold}>Worth {liveAward?.rawPoints ?? 0} gold if correct</span>
        </>
      )}
    </div>
  );
}
