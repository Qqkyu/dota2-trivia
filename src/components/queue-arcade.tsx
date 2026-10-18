"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  AudioWaveform,
  Check,
  ChevronRight,
  Clock3,
  Flag,
  Flame,
  Gauge,
  Gamepad2,
  Gem,
  Keyboard,
  ListOrdered,
  MessageSquareQuote,
  Radio,
  ShoppingBag,
  Signal,
  ScanEye,
  Swords,
  Users,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
} from "lucide-react";
import clsx from "clsx";
import { type CSSProperties } from "react";
import { REPORT_REASON_LABELS, REPORT_REASONS } from "@/lib/calibration";
import { LIVE_ROUND_GAMES, PUBLIC_ARCADE_MODE } from "@/lib/arcade-games.mjs";
import { PrivateRoomPanel } from "@/components/private-room-panel";
import { LIVE_ROUND_HEADER_LABELS } from "@/lib/round-question-copy.mjs";
import type { FormatPreview } from "@/components/format-look";
import { ENTRY_WAIT_HINT } from "@/lib/entry-wait-tips.mjs";
import { ARCADE_LOBBY_PATH, PARTY_ARCADE_PATH } from "@/lib/arcade-navigation.mjs";
import { type PublicGameInfo } from "@/lib/game-identity";
import { revealCallout, streakBannerParts } from "@/lib/dota-flavor.mjs";
import { shouldBlockQuestionClipboard } from "@/lib/question-guard.mjs";
import { FALLBACK_STEAM_DISPLAY_NAME } from "@/lib/steam-profile.mjs";
import { clueStageAt, scoreBreakdown } from "@/lib/scoring.mjs";
import { SHOPKEEPER_CATALOG_BY_KEY } from "@/lib/shopkeeper-catalog";
import {
  isPublicBuildResultQuestion,
  isPublicHeroPickerQuestion,
  isPublicKeyedAnswerQuestion,
  isPublicQuestionAnswerCorrect,
  isPublicRecipeBuilderQuestion,
  isPublicFlashbackOrderQuestion,
  isPublicFlashbackYearQuestion,
  isPublicValueOrderQuestion,
  publicCorrectIndex,
} from "@/lib/public-question";
import {
  ECHO_HUNT_REVEAL_STAGES,
  SOUNDCHECK_REVEAL_STAGES,
  echoHuntRevealStage,
  soundcheckCutDuration,
  soundcheckRevealStage,
} from "@/lib/soundcheck.mjs";
import { SteamAvatar } from "./steam-avatar";
import { SteamSignIn } from "./steam-sign-in";
import styles from "./queue-arcade.module.css";
import { QuestionArtwork, AnswerArtwork } from "./arcade/artwork";
import { ChoiceCrowdSplit, KeyedCrowdSplit } from "./arcade/crowd-split";
import { EntryWaitLessons } from "./arcade/entry-wait-lessons";
import { FlashbackOrderBoard, FlashbackYearBoard } from "./arcade/flashback-boards";
import { HeroPicker } from "./arcade/hero-picker";
import { BrandMark, ModeIcon } from "./arcade/mode-icon";
import {
  accuracy,
  classicQuestionContext,
  gameLabel,
  LETTERS,
  MIN_GAME_VOLUME,
  MODE_INFO,
  PREVIEW_QUESTION,
  REVEAL_DURATION_MS,
  ROUND_GAMES,
  shopkeeperAnswerAction,
  withPlayerId,
} from "./arcade/shared";
import { ShopkeeperTray } from "./arcade/shopkeeper-parts";
import { ShopkeeperStore } from "./arcade/shopkeeper-store";
import { ValueOrderBoard } from "./arcade/value-order-board";

import { useArcadeAudio, useRoundAutoplay } from "./arcade/use-arcade-audio";
import { useArcadeRoom } from "./arcade/use-arcade-room";
import { usePlayerId } from "./arcade/use-player-id";
import { usePlayerSettings } from "./arcade/use-player-settings";
import { useRoundRefs } from "./arcade/use-round-refs";

