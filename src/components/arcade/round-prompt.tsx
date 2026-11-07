import Image from "next/image";
import type { PublicArcadeQuestion } from "@/lib/public-question";
import {
  ArrowRight,
  AudioWaveform,
  Gauge,
  Gem,
  ListOrdered,
  MessageSquareQuote,
  ScanEye,
  Swords,
  Volume2,
  WandSparkles,
} from "lucide-react";
import clsx from "clsx";
import { ECHO_HUNT_REVEAL_STAGES, SOUNDCHECK_REVEAL_STAGES, soundcheckCutDuration } from "@/lib/soundcheck.mjs";
import { useLocale } from "@/i18n/provider";
import styles from "../queue-arcade.module.css";
import own from "./round-prompt.module.css";
import { elementClipVolume } from "@/lib/round-clip-volume.mjs";
import { QuestionArtwork } from "./artwork";
import { classicQuestionContext, withPlayerId } from "./shared";
import { ShopkeeperTray } from "./shopkeeper-parts";

import type { useArcadeAudio } from "./use-arcade-audio";
import type { useArcadeRoom } from "./use-arcade-room";
import type { usePlayerSettings } from "./use-player-settings";
import type { deriveRoundView } from "./round-view";
import { firstPartyArtSrc } from "@/lib/steam-art.mjs";

type RoundPromptProps = Pick<ReturnType<typeof useArcadeRoom>, "phase" | "activeRoundId"> & {
  currentQuestion: PublicArcadeQuestion;
} & Pick<
    ReturnType<typeof useArcadeAudio>,
    | "roundAudioState"
    | "setRoundAudioState"
    | "roundAudioPlayCount"
    | "roundAudioClipIndex"
    | "roundAudioDurations"
    | "setRoundAudioDurations"
    | "roundAudioRefs"
    | "roundAudioAbortRef"
    | "playRoundAudio"
  > &
  Pick<ReturnType<typeof usePlayerSettings>, "gameVolume"> &
  Pick<
    ReturnType<typeof deriveRoundView>,
    | "currentGame"
    | "isOpenShopRound"
    | "isHeroPickerRound"
    | "isSoundcheckRound"
    | "isEchoHuntRound"
    | "isProgressiveAudioRound"
    | "isSoundSequence"
    | "clueStage"
    | "firstClueAt"
    | "finalClueAt"
    | "spellHint"
    | "aghanimUpgradeLabel"
    | "aghanimItem"
  >;

