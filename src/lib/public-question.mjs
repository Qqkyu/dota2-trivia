import {
  FLASHBACK_YEAR_EPOCH,
  flashbackOrderCorrectAnswerKey,
  flashbackYearCorrectAnswerKey,
  flashbackYearMax,
  isFlashbackOrderQuestion,
  isFlashbackYearQuestion,
} from "./flashback.mjs";
import { heroCorrectAnswerKey, isHeroPickerQuestion } from "./hero-picker.mjs";
import {
  isItemPickerQuestion,
  isRealRecipeBuilderQuestion,
  itemPickerCorrectAnswerKey,
  recipeBuilderCorrectAnswerKey,
} from "./item-picker.mjs";
import { clueStageAt } from "./scoring.mjs";
import { echoHuntRevealStage, soundcheckRevealStage } from "./soundcheck.mjs";
import { isValueOrderQuestion, valueOrderCorrectAnswerKey } from "./value-order.mjs";

function copyImage(image, alt) {
  if (!image) return undefined;
  return {
    src: image.src,
    alt: alt ?? image.alt,
    kind: image.kind,
  };
}

function publicRoundImage(round, image, alt, now) {
  if (!image) return undefined;
  if (round.game === "fogged-vision" && round.phase === "answering") {
    const stage = timedClueStage(round, now);
    return {
      src: `/api/round-image?roundId=${encodeURIComponent(round.id)}&stage=${stage}`,
      alt: alt ?? "Hidden hero",
      kind: image.kind,
    };
  }
  return copyImage(image, alt);
}

function copyShopkeeperItems(items) {
  return items?.map((item) => ({
    key: item.key,
    name: item.name,
    image: item.image,
    count: item.count,
  }));
}

function publicRoundAudio(round, audio, now) {
  if (!audio) return undefined;
  const sources = audio.clips ?? (audio.src ? [audio.src] : []);
  if (!sources.length) return undefined;
  const stage = round.phase === "answering" ? `&stage=${timedClueStage(round, now)}` : "";
  const clips = sources.map(
    (_, index) => `/api/round-audio?roundId=${encodeURIComponent(round.id)}&clip=${index}${stage}`,
  );
  return {
    src: clips[0],
    ...(audio.clips ? { clips } : {}),
  };
}

const STAGED_CLUE_GAMES = ["spell-link", "quote-hunt", "aghanim-lab", "fogged-vision", "echo-hunt", "soundcheck"];

function timedClueStage(round, now) {
  if (round.phase === "reveal") return 3;
  const remaining = Math.max(0, round.answerDeadline - now);
  if (round.game === "soundcheck") return soundcheckRevealStage(remaining, round.answerDuration);
  if (round.game === "echo-hunt") return echoHuntRevealStage(remaining, round.answerDuration);
  return clueStageAt(remaining, round.answerDuration);
}

export function publicQuestionRevision(round, now) {
  const state = round.phase === "reveal" ? "reveal" : "answering";
  const clueState = STAGED_CLUE_GAMES.includes(round.game) ? `:clue-${timedClueStage(round, now)}` : "";
  return `${round.id}:${state}${clueState}`;
}

/**
 * Build the only question shape allowed to cross the public-room boundary.
 * This is deliberately an allow-list: new internal catalog fields stay private
 * until they are intentionally added here.
 */
