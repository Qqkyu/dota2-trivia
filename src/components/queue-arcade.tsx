"use client";

import { Check, Clock3 } from "lucide-react";
import clsx from "clsx";
import { REPORT_REASON_LABELS } from "@/lib/calibration";
import { LIVE_ROUND_GAMES } from "@/lib/arcade-games.mjs";
import { PrivateRoomPanel } from "@/components/private-room-panel";
import { LIVE_ROUND_HEADER_LABELS } from "@/lib/round-question-copy.mjs";
import type { FormatPreview } from "@/components/format-look";
import { ARCADE_LOBBY_PATH } from "@/lib/arcade-navigation.mjs";
import { type PublicGameInfo } from "@/lib/game-identity";
import { shouldBlockQuestionClipboard } from "@/lib/question-guard.mjs";
import styles from "./queue-arcade.module.css";
import { ModeIcon } from "./arcade/mode-icon";
import { gameLabel } from "./arcade/shared";

import { useArcadeAudio, useRoundAutoplay } from "./arcade/use-arcade-audio";
import { useArcadeRoom } from "./arcade/use-arcade-room";
import { usePlayerId } from "./arcade/use-player-id";
import { usePlayerSettings } from "./arcade/use-player-settings";
import { useRoundRefs } from "./arcade/use-round-refs";
import { deriveRoundView } from "./arcade/round-view";
import { ArcadeHeader } from "./arcade/arcade-header";
import { ArcadeLobby } from "./arcade/arcade-lobby";
import { EntryWait } from "./arcade/entry-wait";
import { withAudioDebug } from "@/lib/audio-diagnostics.mjs";
import { AudioDiagnosticsPanel } from "./arcade/audio-diagnostics-panel";
import { KillStreakHud } from "./arcade/kill-streak-hud";
import type { LobbyPulsePayload } from "./arcade/shared";
import { RoundPrompt } from "./arcade/round-prompt";
import { AnswerBoards } from "./arcade/answer-boards";
import { AnswerHelper } from "./arcade/answer-helper";
import { RevealPanel } from "./arcade/reveal-panel";
import { SessionRail } from "./arcade/session-rail";
import { ReportCarryover } from "./arcade/report-carryover";
import { ArcadeFooter } from "./arcade/arcade-footer";

