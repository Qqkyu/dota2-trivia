import { revealCallout } from "@/lib/dota-flavor.mjs";
import { FALLBACK_STEAM_DISPLAY_NAME } from "@/lib/steam-profile.mjs";
import { clueStageAt, scoreBreakdown } from "@/lib/scoring.mjs";
import { SHOPKEEPER_CATALOG_BY_KEY } from "@/lib/shopkeeper-catalog";
import {
  isPublicBuildResultQuestion,
  isPublicHeroPickerQuestion,
  isPublicQuestionAnswerCorrect,
  isPublicRecipeBuilderQuestion,
  isPublicFlashbackOrderQuestion,
  isPublicFlashbackYearQuestion,
  isPublicValueOrderQuestion,
} from "@/lib/public-question";
import { echoHuntRevealStage, soundcheckRevealStage } from "@/lib/soundcheck.mjs";
import { REVEAL_DURATION_MS } from "./shared";

import type { useArcadeRoom } from "./use-arcade-room";

/** Values the round views derive from room state on every render. */
export function deriveRoundView(room: ReturnType<typeof useArcadeRoom>) {
  const {
    phase,
    currentQuestion,
    selectedIndex,
    selectedAnswerKey,
    answerTimeLeft,
    streak,
    correctCount,
    history,
    deadline,
    revealDeadline,
    entryWaitDeadline,
    now,
    account,
    answerDuration,
  } = room;

  const answerRemaining = deadline ? Math.max(0, deadline - now) : 0;

  const revealRemaining = revealDeadline ? Math.max(0, revealDeadline - now) : 0;

  const entryWaitRemaining = entryWaitDeadline ? Math.max(0, entryWaitDeadline - now) : 0;

  const timerRatio = phase === "answering" ? answerRemaining / answerDuration : revealRemaining / REVEAL_DURATION_MS;

  const selectedWasCorrect =
    selectedIndex !== null && currentQuestion
      ? isPublicQuestionAnswerCorrect(currentQuestion, selectedIndex, selectedAnswerKey ?? undefined)
      : false;

  const resultCallout = revealCallout({
    correct: selectedWasCorrect,
    timedOut: selectedIndex === null,
    firstBlood: false,
    streak: 0,
  });

  const streakCallout = revealCallout({
    correct: selectedWasCorrect,
    timedOut: selectedIndex === null,
    firstBlood: selectedWasCorrect && correctCount === 1,
    streak,
  });

  const isKillStreakCallout =
    streakCallout !== "Correct" && streakCallout !== "Incorrect" && streakCallout !== "Time expired";

  const streakPlayerName =
    account?.authenticated && account.profile.user.displayName !== FALLBACK_STEAM_DISPLAY_NAME
      ? account.profile.user.displayName
      : "";

  const streakBanner = isKillStreakCallout ? { callout: streakCallout, playerName: streakPlayerName } : null;

  const currentGame = currentQuestion?.game ?? "trivia";

  const isRecipeBuilderRound = Boolean(currentQuestion && isPublicRecipeBuilderQuestion(currentQuestion));

  const isOpenShopRound = Boolean(
    currentQuestion && (isPublicBuildResultQuestion(currentQuestion) || isPublicRecipeBuilderQuestion(currentQuestion)),
  );

  const isHeroPickerRound = Boolean(currentQuestion && isPublicHeroPickerQuestion(currentQuestion));

  const isValueOrderRound = Boolean(currentQuestion && isPublicValueOrderQuestion(currentQuestion));

  const isFlashbackOrderRound = Boolean(currentQuestion && isPublicFlashbackOrderQuestion(currentQuestion));

  const isFlashbackYearRound = Boolean(
    currentQuestion && (isPublicFlashbackYearQuestion(currentQuestion) || currentQuestion.flashback?.family === "year"),
  );

  const isSoundcheckRound = currentGame === "soundcheck";

  const isEchoHuntRound = currentGame === "echo-hunt";

  const isProgressiveAudioRound = isSoundcheckRound || isEchoHuntRound;

  const isSoundSequence = isSoundcheckRound && currentQuestion?.soundcheck?.format === "sequence";

  const clueStage =
    phase === "reveal"
      ? 3
      : currentGame === "spell-link" || currentGame === "quote-hunt" || currentGame === "aghanim-lab"
        ? (currentQuestion?.clueStage ?? 1)
        : isSoundcheckRound
          ? soundcheckRevealStage(answerRemaining, answerDuration)
          : isEchoHuntRound
            ? echoHuntRevealStage(answerRemaining, answerDuration)
            : clueStageAt(answerRemaining, answerDuration);

  const firstClueAt = Math.round((answerDuration * 2) / 3_000);

  const finalClueAt = Math.round(answerDuration / 3_000);

  const liveAward = currentQuestion
    ? scoreBreakdown(currentQuestion, selectedIndex === null ? answerRemaining : answerTimeLeft, answerDuration)
    : null;

  const recentHistory = history.slice(phase === "answering" ? -9 : -10);

  const recentHistoryStart = history.length - recentHistory.length + 1;

  const spellHint = currentQuestion?.hint ?? "";

  const aghanimUpgradeLabel =
    currentQuestion?.aghanim?.upgradeType === "scepter"
      ? "Aghanim's Scepter"
      : currentQuestion?.aghanim?.upgradeType === "shard"
        ? "Aghanim's Shard"
        : null;

  const aghanimItem = aghanimUpgradeLabel
    ? SHOPKEEPER_CATALOG_BY_KEY.get(
        currentQuestion?.aghanim?.upgradeType === "scepter" ? "ultimate_scepter" : "aghanims_shard",
      )
    : null;

  return {
    answerRemaining,
    revealRemaining,
    entryWaitRemaining,
    timerRatio,
    selectedWasCorrect,
    resultCallout,
    streakCallout,
    isKillStreakCallout,
    streakPlayerName,
    streakBanner,
    currentGame,
    isRecipeBuilderRound,
    isOpenShopRound,
    isHeroPickerRound,
    isValueOrderRound,
    isFlashbackOrderRound,
    isFlashbackYearRound,
    isSoundcheckRound,
    isEchoHuntRound,
    isProgressiveAudioRound,
    isSoundSequence,
    clueStage,
    firstClueAt,
    finalClueAt,
    liveAward,
    recentHistory,
    recentHistoryStart,
    spellHint,
    aghanimUpgradeLabel,
    aghanimItem,
  };
}