export function publicQuestionForRound(question, round, now) {
  const clueStage = STAGED_CLUE_GAMES.includes(round.game) ? timedClueStage(round, now) : 1;
  const openShopAnswer = isItemPickerQuestion(question);
  const recipeBuilderAnswer = isRealRecipeBuilderQuestion(question);
  const heroPickerAnswer = isHeroPickerQuestion(question);
  const valueOrderAnswer = isValueOrderQuestion(question);
  const flashbackOrderAnswer = isFlashbackOrderQuestion(question);
  const flashbackYearAnswer = isFlashbackYearQuestion(question);
  const keyedAnswer =
    openShopAnswer ||
    recipeBuilderAnswer ||
    heroPickerAnswer ||
    valueOrderAnswer ||
    flashbackOrderAnswer ||
    flashbackYearAnswer;
  const heroAnswerKey = heroPickerAnswer ? heroCorrectAnswerKey(question) : null;
  const itemAnswerKey = openShopAnswer ? itemPickerCorrectAnswerKey(question) : null;
  const recipeAnswerKey = recipeBuilderAnswer ? recipeBuilderCorrectAnswerKey(question) : null;
  const orderAnswerKey = valueOrderAnswer ? valueOrderCorrectAnswerKey(question) : null;
  const flashbackOrderKey = flashbackOrderAnswer ? flashbackOrderCorrectAnswerKey(question) : null;
  const flashbackYearKey = flashbackYearAnswer ? flashbackYearCorrectAnswerKey(question) : null;
  if (openShopAnswer && !itemAnswerKey) {
    throw new Error(`Item picker question ${question.id} has no resolvable shop item.`);
  }
  if (heroPickerAnswer && !heroAnswerKey) {
    throw new Error(`Hero picker question ${question.id} has no resolvable hero artwork.`);
  }
  if (recipeBuilderAnswer && !recipeAnswerKey) {
    throw new Error(`Recipe builder question ${question.id} has no resolvable direct recipe.`);
  }
  if (valueOrderAnswer && !orderAnswerKey) {
    throw new Error(`Ordering question ${question.id} has no resolvable order.`);
  }
  if (flashbackOrderAnswer && !flashbackOrderKey) {
    throw new Error(`Flashback order question ${question.id} has no resolvable order.`);
  }
  if (flashbackYearAnswer && !flashbackYearKey) {
    throw new Error(`Flashback year question ${question.id} has no resolvable year.`);
  }
  const hidePromptArtwork = round.game === "echo-hunt" || round.game === "soundcheck";
  const image =
    hidePromptArtwork || (round.game === "spell-link" && clueStage < 3)
      ? undefined
      : publicRoundImage(
          round,
          question.image,
          round.game === "fogged-vision" && round.phase === "answering" ? "Hidden hero" : undefined,
          now,
        );
  const shopkeeper = question.shopkeeper
    ? {
        format: question.shopkeeper.format,
        promptItems: copyShopkeeperItems(question.shopkeeper.promptItems),
        ...(!recipeBuilderAnswer && question.shopkeeper.answerGroups
          ? { answerGroups: question.shopkeeper.answerGroups.map(copyShopkeeperItems) }
          : {}),
        ...(recipeBuilderAnswer ? { recipeSize: question.shopkeeper.recipeComponentKeys.length } : {}),
      }
    : undefined;
  const soundcheck = question.soundcheck
    ? {
        family: question.soundcheck.family,
        format: question.soundcheck.format,
        choiceScope: question.soundcheck.choiceScope,
        clips: question.soundcheck.clips.map((clip) => ({ duration: clip.duration })),
      }
    : undefined;
  const quoteHints =
    round.game === "quote-hunt" && Array.isArray(question.quoteHints)
      ? question.quoteHints.slice(0, Math.max(0, clueStage - 1))
      : undefined;
  const audio = publicRoundAudio(round, question.audio, now);
  const valueOrder = valueOrderAnswer
    ? {
        family: question.valueOrder.family,
        direction: question.valueOrder.direction,
        cards: question.valueOrder.cards.map(({ key, name, context, image, kind }) => ({
          key,
          name,
          ...(context ? { context } : {}),
          image,
          kind,
        })),
      }
    : undefined;
  const flashback = question.flashback
    ? {
        family: question.flashback.family,
        ...(flashbackYearAnswer
          ? {
              yearMin: FLASHBACK_YEAR_EPOCH,
              yearMax: flashbackYearMax(now),
            }
          : {}),
        ...(flashbackOrderAnswer
          ? {
              cards: question.flashback.cards.map(({ key, name, context, image }) => ({
                key,
                name,
                ...(round.phase === "reveal" && context ? { context } : {}),
                ...(image ? { image } : {}),
              })),
            }
          : {}),
      }
    : undefined;
  const aghanim = question.aghanim
    ? {
        effect: question.aghanim.effect,
        ...(clueStage >= 2
          ? {
              upgradeType: question.aghanim.upgradeType,
              upgradeMode: question.aghanim.upgradeMode,
            }
          : {}),
        ...(clueStage >= 3 ? { abilityName: question.aghanim.abilityName } : {}),
      }
    : undefined;

  return {
    // A synchronized round is the public identity. Catalog IDs often contain
    // the hero, ability, or item name and must never become client tokens.
    id: round.id,
    game: round.game,
    kind: question.kind,
    category: question.category,
    difficulty: question.difficulty,
    eyebrow: round.game === "spell-link" && clueStage < 2 ? "Spell Link" : question.eyebrow,
    prompt: question.prompt,
    ...(image ? { image } : {}),
    answers: keyedAnswer ? ["", "", "", ""] : [...question.answers],
    ...(openShopAnswer
      ? { answerMode: "item-grid" }
      : recipeBuilderAnswer
        ? { answerMode: "item-recipe" }
        : heroPickerAnswer
          ? { answerMode: "hero-grid" }
          : valueOrderAnswer
            ? { answerMode: "value-order" }
            : flashbackOrderAnswer
              ? { answerMode: "flashback-order" }
              : flashbackYearAnswer
                ? { answerMode: "flashback-year" }
                : {}),
    ...(!keyedAnswer && question.answerImages ? { answerImages: [...question.answerImages] } : {}),
    ...(!keyedAnswer && question.answerImagePairs
      ? { answerImagePairs: question.answerImagePairs.map((pair) => [...pair]) }
      : {}),
    ...(!keyedAnswer && question.answerImageKind ? { answerImageKind: question.answerImageKind } : {}),
    ...(question.detail ? { detail: question.detail } : {}),
    ...(question.hint ? { hint: question.hint } : {}),
    ...(quoteHints ? { quoteHints } : {}),
    ...(audio ? { audio } : {}),
    ...(soundcheck ? { soundcheck } : {}),
    ...(shopkeeper ? { shopkeeper } : {}),
    ...(valueOrder ? { valueOrder } : {}),
    ...(aghanim ? { aghanim } : {}),
    ...(flashback ? { flashback } : {}),
    clueStage,
    reveal:
      round.phase === "reveal"
        ? {
            correctIndex: question.correctIndex,
            explanation: question.explanation,
            ...(itemAnswerKey
              ? { correctAnswerKey: itemAnswerKey }
              : recipeAnswerKey
                ? { correctAnswerKey: recipeAnswerKey }
                : heroAnswerKey
                  ? { correctAnswerKey: heroAnswerKey }
                  : orderAnswerKey
                    ? {
                        correctAnswerKey: orderAnswerKey,
                        orderValues: question.valueOrder.values.map(({ key, label }) => ({ key, label })),
                      }
                    : flashbackOrderKey
                      ? {
                          correctAnswerKey: flashbackOrderKey,
                          orderValues: question.flashback.cards.map((card) => ({
                            key: card.key,
                            label: card.context ?? card.name,
                          })),
                        }
                      : flashbackYearKey
                        ? { correctAnswerKey: flashbackYearKey }
                        : {}),
            ...(question.flashback?.revealMedia?.src
              ? {
                  media: {
                    src: question.flashback.revealMedia.src,
                    alt: question.flashback.revealMedia.alt,
                    ...(question.flashback.revealMedia.caption
                      ? { caption: question.flashback.revealMedia.caption }
                      : {}),
                    ...(question.flashback.revealMedia.kind ? { kind: question.flashback.revealMedia.kind } : {}),
                  },
                }
              : {}),
          }
        : null,
  };
}