export function QueueArcade({
  autoStart = false,
  partyStart = false,
  roomCode,
  gameInfo,
  formatPreviews = {},
  initialPulse = null,
}: {
  autoStart?: boolean;
  partyStart?: boolean;
  roomCode?: string;
  gameInfo: PublicGameInfo;
  formatPreviews?: Record<string, FormatPreview | null | undefined>;
  initialPulse?: LobbyPulsePayload | null;
}) {
  const playerId = usePlayerId();
  const { ensurePlayerId } = playerId;
  const settings = usePlayerSettings({ ensurePlayerId });
  const { soundEnabled, setSoundEnabled, gameVolume, setGameVolume, statsLoaded } = settings;
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
  const room = useArcadeRoom({ autoStart, partyStart, roomCode, refs, playerId, settings, audio, initialPulse });
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
    account,
    roomError,
    voteError,
    activeRoomId,
    activeRoundId,
    roundAnnouncement,
    activePlayers,
    lobbyPulse,
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
    partyNotice,
    endParty,
    dismissPartyNotice,
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

  const view = deriveRoundView(room);
  const {
    answerRemaining,
    revealRemaining,
    entryWaitRemaining,
    timerRatio,
    selectedWasCorrect,
    resultCallout,
    streakCallout,
    isKillStreakCallout,
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
    activeModeInfo,
    aghanimUpgradeLabel,
    aghanimItem,
  } = view;

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
      <div className={styles.backdrop} aria-hidden="true" />

      <ArcadeHeader
        returnToLobby={returnToLobby}
        feedbackPlayerRef={feedbackPlayerRef}
        stopRoundAudio={stopRoundAudio}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        gameVolume={gameVolume}
        setGameVolume={setGameVolume}
        gameInfo={gameInfo}
      />

      {(phase === "lobby" || (phase === "waiting" && entryWaitMode === "silent")) && !partyMode && (
        <ArcadeLobby
          phase={phase}
          account={account}
          roomError={roomError}
          activePlayers={activePlayers}
          lobbyPulse={lobbyPulse}
          setPrivateWaiting={setPrivateWaiting}
          setPartyOpen={setPartyOpen}
          setActivePrivateCode={setActivePrivateCode}
          setPartyInviteCode={setPartyInviteCode}
          privateCodeRef={privateCodeRef}
          answerDuration={answerDuration}
          startRun={startRun}
          returnToLobby={returnToLobby}
          activeModeInfo={activeModeInfo}
        />
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
          onEnded={endParty}
          notice={partyNotice}
          onDismissNotice={dismissPartyNotice}
          onStarted={(code) => {
            dismissPartyNotice();
            privateCodeRef.current = code;
            setActivePrivateCode(code);
            setPartyInviteCode(code);
            setPrivateWaiting(false);
            void startRun(true, code);
          }}
          onClose={() => {
            dismissPartyNotice();
            setPartyOpen(false);
            setPrivateWaiting(false);
            privateCodeRef.current = "";
            setActivePrivateCode("");
            setPartyInviteCode("");
            if (window.location.pathname !== ARCADE_LOBBY_PATH || window.location.search) {
              window.history.pushState({ queueArcadeView: "lobby" }, "", withAudioDebug(ARCADE_LOBBY_PATH));
            }
          }}
        />
      ) : null}

      {phase === "waiting" && entryWaitMode === "lessons" && (
        <EntryWait roomError={roomError} entryWaitRemaining={entryWaitRemaining} />
      )}

      {phase === "reveal" && isKillStreakCallout && (
        <KillStreakHud streakCallout={streakCallout} streakBanner={streakBanner} />
      )}
      <AudioDiagnosticsPanel playSound={audio.playSound} soundEnabled={soundEnabled} gameVolume={gameVolume} />

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
                data-urgent={phase === "answering" && answerRemaining <= 5_000 ? "true" : "false"}
                data-phase={phase}
              >
                <Clock3 />
                <strong data-testid="round-timer">
                  {phase === "answering"
                    ? String(Math.ceil(answerRemaining / 1000)).padStart(2, "0")
                    : String(Math.ceil(revealRemaining / 1000)).padStart(2, "0")}
                </strong>
              </div>
            </div>

            <RoundPrompt
              phase={phase}
              currentQuestion={currentQuestion}
              activeRoundId={activeRoundId}
              roundAudioState={roundAudioState}
              setRoundAudioState={setRoundAudioState}
              roundAudioPlayCount={roundAudioPlayCount}
              roundAudioClipIndex={roundAudioClipIndex}
              roundAudioDurations={roundAudioDurations}
              setRoundAudioDurations={setRoundAudioDurations}
              roundAudioRefs={roundAudioRefs}
              roundAudioAbortRef={roundAudioAbortRef}
              playRoundAudio={playRoundAudio}
              gameVolume={gameVolume}
              currentGame={currentGame}
              isOpenShopRound={isOpenShopRound}
              isHeroPickerRound={isHeroPickerRound}
              isSoundcheckRound={isSoundcheckRound}
              isEchoHuntRound={isEchoHuntRound}
              isProgressiveAudioRound={isProgressiveAudioRound}
              isSoundSequence={isSoundSequence}
              clueStage={clueStage}
              firstClueAt={firstClueAt}
              finalClueAt={finalClueAt}
              spellHint={spellHint}
              aghanimUpgradeLabel={aghanimUpgradeLabel}
              aghanimItem={aghanimItem}
            />

            <AnswerBoards
              phase={phase}
              currentQuestion={currentQuestion}
              selectedIndex={selectedIndex}
              selectedAnswerKey={selectedAnswerKey}
              crowd={crowd}
              roundAward={roundAward}
              resultCallout={resultCallout}
              activeRoundId={activeRoundId}
              chooseAnswer={chooseAnswer}
              chooseKeyedAnswer={chooseKeyedAnswer}
              playPickSound={playPickSound}
              currentGame={currentGame}
              isOpenShopRound={isOpenShopRound}
              isHeroPickerRound={isHeroPickerRound}
              isValueOrderRound={isValueOrderRound}
              isFlashbackOrderRound={isFlashbackOrderRound}
              isFlashbackYearRound={isFlashbackYearRound}
            />

            {phase === "answering" ? (
              <AnswerHelper
                currentQuestion={currentQuestion}
                selectedIndex={selectedIndex}
                answerTimeLeft={answerTimeLeft}
                currentGame={currentGame}
                isRecipeBuilderRound={isRecipeBuilderRound}
                isOpenShopRound={isOpenShopRound}
                isHeroPickerRound={isHeroPickerRound}
                isValueOrderRound={isValueOrderRound}
                isFlashbackOrderRound={isFlashbackOrderRound}
                isFlashbackYearRound={isFlashbackYearRound}
                isSoundcheckRound={isSoundcheckRound}
                isSoundSequence={isSoundSequence}
                liveAward={liveAward}
              />
            ) : (
              <RevealPanel
                currentQuestion={currentQuestion}
                roundAward={roundAward}
                activeRoundId={activeRoundId}
                reportState={reportState}
                reportedReason={reportedReason}
                reportTarget={reportTarget}
                submitQuestionReport={submitQuestionReport}
                toggleQuestionReport={toggleQuestionReport}
                crowd={crowd}
                selectedWasCorrect={selectedWasCorrect}
                resultCallout={resultCallout}
                isValueOrderRound={isValueOrderRound}
              />
            )}
          </div>

          <SessionRail
            phase={phase}
            currentQuestion={currentQuestion}
            roundIndex={roundIndex}
            selectedAnswerKey={selectedAnswerKey}
            crowd={crowd}
            score={score}
            streak={streak}
            roomError={roomError}
            activePlayers={activePlayers}
            currentGame={currentGame}
            recentHistory={recentHistory}
            recentHistoryStart={recentHistoryStart}
          />
        </section>
      )}

      {reportTarget && reportTarget.roundId !== activeRoundId && (
        <ReportCarryover
          reportState={reportState}
          reportTarget={reportTarget}
          submitQuestionReport={submitQuestionReport}
          dismissQuestionReport={dismissQuestionReport}
        />
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
          onEnded={endParty}
        />
      ) : null}

      {reportNotice && (
        <div className={styles.reportNotice} data-testid="report-confirmation" aria-live="polite">
          <Check />
          Report sent · {REPORT_REASON_LABELS[reportNotice.reason]}
        </div>
      )}

      <ArcadeFooter gameInfo={gameInfo} />
    </main>
  );
}
