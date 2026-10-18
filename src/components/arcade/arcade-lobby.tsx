import Link from "next/link";
import { Gamepad2, Signal, Users } from "lucide-react";
import clsx from "clsx";
import { PUBLIC_ARCADE_MODE } from "@/lib/arcade-games.mjs";
import { PARTY_ARCADE_PATH } from "@/lib/arcade-navigation.mjs";
import { type PublicGameInfo } from "@/lib/game-identity";
import { SteamAvatar } from "../steam-avatar";
import { SteamSignIn } from "../steam-sign-in";
import styles from "../queue-arcade.module.css";
import own from "./arcade-lobby.module.css";
import { QuestionArtwork } from "./artwork";
import { ModeIcon } from "./mode-icon";
import { accuracy, MODE_INFO, PREVIEW_QUESTION, ROUND_GAMES } from "./shared";

import type { useArcadeRoom } from "./use-arcade-room";
import type { usePlayerSettings } from "./use-player-settings";
import type { deriveRoundView } from "./round-view";

type ArcadeLobbyProps = Pick<
  ReturnType<typeof useArcadeRoom>,
  | "phase"
  | "account"
  | "roomError"
  | "activePlayers"
  | "setPrivateWaiting"
  | "setPartyOpen"
  | "setActivePrivateCode"
  | "setPartyInviteCode"
  | "privateCodeRef"
  | "answerDuration"
  | "startRun"
  | "returnToLobby"
> &
  Pick<ReturnType<typeof usePlayerSettings>, "lifetimeStats" | "statsLoaded"> &
  Pick<ReturnType<typeof deriveRoundView>, "activeModeInfo"> & { gameInfo: PublicGameInfo };

export function ArcadeLobby({
  phase,
  account,
  roomError,
  activePlayers,
  setPrivateWaiting,
  setPartyOpen,
  setActivePrivateCode,
  setPartyInviteCode,
  privateCodeRef,
  answerDuration,
  startRun,
  returnToLobby,
  lifetimeStats,
  statsLoaded,
  activeModeInfo,
  gameInfo,
}: ArcadeLobbyProps) {
  return (
    <section className={styles.lobby} id="arcade">
      <div className={own.lobbyCopy}>
        <div className={own.liveLabel}>
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
        <p className={own.lead}>
          A Dota arcade built for the gap between Find Match and Accept. Everyone plays the same endless rotation; the
          challenge changes every round.
        </p>

        <div className={own.roundMix} data-testid="round-mix">
          <span className={own.fieldLabel}>Round mix</span>
          <div className={own.roundMixRail} role="group" aria-label="Round identities">
            {ROUND_GAMES.map((game) => (
              <span key={game} data-round-family={game}>
                <ModeIcon mode={game} />
                <strong>{MODE_INFO[game].shortLabel}</strong>
              </span>
            ))}
          </div>
        </div>

        <div className={own.lobbyActions}>
          <button
            type="button"
            data-testid="start-arcade"
            className={own.primaryButton}
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
            className={own.lobbyFriends}
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
          <div className={own.accountActionSlot} data-testid="account-action-slot">
            {account === null ? (
              <span className={own.accountLoading} aria-hidden="true" />
            ) : account.authenticated ? (
              <Link href="/profile" className={own.profileAction} data-testid="profile-action">
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
              <SteamSignIn returnTo="/" className={own.steamSignIn} />
            )}
          </div>
        </div>

        {roomError ? (
          <div className={clsx(own.roomNotice, own.roomNoticeError)} role="status">
            <Signal />
            {roomError}
          </div>
        ) : null}

        <div className={own.featureStrip}>
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

      <div className={own.previewColumn}>
        <div className={own.previewHalo} />
        <div className={own.previewCard} data-testid="mode-preview">
          <div className={own.previewHeader}>
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
          <div className={own.previewFooter}>
            <Users />
            One synchronized round, deadline, and answer split for everyone
          </div>
        </div>

        <div className={own.queueToast}>
          <span className={own.readyIcon}>
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
  );
}