export function QueueArcade({
  autoStart = false,
  partyStart = false,
  roomCode,
  gameInfo,
  formatPreviews = {},
}: {
  autoStart?: boolean;
  partyStart?: boolean;
  roomCode?: string;
  gameInfo: PublicGameInfo;
  formatPreviews?: Record<string, FormatPreview | null | undefined>;
}) {
  const playerId = usePlayerId();
  const { ensurePlayerId } = playerId;
  const settings = usePlayerSettings({ ensurePlayerId });
  const { soundEnabled, setSoundEnabled, gameVolume, setGameVolume, lifetimeStats, statsLoaded } = settings;
  const refs = useRoundRefs();
  const audio = useArcadeAudio({ refs, soundEnabled, setSoundEnabled, gameVolume });
  const {
    roundAudioState,
    setRoundAudioState,
    roundAudioPlayCount,
    roundAudioClipIndex,
    roundAudioDurations,
    setRoundAudioDurations,
    feedbackPlayerRef,
    roundAudioRefs,
    roundAudioAbortRef,
    playPickSound,
    stopRoundAudio,
    playRoundAudio,
  } = audio;
  const room = useArcadeRoom({ autoStart, partyStart, roomCode, refs, playerId, settings, audio });
  const {
    phase,
    currentQuestion,
    roundIndex,
    selectedIndex,
    selectedAnswerKey,
    answerTimeLeft,
    crowd,
    roundAward,
    score,
    streak,
    correctCount,
    history,
    deadline,
    revealDeadline,
    entryWaitDeadline,
    now,
    account,
    roomError,
    voteError,
    activeRoomId,
    activeRoundId,
    roundAnnouncement,
    activePlayers,
    reportState,
    reportedReason,
    reportTarget,
    reportNotice,
    setPrivateWaiting,
    setPartyOpen,
    activePrivateCode,
    setActivePrivateCode,
    partyInviteCode,
    setPartyInviteCode,
    privateCodeRef,
    partyMode,
    entryWaitMode,
    roundStageRef,
    roundHeadingRef,
    answerDuration,
    startRun,
    returnToLobby,
    chooseAnswer,
    chooseKeyedAnswer,
    handlePartyWaiting,
    ignorePartyStart,
    submitQuestionReport,
    toggleQuestionReport,
    dismissQuestionReport,
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

  const streakBanner = isKillStreakCallout ? streakBannerParts(streakCallout, streakPlayerName) : null;

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

  const activeModeInfo = MODE_INFO[PUBLIC_ARCADE_MODE];

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

  useRoundAutoplay({
    audio,
    phase,
    currentQuestion,
    activeRoundId,
    clueStage,
    isProgressiveAudioRound,
    isSoundcheckRound,
    soundEnabled,
  });

  return (
    <main
      className={styles.shell}
      data-phase={phase}
      data-party={partyMode || activePrivateCode ? "true" : undefined}
      data-party-play={activePrivateCode && phase !== "lobby" ? "true" : undefined}
      data-client-ready={statsLoaded}
      data-account-ready={account !== null}
      data-room-id={activeRoomId || undefined}
      data-round-id={activeRoundId || undefined}
      data-question-kind={currentQuestion?.kind}
    >
      <div className="sr-only" data-testid="round-announcement" aria-live="polite" aria-atomic="true">
        {phase !== "lobby" && phase !== "waiting" && roundAnnouncement?.id === activeRoundId
          ? roundAnnouncement.text
          : ""}
      </div>
      <div className={styles.backdrop} aria-hidden="true">
        <span className={styles.backdropOrbOne} />
        <span className={styles.backdropOrbTwo} />
        <span className={styles.gridTexture} />
      </div>

      <header className={styles.header}>
        <a
          href={ARCADE_LOBBY_PATH}
          className={styles.brand}
          aria-label="Queue Arcade home"
          data-testid="site-home"
          onClick={(event) => {
            event.preventDefault();
            returnToLobby("push");
          }}
        >
          <BrandMark logoUrl={gameInfo.logoUrl} />
          <span>
            <strong>Queue Arcade</strong>
            <small>Side quests, between matches</small>
          </span>
        </a>

        <div className={styles.headerMeta}>
          <span className={styles.patchBadge}>
            {gameInfo.label} · {gameInfo.contentLabel}
          </span>
          <div className={styles.volumeControl} data-muted={!soundEnabled}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => {
                if (soundEnabled) {
                  stopRoundAudio();
                  feedbackPlayerRef.current?.pauseAll();
                }
                setSoundEnabled(!soundEnabled);
              }}
              aria-label={soundEnabled ? "Mute game sounds" : "Enable game sounds"}
              aria-pressed={soundEnabled}
            >
              {soundEnabled ? <Volume2 /> : <VolumeX />}
            </button>
            <input
              className={styles.volumeSlider}
              data-testid="game-volume"
              type="range"
              min={MIN_GAME_VOLUME * 100}
              max="100"
              step="5"
              value={Math.round(gameVolume * 100)}
              onChange={(event) => {
                const nextVolume = Number(event.currentTarget.value) / 100;
                document
                  .querySelectorAll<HTMLAudioElement>('audio[data-testid="round-audio-clip"]')
                  .forEach((audio) => {
                    audio.volume = nextVolume;
                  });
                feedbackPlayerRef.current?.preload();
                feedbackPlayerRef.current?.setVolume(nextVolume);
                setGameVolume(nextVolume);
                setSoundEnabled(true);
              }}
              aria-label="Game volume"
              aria-valuetext={`${Math.round(gameVolume * 100)} percent`}
            />
            <output className={styles.volumeValue}>{Math.round(gameVolume * 100)}%</output>
          </div>
        </div>
      </header>

      {(phase === "lobby" || (phase === "waiting" && entryWaitMode === "silent")) && !partyMode && (
        <section className={styles.lobby} id="arcade">
          <div className={styles.lobbyCopy}>
            <div className={styles.liveLabel}>
              <span />
              {activePlayers > 0
                ? `${activePlayers.toLocaleString("en-US")} playing now · Ten games`
                : "One public room · Ten games"}
            </div>
            <h1>
              Your queue has
              <br />
              <em>side quests.</em>
            </h1>
            <p className={styles.lead}>
              A Dota arcade built for the gap between Find Match and Accept. Everyone plays the same endless rotation;
              the challenge changes every round.
            </p>

            <div className={styles.roundMix} data-testid="round-mix">
              <span className={styles.fieldLabel}>Round mix</span>
              <div className={styles.roundMixRail} role="group" aria-label="Round identities">
                {ROUND_GAMES.map((game) => (
                  <span key={game} data-round-family={game}>
                    <ModeIcon mode={game} />
                    <strong>{MODE_INFO[game].shortLabel}</strong>
                  </span>
                ))}
              </div>
            </div>

            <div className={styles.lobbyActions}>
              <button
                type="button"
                data-testid="start-arcade"
                className={styles.primaryButton}
                onClick={() => {
                  privateCodeRef.current = "";
                  setPartyOpen(false);
                  setPrivateWaiting(false);
                  void startRun(true, "");
                }}
                disabled={phase === "waiting"}
              >
                {phase === "waiting" ? "Joining…" : activeModeInfo.action}
              </button>
              <a
                href={PARTY_ARCADE_PATH}
                className={styles.lobbyFriends}
                data-testid="private-room-open"
                onClick={(event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  returnToLobby("none");
                  privateCodeRef.current = "";
                  setActivePrivateCode("");
                  setPartyInviteCode("");
                  setPrivateWaiting(false);
                  setPartyOpen(true);
                  if (window.location.pathname !== PARTY_ARCADE_PATH) {
                    window.history.pushState({ queueArcadeView: "party" }, "", PARTY_ARCADE_PATH);
                  }
                }}
              >
                Party
              </a>
              <div className={styles.accountActionSlot} data-testid="account-action-slot">
                {account === null ? (
                  <span className={styles.accountLoading} aria-hidden="true" />
                ) : account.authenticated ? (
                  <Link href="/profile" className={styles.profileAction} data-testid="profile-action">
                    <SteamAvatar
                      src={account.profile.user.avatarUrl}
                      name={account.profile.user.displayName}
                      width={34}
                      height={34}
                    />
                    <span>
                      <strong>{account.profile.user.displayName}</strong>
                      <small>{account.profile.stats.accuracy}% accuracy</small>
                    </span>
                  </Link>
                ) : (
                  <SteamSignIn returnTo="/" className={styles.steamSignIn} />
                )}
              </div>
            </div>

            {roomError ? (
              <div className={clsx(styles.roomNotice, styles.roomNoticeError)} role="status">
                <Signal />
                {roomError}
              </div>
            ) : null}

            <div className={styles.featureStrip}>
              <div>
                <strong>{ROUND_GAMES.length}</strong>
                <span>games in the mix</span>
              </div>
              <div>
                <strong>{gameInfo.questionCount}</strong>
                <span>patch-current prompts</span>
              </div>
              <div>
                <strong>2×</strong>
                <span>crowd-breaker bonus</span>
              </div>
              <div>
                <strong>
                  {account?.authenticated
                    ? `${account.profile.stats.accuracy}%`
                    : statsLoaded
                      ? `${accuracy(lifetimeStats.correct, lifetimeStats.answered)}%`
                      : "—"}
                </strong>
                <span>your lifetime accuracy</span>
              </div>
            </div>
          </div>

          <div className={styles.previewColumn}>
            <div className={styles.previewHalo} />
            <div className={styles.previewCard} data-testid="mode-preview">
              <div className={styles.previewHeader}>
                <span>
                  <ModeIcon mode={PUBLIC_ARCADE_MODE} />
                  {activeModeInfo.label}
                </span>
                <strong>00:{String(answerDuration / 1000).padStart(2, "0")}</strong>
              </div>
              <div className={styles.previewQuestion}>
                <QuestionArtwork question={PREVIEW_QUESTION} />
                <span>{activeModeInfo.eyebrow}</span>
                <h2>The next round could be anything.</h2>
                <p>{activeModeInfo.description}</p>
              </div>
              <div className={styles.previewFooter}>
                <Users />
                One synchronized round, deadline, and answer split for everyone
              </div>
            </div>

            <div className={styles.queueToast}>
              <span className={styles.readyIcon}>
                <Gamepad2 />
              </span>
              <span>
                <small>Public room ready</small>
                {activeModeInfo.shortLabel}
              </span>
              <strong>{answerDuration / 1000}s</strong>
            </div>
          </div>
        </section>
      )}

      {(phase === "lobby" || (phase === "waiting" && entryWaitMode === "silent")) && partyMode ? (
        <PrivateRoomPanel
          key={activePrivateCode || "setup"}
          gameOptions={LIVE_ROUND_GAMES.map((game) => ({
            id: game,
            label: LIVE_ROUND_HEADER_LABELS[game as keyof typeof LIVE_ROUND_HEADER_LABELS] ?? game,
            preview: formatPreviews[game] ?? null,
          }))}
          playerId={ensurePlayerId}
          displayName={account?.authenticated ? account.profile.user.displayName : ""}
          initialCode={activePrivateCode || partyInviteCode || undefined}
          playActive={false}
          onWaitingChange={handlePartyWaiting}
          onStarted={(code) => {
            privateCodeRef.current = code;
            setActivePrivateCode(code);
            setPartyInviteCode(code);
            setPrivateWaiting(false);
            void startRun(true, code);
          }}
          onClose={() => {
            setPartyOpen(false);
            setPrivateWaiting(false);
            privateCodeRef.current = "";
            setActivePrivateCode("");
            setPartyInviteCode("");
            if (window.location.pathname !== ARCADE_LOBBY_PATH || window.location.search) {
              window.history.pushState({ queueArcadeView: "lobby" }, "", ARCADE_LOBBY_PATH);
            }
          }}
        />
      ) : null}

      {phase === "waiting" && entryWaitMode === "lessons" && (
        <section
          className={styles.entryWait}
          data-testid="round-entry-wait"
          data-lessons="true"
          aria-label="Waiting for the next round"
        >
          <h1 className="sr-only">Waiting for the next round</h1>
          <div className={styles.entryWaitContent}>
            <strong data-testid="entry-wait-timer">
              00:{String(Math.ceil(entryWaitRemaining / 1_000)).padStart(2, "0")}
            </strong>
            <p className={styles.entryWaitHint} data-testid="entry-wait-hint">
              {ENTRY_WAIT_HINT}
            </p>
            <EntryWaitLessons />
            {roomError && (
              <span className={clsx(styles.entryWaitStatus, styles.entryWaitStatusError)} aria-live="polite">
                <Signal />
                {roomError}
              </span>
            )}
          </div>
        </section>
      )}

      {phase === "reveal" && isKillStreakCallout && (
        <>
          {streakCallout === "First Blood" && <div className={styles.firstBloodSplash} aria-hidden="true" />}
          {streakBanner && (
            <div className={styles.killStreakHud} aria-hidden="true">
              <p
                className={streakCallout === "First Blood" ? styles.firstBloodBanner : styles.killStreakBanner}
                data-testid="kill-streak-banner"
                data-callout={streakCallout}
              >
                {streakBanner.before}
                <em>{streakBanner.accent}</em>
                {streakBanner.after}
              </p>
            </div>
          )}
        </>
      )}

      {(phase === "answering" || phase === "reveal") && currentQuestion && (
        <section
          className={styles.gameLayout}
          data-testid="public-room"
          data-round-game={currentGame}
          data-content-difficulty={currentQuestion.difficulty}
          data-copy-guard={shouldBlockQuestionClipboard(phase) ? "blocked" : "allowed"}
        >
          <h1 className="sr-only" ref={roundHeadingRef} data-testid="round-heading" tabIndex={-1}>
            Round {roundIndex + 1}
          </h1>
          <div
            ref={roundStageRef}
            className={clsx(
              styles.gameStage,
              currentGame === "shopkeeper" && styles.shopkeeperStage,
              currentGame === "spell-link" && styles.spellLinkStage,
              currentGame === "fogged-vision" && styles.foggedStage,
              currentGame === "echo-hunt" && styles.echoStage,
              currentGame === "soundcheck" && styles.soundcheckStage,
              currentGame === "quote-hunt" && styles.quoteStage,
              currentGame === "aghanim-lab" && styles.aghanimStage,
              currentGame === "order-up" && styles.valueOrderStage,
              currentGame === "flashback" && styles.flashbackStage,
            )}
          >
            <div className={styles.timerTrack} aria-hidden="true">
              <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, timerRatio))})` }} />
            </div>

            {voteError ? (
              <p className={styles.voteRetry} data-testid="vote-retry" role="status">
                {voteError}
              </p>
            ) : null}

            <div className={styles.roundHeader}>
              <div>
                <span>Round {String(roundIndex + 1).padStart(3, "0")}</span>
                <i />
                <span className={styles.roundGameLabel}>
                  <ModeIcon mode={currentGame} />
                  {gameLabel(currentGame)}
                </span>
                <i />
                <span>{currentQuestion.category}</span>
              </div>
              <div
                className={styles.timer}
                role="timer"
                aria-live="off"
                aria-label={`${Math.ceil(answerRemaining / 1000)} seconds remaining`}
              >
                <Clock3 />
                <strong data-testid="round-timer">
                  {phase === "answering"
                    ? String(Math.ceil(answerRemaining / 1000)).padStart(2, "0")
                    : String(Math.ceil(revealRemaining / 1000)).padStart(2, "0")}
                </strong>
              </div>
            </div>

            {currentGame === "flashback" ? (
              <div
                className={clsx(styles.questionBlock, styles.flashbackQuestion)}
                data-testid="round-prompt"
                data-flashback-family={currentQuestion.flashback?.family}
                data-reveal-photo={
                  phase === "reveal" && currentQuestion.reveal?.media?.kind === "photo" ? "true" : "false"
                }
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
                    <span>Target item</span>
                  </div>
                ) : (
                  <div className={styles.shopkeeperPromptTray}>
                    <ShopkeeperTray
                      items={currentQuestion.shopkeeper?.promptItems ?? []}
                      testId="shopkeeper-prompt-items"
                    />
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
                      aria-label={`Ability icon unlocks at ${finalClueAt} seconds`}
                    >
                      <div className={styles.artGlow} />
                      <WandSparkles />
                      <span className={styles.artCorner} />
                    </div>
                  )}
                  <span>
                    Clue {clueStage}
                    <small>/ 3</small>
                  </span>
                </div>
                <div className={styles.questionCopy}>
                  <span>Ability identity</span>
                  <h2>Which hero owns this ability?</h2>
                  <div className={styles.clueList} data-testid="spell-clue-list">
                    <div
                      className={styles.clueUnlocked}
                      data-testid="spell-clue-1"
                      data-density={spellHint.length > 320 ? "dense" : "normal"}
                    >
                      <strong>01</strong>
                      <span data-testid="spell-clue-description">{spellHint}</span>
                    </div>
                    <div
                      className={clueStage >= 2 ? styles.clueUnlocked : styles.clueLocked}
                      data-testid="spell-clue-2"
                    >
                      <strong>02</strong>
                      <span>
                        {clueStage >= 2 ? currentQuestion.eyebrow : `Ability name unlocks at ${firstClueAt}s`}
                      </span>
                    </div>
                    <div
                      className={clueStage >= 3 ? styles.clueUnlocked : styles.clueLocked}
                      data-testid="spell-clue-3"
                    >
                      <strong>03</strong>
                      <span>{clueStage >= 3 ? "Ability icon revealed" : `Icon unlocks at ${finalClueAt}s`}</span>
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
                      src={aghanimItem.image}
                      alt={aghanimUpgradeLabel ?? "Aghanim upgrade"}
                      fill
                      sizes="128px"
                      unoptimized
                    />
                  ) : (
                    <Gem aria-hidden="true" />
                  )}
                  <span>
                    Clue {clueStage}
                    <small>/ 3</small>
                  </span>
                </div>
                <div className={styles.questionCopy}>
                  <span>Upgrade effect</span>
                  <h2>{currentQuestion.prompt}</h2>
                  <div className={clsx(styles.clueList, styles.aghanimClues)}>
                    <div className={styles.clueUnlocked} data-testid="aghanim-clue-1">
                      <strong>01</strong>
                      <span>{currentQuestion.aghanim?.effect}</span>
                    </div>
                    <div
                      className={clueStage >= 2 ? styles.clueUnlocked : styles.clueLocked}
                      data-testid="aghanim-clue-2"
                    >
                      <strong>02</strong>
                      <span>
                        {clueStage >= 2 && aghanimUpgradeLabel
                          ? `${aghanimUpgradeLabel} · ${
                              currentQuestion.aghanim?.upgradeMode === "new" ? "New ability" : "Existing ability"
                            }`
                          : "Upgrade details"}
                      </span>
                    </div>
                    <div
                      className={clueStage >= 3 ? styles.clueUnlocked : styles.clueLocked}
                      data-testid="aghanim-clue-3"
                    >
                      <strong>03</strong>
                      <span>{clueStage >= 3 ? currentQuestion.aghanim?.abilityName : "Ability name"}</span>
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
                      Fog {String(clueStage).padStart(2, "0")}
                      <small>/ 03</small>
                    </span>
                  )}
                </div>
                <div className={styles.questionCopy}>
                  <span>Progressive reveal</span>
                  <h2>Which hero is hiding in the fog?</h2>
                  <div className={styles.fogMeter} role="img" aria-label={`Portrait clarity stage ${clueStage} of 3`}>
                    {Array.from({ length: 3 }, (_, index) => (
                      <span key={index} className={index < clueStage ? styles.fogMeterActive : undefined} />
                    ))}
                  </div>
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
                      data-cut-duration={
                        isSoundcheckRound
                          ? soundcheckCutDuration(
                              currentQuestion.soundcheck?.clips[clipIndex]?.duration ?? 0,
                              clueStage,
                            )
                          : isEchoHuntRound
                            ? (roundAudioDurations[audioSource] ?? undefined)
                            : undefined
                      }
                      src={withPlayerId(audioSource)}
                      preload="auto"
                      aria-hidden="true"
                      onLoadStart={() => setRoundAudioState("loading")}
                      onCanPlay={(event) => {
                        event.currentTarget.volume = gameVolume;
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
                      <div className={styles.soundSequenceSteps}>
                        <i data-active={roundAudioState === "playing" && roundAudioClipIndex === 0}>01</i>
                        <ArrowRight />
                        <i data-active={roundAudioState === "playing" && roundAudioClipIndex === 1}>02</i>
                      </div>
                    )}
                  </div>
                  <span>
                    {roundAudioState === "blocked"
                      ? "Click to hear this cut"
                      : roundAudioState === "error"
                        ? "Audio unavailable"
                        : roundAudioState === "loading"
                          ? isSoundcheckRound
                            ? "Loading cut"
                            : "Loading voice cut"
                          : roundAudioState === "playing"
                            ? isSoundSequence
                              ? `Sound ${roundAudioClipIndex + 1} of 2`
                              : `Cut ${clueStage} of ${
                                  isSoundcheckRound ? SOUNDCHECK_REVEAL_STAGES : ECHO_HUNT_REVEAL_STAGES
                                }`
                            : `Cut ${clueStage} of ${
                                isSoundcheckRound ? SOUNDCHECK_REVEAL_STAGES : ECHO_HUNT_REVEAL_STAGES
                              }`}
                  </span>
                </div>
                <div className={styles.questionCopy}>
                  <span>
                    {isSoundcheckRound
                      ? isSoundSequence
                        ? "Ordered pair"
                        : currentQuestion.soundcheck?.family === "item"
                          ? "Item activation"
                          : "Ability sound"
                      : "Hero response"}
                  </span>
                  <h2>{isSoundcheckRound ? currentQuestion.prompt : "Whose voice is this?"}</h2>
                  {isProgressiveAudioRound && (
                    <div
                      className={styles.soundRevealMeter}
                      role="img"
                      aria-label={`${isSoundcheckRound ? "Sound" : "Voice"} cut ${clueStage} of ${
                        isSoundcheckRound ? SOUNDCHECK_REVEAL_STAGES : ECHO_HUNT_REVEAL_STAGES
                      }`}
                    >
                      {Array.from(
                        {
                          length: isSoundcheckRound ? SOUNDCHECK_REVEAL_STAGES : ECHO_HUNT_REVEAL_STAGES,
                        },
                        (_, index) => (
                          <span key={index} className={index < clueStage ? styles.soundRevealMeterActive : undefined} />
                        ),
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : currentGame === "quote-hunt" ? (
              <div
                className={clsx(styles.questionBlock, styles.quoteQuestion, styles.heroPickerQuestion)}
                data-testid="round-prompt"
              >
                <div className={styles.quoteCard} data-testid="hero-quote">
                  <MessageSquareQuote />
                  <blockquote>“{currentQuestion.detail}”</blockquote>
                  <span>Hero response</span>
                </div>
                <div className={styles.questionCopy}>
                  <span>Hero quote</span>
                  <h2>Who said it?</h2>
                  <div className={styles.quoteHints} role="group" aria-label={`Identity clue stage ${clueStage} of 3`}>
                    {[0, 1].map((index) => {
                      const hint = currentQuestion.quoteHints?.[index];
                      return (
                        <span
                          key={index}
                          data-testid={`quote-hint-${index + 1}`}
                          data-state={hint ? "revealed" : "locked"}
                        >
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
                  {currentQuestion.detail && <p className={styles.questionDetail}>{currentQuestion.detail}</p>}
                </div>
              </div>
            )}

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
                          (currentQuestion.answerImages || answerImagePair || shopkeeperAnswerGroup) &&
                            styles.visualAnswer,
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
                              (currentGame === "spell-link" ||
                              currentGame === "echo-hunt" ||
                              currentGame === "quote-hunt"
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

            {phase === "answering" ? (
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
                    <span className={styles.answerHelperCopy}>
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
                    <span className={styles.answerHelperGold}>Correct now: {liveAward?.rawPoints ?? 0} gold</span>
                  </>
                ) : (
                  <>
                    <Signal className={styles.signalIcon} />
                    <span className={styles.answerHelperCopy}>
                      Answer locked with {Math.ceil(answerTimeLeft / 1000)}s left
                    </span>
                    <span className={styles.answerHelperGold}>Worth {liveAward?.rawPoints ?? 0} gold if correct</span>
                  </>
                )}
              </div>
            ) : (
              <div
                className={clsx(styles.revealPanel, selectedWasCorrect ? styles.revealCorrect : styles.revealWrong)}
                data-testid="reveal-panel"
                data-has-media={
                  currentQuestion.reveal?.media && currentQuestion.reveal.media.kind !== "photo" ? "true" : "false"
                }
                data-media-kind={
                  currentQuestion.reveal?.media && currentQuestion.reveal.media.kind !== "photo" ? "mark" : undefined
                }
                aria-live="polite"
              >
                <div className={styles.revealIcon}>{selectedWasCorrect ? <Check /> : <X />}</div>
                {currentQuestion.reveal?.media && currentQuestion.reveal.media.kind !== "photo" && (
                  <figure className={styles.revealMedia} data-kind="mark" data-testid="flashback-reveal-media">
                    <Image
                      src={currentQuestion.reveal.media.src}
                      alt={currentQuestion.reveal.media.alt}
                      width={88}
                      height={88}
                      unoptimized
                    />
                    {currentQuestion.reveal.media.caption ? (
                      <figcaption>{currentQuestion.reveal.media.caption}</figcaption>
                    ) : null}
                  </figure>
                )}
                <div className={styles.revealCopy}>
                  <span data-testid="reveal-callout" data-callout={resultCallout}>
                    {resultCallout}
                  </span>
                  {!isValueOrderRound && <p data-testid="reveal-explanation">{currentQuestion.reveal?.explanation}</p>}
                  <div className={styles.reportControl}>
                    <button
                      type="button"
                      className={styles.reportButton}
                      data-testid="report-question"
                      aria-expanded={reportTarget?.roundId === activeRoundId}
                      onClick={toggleQuestionReport}
                      disabled={reportState === "sending" || reportState === "sent"}
                    >
                      <Flag />
                      {reportedReason
                        ? `Reported · ${REPORT_REASON_LABELS[reportedReason]}`
                        : reportState === "sending"
                          ? "Sending…"
                          : reportState === "error"
                            ? "Try report again"
                            : "Report question"}
                    </button>
                    {reportTarget?.roundId === activeRoundId && !reportedReason && (
                      <div className={styles.reportMenu} role="group" aria-label="Why are you reporting this question?">
                        {REPORT_REASONS.map((reason) => (
                          <button
                            key={reason}
                            type="button"
                            data-testid="report-reason"
                            data-report-reason={reason}
                            onClick={() => void submitQuestionReport(reason)}
                          >
                            {REPORT_REASON_LABELS[reason]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className={styles.pointsAward}>
                  <small>
                    {roundAward?.majorityBonus
                      ? "2× crowd breaker"
                      : roundAward?.correct
                        ? `+${roundAward.speedBonus} speed${roundAward.cluePenalty ? ` · −${roundAward.cluePenalty} hints` : ""}`
                        : "No score"}
                  </small>
                  <strong>+{roundAward?.points ?? 0}</strong>
                  <span>gold</span>
                </div>
              </div>
            )}
          </div>

          <div className={styles.sideRail} role="region" aria-label="Your session">
            <div className={styles.scoreGrid} data-testid="score-grid">
              <div>
                <span>Gold</span>
                <strong>{score.toLocaleString("en-US")}</strong>
                <Gauge />
              </div>
              <div>
                <span>Streak</span>
                <strong>{streak}</strong>
                <Flame />
              </div>
            </div>

            <div className={styles.progressCard}>
              <div className={styles.cardTitle}>
                <span>Recent rounds</span>
                <div className={styles.progressActions}>
                  {roomError && (
                    <span className={styles.roomSyncStatus} title={roomError} role="status">
                      Syncing
                    </span>
                  )}
                  <strong>Round {roundIndex + 1}</strong>
                </div>
              </div>
              <div className={styles.roundPips}>
                {Array.from({ length: 10 }, (_, index) => {
                  const record = recentHistory[index];
                  const isCurrent = phase === "answering" && index === recentHistory.length;
                  const roundNumber = record ? recentHistoryStart + index : roundIndex + 1;

                  return (
                    <span
                      key={`${record?.id ?? "slot"}:${index}`}
                      title={
                        record
                          ? `Round ${roundNumber} · ${gameLabel(record.game)}`
                          : isCurrent
                            ? `Round ${roundNumber} · ${gameLabel(currentGame)}`
                            : undefined
                      }
                      className={clsx(
                        isCurrent && styles.pipCurrent,
                        record?.correct && styles.pipCorrect,
                        record && !record.correct && styles.pipWrong,
                        !record && !isCurrent && styles.pipEmpty,
                      )}
                    >
                      {record ? record.correct ? <Check /> : <X /> : isCurrent ? <ModeIcon mode={currentGame} /> : "·"}
                    </span>
                  );
                })}
              </div>
            </div>

            {phase === "reveal" && (
              <div className={styles.crowdCard} data-testid="crowd-card" data-phase={phase}>
                <div className={styles.cardTitle}>
                  <span>
                    <Radio />
                    Global split
                  </span>
                  <span className={styles.livePill}>Final</span>
                </div>
                <strong>
                  {crowd.total.toLocaleString("en-US")} {crowd.total === 1 ? "answer" : "answers"}
                </strong>
                {crowd.total === 0 && <p>Nobody answered before this room’s deadline.</p>}
                {crowd.total > 0 ? (
                  isPublicKeyedAnswerQuestion(currentQuestion) ? (
                    <KeyedCrowdSplit question={currentQuestion} crowd={crowd} selectedKey={selectedAnswerKey} />
                  ) : (
                    <ChoiceCrowdSplit question={currentQuestion} crowd={crowd} selectedIndex={selectedIndex} />
                  )
                ) : (
                  <div className={styles.crowdSplitEmpty} aria-hidden="true">
                    —
                  </div>
                )}
                {crowd.total > 0 && crowd.scoreSummary && (
                  <div className={styles.crowdScoreSummary} data-testid="crowd-score-summary">
                    <span>
                      <small>You</small>
                      <strong>
                        {crowd.scoreSummary.playerPoints === null ? "—" : `+${crowd.scoreSummary.playerPoints}`}
                      </strong>
                    </span>
                    <span>
                      <small>Correct avg</small>
                      <strong>{crowd.scoreSummary.average === null ? "—" : `+${crowd.scoreSummary.average}`}</strong>
                    </span>
                    <span>
                      <small>Best</small>
                      <strong>{crowd.scoreSummary.best === null ? "—" : `+${crowd.scoreSummary.best}`}</strong>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {reportTarget && reportTarget.roundId !== activeRoundId && (
        <aside className={styles.reportCarryover} data-testid="report-carryover" aria-label="Report previous question">
          <div className={styles.reportCarryoverTitle}>
            <Flag />
            <span>
              <small>Report previous question</small>
              <strong>{reportTarget.prompt}</strong>
              <em>Answer · {reportTarget.answer}</em>
            </span>
            <button type="button" aria-label="Dismiss question report" onClick={dismissQuestionReport}>
              <X />
            </button>
          </div>
          <div className={styles.reportCarryoverReasons} role="group" aria-label="Why are you reporting this question?">
            {REPORT_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                data-testid="report-reason"
                data-report-reason={reason}
                onClick={() => void submitQuestionReport(reason)}
                disabled={reportState === "sending"}
              >
                {reportState === "sending" ? "Sending…" : REPORT_REASON_LABELS[reason]}
              </button>
            ))}
          </div>
          {reportState === "error" && <small className={styles.reportCarryoverError}>Couldn’t send · try again</small>}
        </aside>
      )}

      {activePrivateCode && phase !== "lobby" ? (
        <PrivateRoomPanel
          gameOptions={LIVE_ROUND_GAMES.map((game) => ({
            id: game,
            label: LIVE_ROUND_HEADER_LABELS[game as keyof typeof LIVE_ROUND_HEADER_LABELS] ?? game,
            preview: formatPreviews[game] ?? null,
          }))}
          playerId={ensurePlayerId}
          displayName={account?.authenticated ? account.profile.user.displayName : ""}
          initialCode={activePrivateCode}
          playActive
          onStarted={ignorePartyStart}
          onWaitingChange={handlePartyWaiting}
        />
      ) : null}

      {reportNotice && (
        <div className={styles.reportNotice} data-testid="report-confirmation" aria-live="polite">
          <Check />
          Report sent · {REPORT_REASON_LABELS[reportNotice.reason]}
        </div>
      )}

      <footer className={styles.footer}>
        <span>
          <BrandMark logoUrl={gameInfo.logoUrl} />
          Queue Arcade · Built for the seconds between “Find Match” and “Accept”
        </span>
        <span className={styles.footerMeta}>
          <Link href="/profile">Profile</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/calibration">Calibration lab</Link>
          <span>
            Dota 2 is a trademark of Valve Corporation. Game assets belong to their respective rights holders. This
            project is not affiliated with Valve.
          </span>
        </span>
      </footer>
    </main>
  );
}
