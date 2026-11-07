import type { PublicArcadeQuestion } from "@/lib/public-question";
import { Keyboard, ListOrdered, ShoppingBag, Signal, Users } from "lucide-react";
import { useLocale } from "@/i18n/provider";
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
  const { t } = useLocale();
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
                ? t(shopkeeperAnswerAction(currentQuestion))
                : isSoundcheckRound
                  ? t("round.helper.shopSound")
                  : t("round.helper.shopItem")
              : isHeroPickerRound
                ? t("round.helper.hero")
                : isValueOrderRound
                  ? t("round.helper.order")
                  : isFlashbackOrderRound
                    ? t("round.helper.flashbackOrder")
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
          <span className={own.answerHelperGold}>
            {t("round.helper.goldNow", { points: liveAward?.rawPoints ?? 0 })}
          </span>
        </>
      ) : (
        <>
          <Signal className={own.signalIcon} />
          <span className={own.answerHelperCopy}>
            {t("round.helper.locked", { seconds: Math.ceil(answerTimeLeft / 1000) })}
          </span>
          <span className={own.answerHelperGold}>{t("round.helper.worth", { points: liveAward?.rawPoints ?? 0 })}</span>
        </>
      )}
    </div>
  );
}