export function RoundPrompt({
  phase,
  currentQuestion,
  activeRoundId,
  roundAudioState,
  setRoundAudioState,
  roundAudioPlayCount,
  roundAudioClipIndex,
  roundAudioDurations,
  setRoundAudioDurations,
  roundAudioRefs,
  roundAudioAbortRef,
  playRoundAudio,
  gameVolume,
  currentGame,
  isOpenShopRound,
  isHeroPickerRound,
  isSoundcheckRound,
  isEchoHuntRound,
  isProgressiveAudioRound,
  isSoundSequence,
  clueStage,
  firstClueAt,
  finalClueAt,
  spellHint,
  aghanimUpgradeLabel,
  aghanimItem,
}: RoundPromptProps) {
  const { t } = useLocale();
  return currentGame === "flashback" ? (
    <div
      className={clsx(styles.questionBlock, styles.flashbackQuestion)}
      data-testid="round-prompt"
      data-flashback-family={currentQuestion.flashback?.family}
      data-reveal-photo={phase === "reveal" && currentQuestion.reveal?.media?.kind === "photo" ? "true" : "false"}
    >
      <QuestionArtwork
        question={currentQuestion}
        imageOverride={
          phase === "reveal" && currentQuestion.reveal?.media?.kind === "photo"
            ? {
                src: currentQuestion.reveal.media.src,
                alt: currentQuestion.reveal.media.alt,
                kind: "hero",
              }
            : undefined
        }
      />
      <div className={styles.questionCopy}>
        <h2>{currentQuestion.prompt}</h2>
      </div>
    </div>
  ) : currentGame === "order-up" ? (
    <div className={clsx(styles.questionBlock, styles.valueOrderQuestion)} data-testid="round-prompt">
      <div className={styles.valueOrderGlyph} aria-hidden="true">
        <ListOrdered />
      </div>
      <div className={styles.questionCopy}>
        <span>{currentQuestion.eyebrow}</span>
        <h2>{currentQuestion.prompt}</h2>
      </div>
    </div>
  ) : currentGame === "shopkeeper" ? (
    <div
      className={clsx(
        styles.questionBlock,
        styles.shopkeeperQuestion,
        isOpenShopRound && styles.shopkeeperOpenQuestion,
      )}
      data-testid="round-prompt"
      data-shopkeeper-format={currentQuestion.shopkeeper?.format}
    >
      {currentQuestion.shopkeeper?.format === "real-recipe" ? (
        <div className={styles.recipeTarget}>
          <QuestionArtwork question={currentQuestion} />
          <span>{t("round.prompt.targetItem")}</span>
        </div>
      ) : (
        <div className={styles.shopkeeperPromptTray}>
          <ShopkeeperTray items={currentQuestion.shopkeeper?.promptItems ?? []} testId="shopkeeper-prompt-items" />
        </div>
      )}
      <div className={styles.questionCopy}>
        <h2>{currentQuestion.prompt}</h2>
      </div>
    </div>
  ) : currentGame === "spell-link" ? (
    <div
      className={clsx(styles.questionBlock, styles.spellQuestion, styles.heroPickerQuestion)}
      data-testid="round-prompt"
    >
      <div className={styles.spellArtwork}>
        {clueStage >= 3 ? (
          <QuestionArtwork question={currentQuestion} testId="spell-ability-artwork" />
        ) : (
          <div
            className={clsx(styles.artwork, styles.spellLockedArtwork)}
            role="img"
            data-testid="spell-artwork-locked"
            aria-label={t("round.prompt.spell.iconLockedAria", { count: finalClueAt })}
          >
            <div className={styles.artGlow} />
            <WandSparkles />
            <span className={styles.artCorner} />
          </div>
        )}
      </div>
      <div className={styles.questionCopy}>
        <h2>{t("round.prompt.spell.prompt")}</h2>
        <div className={styles.clueList} data-testid="spell-clue-list">
          <div
            className={styles.clueUnlocked}
            data-testid="spell-clue-1"
            data-density={spellHint.length > 320 ? "dense" : "normal"}
          >
            <strong>01</strong>
            <span data-testid="spell-clue-description">{spellHint}</span>
          </div>
          <div className={clueStage >= 2 ? styles.clueUnlocked : styles.clueLocked} data-testid="spell-clue-2">
            <strong>02</strong>
            <span>
              {clueStage >= 2 ? currentQuestion.eyebrow : t("round.prompt.spell.nameUnlocks", { seconds: firstClueAt })}
            </span>
          </div>
          <div className={clueStage >= 3 ? styles.clueUnlocked : styles.clueLocked} data-testid="spell-clue-3">
            <strong>03</strong>
            <span>
              {clueStage >= 3
                ? t("round.prompt.spell.iconRevealed")
                : t("round.prompt.spell.iconUnlocks", { seconds: finalClueAt })}
            </span>
          </div>
        </div>
      </div>
    </div>
  ) : currentGame === "aghanim-lab" ? (
    <div
      className={clsx(styles.questionBlock, styles.aghanimQuestion, styles.heroPickerQuestion)}
      data-testid="round-prompt"
      data-aghanim-stage={clueStage}
    >
      <div className={styles.aghanimArtwork} data-testid="aghanim-artwork">
        {aghanimItem ? (
          <Image
            src={firstPartyArtSrc(aghanimItem.image)}
            alt={aghanimUpgradeLabel ?? t("round.prompt.aghanim.fallbackAlt")}
            fill
            sizes="128px"
            unoptimized
          />
        ) : (
          <Gem aria-hidden="true" />
        )}
      </div>
      <div className={styles.questionCopy}>
        <h2>{currentQuestion.prompt}</h2>
        <div className={clsx(styles.clueList, styles.aghanimClues)}>
          <div className={styles.clueUnlocked} data-testid="aghanim-clue-1">
            <strong>01</strong>
            <span>{currentQuestion.aghanim?.effect}</span>
          </div>
          <div className={clueStage >= 2 ? styles.clueUnlocked : styles.clueLocked} data-testid="aghanim-clue-2">
            <strong>02</strong>
            <span>
              {clueStage >= 2 && aghanimUpgradeLabel
                ? t(
                    currentQuestion.aghanim?.upgradeMode === "new"
                      ? "round.prompt.aghanim.newAbility"
                      : "round.prompt.aghanim.existingAbility",
                    { upgrade: aghanimUpgradeLabel },
                  )
                : t("round.prompt.aghanim.details", { seconds: firstClueAt })}
            </span>
          </div>
          <div className={clueStage >= 3 ? styles.clueUnlocked : styles.clueLocked} data-testid="aghanim-clue-3">
            <strong>03</strong>
            <span>
              {clueStage >= 3
                ? currentQuestion.aghanim?.abilityName
                : t("round.prompt.aghanim.abilityName", { seconds: finalClueAt })}
            </span>
          </div>
        </div>
      </div>
    </div>
  ) : currentGame === "fogged-vision" ? (
    <div
      key={`${activeRoundId}:fog`}
      className={clsx(styles.questionBlock, styles.fogQuestion, styles.heroPickerQuestion)}
      data-testid="round-prompt"
      data-fog-stage={phase === "reveal" ? "reveal" : clueStage}
      data-fog-source={phase === "answering" ? "server" : undefined}
    >
      <div className={styles.fogArtwork}>
        <QuestionArtwork question={currentQuestion} concealIdentity />
        {phase === "reveal" ? null : (
          <span>
            <ScanEye />
            {t("round.prompt.fog.stage", { stage: String(clueStage).padStart(2, "0") })}
            <small>/ 03</small>
          </span>
        )}
      </div>
      <div className={styles.questionCopy}>
        <h2>{t("round.prompt.fog.prompt")}</h2>
      </div>
    </div>
  ) : currentGame === "echo-hunt" || isSoundcheckRound ? (
    <div
      className={clsx(
        styles.questionBlock,
        styles.echoQuestion,
        isHeroPickerRound && styles.heroPickerQuestion,
        isSoundcheckRound && styles.soundcheckQuestion,
      )}
      data-testid="round-prompt"
      data-soundcheck-family={isSoundcheckRound ? currentQuestion.soundcheck?.family : undefined}
      data-soundcheck-scope={isSoundcheckRound ? currentQuestion.soundcheck?.choiceScope : undefined}
      data-soundcheck-format={isSoundcheckRound ? currentQuestion.soundcheck?.format : undefined}
      data-soundcheck-stage={isSoundcheckRound ? clueStage : undefined}
      data-echo-stage={isEchoHuntRound ? clueStage : undefined}
    >
      {(currentQuestion.audio?.clips ?? (currentQuestion.audio?.src ? [currentQuestion.audio.src] : [])).map(
        (audioSource, clipIndex, audioSources) => (
          <audio
            key={`${currentQuestion.id}:${clipIndex}`}
            ref={(audio) => {
              roundAudioRefs.current[clipIndex] = audio;
            }}
            data-testid="round-audio-clip"
            data-clip-index={clipIndex + 1}
            data-gain={currentQuestion.audio?.gains?.[clipIndex] ?? 1}
            data-cut-duration={
              isSoundcheckRound
                ? soundcheckCutDuration(currentQuestion.soundcheck?.clips[clipIndex]?.duration ?? 0, clueStage)
                : isEchoHuntRound
                  ? (roundAudioDurations[audioSource] ?? undefined)
                  : undefined
            }
            src={withPlayerId(audioSource)}
            preload="auto"
            aria-hidden="true"
            onLoadStart={() => setRoundAudioState("loading")}
            onCanPlay={(event) => {
              event.currentTarget.volume = elementClipVolume(gameVolume, event.currentTarget);
              const duration = event.currentTarget.duration;
              if (Number.isFinite(duration) && roundAudioDurations[audioSource] !== duration) {
                setRoundAudioDurations((current) =>
                  current[audioSource] === duration ? current : { ...current, [audioSource]: duration },
                );
              }
              const loaded = roundAudioRefs.current
                .slice(0, audioSources.length)
                .every((audio) => audio && audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
              if (loaded && !roundAudioAbortRef.current) setRoundAudioState("ready");
            }}
            onError={() => setRoundAudioState("error")}
          />
        ),
      )}
      <div
        className={clsx(
          styles.echoPlayer,
          isSoundcheckRound && styles.soundcheckPlayer,
          isSoundSequence && styles.soundcheckSequencePlayer,
        )}
        data-testid={isSoundcheckRound ? "soundcheck-player" : "echo-player"}
        data-voice-state={roundAudioState}
        data-audio-state={roundAudioState}
        role={roundAudioState === "blocked" ? "button" : undefined}
        tabIndex={roundAudioState === "blocked" ? 0 : undefined}
        onClick={() => {
          if (phase === "answering" && roundAudioState === "blocked") {
            playRoundAudio(false, isProgressiveAudioRound ? clueStage : 1);
          }
        }}
        onKeyDown={(event) => {
          if (roundAudioState !== "blocked") return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          playRoundAudio(false, isProgressiveAudioRound ? clueStage : 1);
        }}
        data-play-count={roundAudioPlayCount}
        data-clip-count={currentQuestion.audio?.clips?.length ?? 1}
        data-active-clip={roundAudioClipIndex + 1}
        data-reveal-stage={isProgressiveAudioRound ? clueStage : undefined}
      >
        <div
          className={styles.audioAutoplayIcon}
          data-testid={isSoundcheckRound ? "soundcheck-autoplay" : "echo-autoplay"}
          aria-hidden="true"
        >
          {roundAudioState === "playing" ? <AudioWaveform /> : <Volume2 />}
        </div>
        <div className={styles.audioVisualization} aria-hidden="true">
          <div className={styles.echoWave}>
            {Array.from({ length: 15 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
          {isSoundSequence && (
            <div className={own.soundSequenceSteps}>
              <i data-active={roundAudioState === "playing" && roundAudioClipIndex === 0}>01</i>
              <ArrowRight />
              <i data-active={roundAudioState === "playing" && roundAudioClipIndex === 1}>02</i>
            </div>
          )}
        </div>
        <span>
          {roundAudioState === "blocked"
            ? t("round.prompt.audio.blocked")
            : roundAudioState === "error"
              ? t("round.prompt.audio.unavailable")
              : roundAudioState === "loading"
                ? isSoundcheckRound
                  ? t("round.prompt.audio.loadingCut")
                  : t("round.prompt.audio.loadingVoice")
                : roundAudioState === "playing" && isSoundSequence
                  ? t("round.prompt.audio.soundOf", { index: roundAudioClipIndex + 1 })
                  : t("round.prompt.audio.cutOf", {
                      stage: clueStage,
                      total: isSoundcheckRound ? SOUNDCHECK_REVEAL_STAGES : ECHO_HUNT_REVEAL_STAGES,
                    })}
        </span>
      </div>
      <div className={styles.questionCopy}>
        {isSoundcheckRound && (
          <span>
            {isSoundSequence
              ? t("round.prompt.soundcheck.sequence")
              : currentQuestion.soundcheck?.family === "item"
                ? t("round.prompt.soundcheck.item")
                : t("round.prompt.soundcheck.ability")}
          </span>
        )}
        <h2>{isSoundcheckRound ? currentQuestion.prompt : t("round.prompt.echo.prompt")}</h2>
      </div>
    </div>
  ) : currentGame === "quote-hunt" ? (
    <div
      className={clsx(styles.questionBlock, styles.quoteQuestion, styles.heroPickerQuestion)}
      data-testid="round-prompt"
    >
      <div className={styles.quoteCard} data-testid="hero-quote">
        <MessageSquareQuote />
        <blockquote>{t("round.prompt.quote.text", { quote: currentQuestion.detail ?? "" })}</blockquote>
      </div>
      <div className={styles.questionCopy}>
        <h2>{t("round.prompt.quote.prompt")}</h2>
        <div
          className={styles.quoteHints}
          role="group"
          aria-label={t("round.prompt.quote.cluesAria", { stage: clueStage })}
        >
          {[0, 1].map((index) => {
            const hint = currentQuestion.quoteHints?.[index];
            return (
              <span key={index} data-testid={`quote-hint-${index + 1}`} data-state={hint ? "revealed" : "locked"}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                {hint ?? "?"}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  ) : (
    <div
      className={clsx(styles.questionBlock, !currentQuestion.image && styles.textQuestion)}
      data-testid="round-prompt"
    >
      {currentQuestion.image ? (
        <QuestionArtwork question={currentQuestion} />
      ) : (
        <div className={styles.questionGlyph} aria-hidden="true">
          {currentQuestion.kind === "hero-stat-duel" ||
          currentQuestion.kind === "item-price-duel" ||
          currentQuestion.kind === "hero-move-speed" ? (
            <Gauge />
          ) : (
            <Swords />
          )}
        </div>
      )}
      <div className={styles.questionCopy}>
        {classicQuestionContext(currentQuestion) && <span>{classicQuestionContext(currentQuestion)}</span>}
        <h2>{currentQuestion.prompt}</h2>
        {currentQuestion.detail && <p className={own.questionDetail}>{currentQuestion.detail}</p>}
      </div>
    </div>
  );
}
