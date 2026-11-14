import type { PublicArcadeQuestion } from "@/lib/public-question";
import { Keyboard, ShoppingBag, Users } from "lucide-react";
import { useLocale } from "@/i18n/provider";
import styles from "../queue-arcade.module.css";
import own from "./answer-helper.module.css";
import { shopkeeperAnswerAction } from "./shared";

import type { useArcadeRoom } from "./use-arcade-room";
import type { deriveRoundView } from "./round-view";

type AnswerHelperProps = { currentQuestion: PublicArcadeQuestion } & Pick<
  ReturnType<typeof useArcadeRoom>,
  "currentQuestion" | "selectedIndex"
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
  >;

export function AnswerHelper({
  currentQuestion,
  selectedIndex,
  currentGame,
  isRecipeBuilderRound,
  isOpenShopRound,
  isHeroPickerRound,
  isValueOrderRound,
  isFlashbackOrderRound,
  isFlashbackYearRound,
  isSoundcheckRound,
  isSoundSequence,
}: AnswerHelperProps) {
  const { t } = useLocale();
  if (isValueOrderRound) return null;
  return (
    <div
      className={styles.answerHelper}
      data-testid="answer-helper"
      data-locked={selectedIndex !== null}
      aria-hidden={selectedIndex !== null}
    >
      <>
        {isOpenShopRound ? <ShoppingBag /> : isHeroPickerRound ? <Users /> : <Keyboard className={own.keyboardHint} />}
        <span
          className={`${own.answerHelperCopy} ${!isOpenShopRound && !isHeroPickerRound && !isFlashbackOrderRound && !isFlashbackYearRound ? own.keyboardHint : ""}`}
        >
          {isOpenShopRound
            ? isRecipeBuilderRound
              ? t(shopkeeperAnswerAction(currentQuestion))
              : isSoundcheckRound
                ? t("round.helper.shopSound")
                : t("round.helper.shopItem")
            : isHeroPickerRound
              ? t("round.helper.hero")
              : isValueOrderRound
                ? t("round.helper.order")
                : isFlashbackOrderRound
                  ? t("round.helper.order")
                  : isFlashbackYearRound
                    ? t("round.helper.flashbackYear")
                    : currentGame === "shopkeeper"
                      ? t("round.helper.withKeys", { action: t(shopkeeperAnswerAction(currentQuestion)) })
                      : currentGame === "spell-link"
                        ? t("round.helper.spell")
                        : currentGame === "fogged-vision"
                          ? t("round.helper.fog")
                          : currentGame === "echo-hunt"
                            ? t("round.helper.echo")
                            : currentGame === "soundcheck"
                              ? isSoundSequence
                                ? t("round.helper.soundOrder")
                                : t("round.helper.sound")
                              : currentGame === "quote-hunt"
                                ? t("round.helper.quote")
                                : t("round.helper.default")}
        </span>
        {!isOpenShopRound && !isHeroPickerRound && !isFlashbackOrderRound && !isFlashbackYearRound && (
          <span className={`${own.answerHelperCopy} ${own.touchHint}`}>
            {currentGame === "shopkeeper" ? t(shopkeeperAnswerAction(currentQuestion)) : t("round.helper.tap")}
          </span>
        )}
      </>
    </div>
  );
}
