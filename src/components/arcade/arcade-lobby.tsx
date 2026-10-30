import Link from "next/link";
import { Signal } from "lucide-react";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { FRESH_ROUND_MIN_REMAINING_MS } from "@/lib/arcade-entry.mjs";
import { withAudioDebug } from "@/lib/audio-diagnostics.mjs";
import { lobbyRoundAt } from "@/lib/lobby-round.mjs";
import { PARTY_ARCADE_PATH } from "@/lib/arcade-navigation.mjs";
import { SteamAvatar } from "../steam-avatar";
import { SteamSignIn } from "../steam-sign-in";
import styles from "../queue-arcade.module.css";
import own from "./arcade-lobby.module.css";
import { ModeIcon } from "./mode-icon";
import { gameLabel, type LobbyPulse, MODE_INFO, ROUND_GAMES } from "./shared";

import type { useArcadeRoom } from "./use-arcade-room";
import type { deriveRoundView } from "./round-view";

type ArcadeLobbyProps = Pick<
  ReturnType<typeof useArcadeRoom>,
  | "phase"
  | "account"
  | "roomError"
  | "activePlayers"
  | "lobbyPulse"
  | "setPrivateWaiting"
  | "setPartyOpen"
  | "setActivePrivateCode"
  | "setPartyInviteCode"
  | "privateCodeRef"
  | "answerDuration"
  | "startRun"
  | "returnToLobby"
> &
  Pick<ReturnType<typeof deriveRoundView>, "activeModeInfo">;

const seconds = (ms: number) => String(Math.max(0, Math.ceil(ms / 1_000))).padStart(2, "0");

function LiveRoom({
  pulse,
  activePlayers,
  joining,
}: {
  pulse: LobbyPulse | null;
  activePlayers: number;
  joining: boolean;
}) {
  // Before the first tick the card renders the server's own clock, so the server
  // and the client paint the same digits and nothing flickers on load.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  const serverNow = pulse ? (now === null ? pulse.serverNow : now + pulse.serverOffset) : null;
  const round = pulse?.round && serverNow !== null ? lobbyRoundAt(pulse.round, serverNow) : null;
  const game = (round?.game ?? null) as NonNullable<LobbyPulse["round"]>["game"] | null;
  const answerLeft = round && serverNow !== null ? Math.max(0, round.answerDeadline - serverNow) : 0;
  const nextRoundIn = round && serverNow !== null ? Math.max(0, round.revealDeadline - serverNow) : 0;
  const answering = round !== null && answerLeft > 0;
  const joinsThisRound = answering && answerLeft >= FRESH_ROUND_MIN_REMAINING_MS;
  const period = round ? round.answerDuration + Math.max(1, round.revealDeadline - round.answerDeadline) : 1;
  // One number that only counts down: the seconds until the next round starts.
  const clockMs = nextRoundIn;
  const clockSpan = period;

  return (
    <div className={own.liveRoom} data-testid="live-room" data-live={round ? "true" : "false"}>
      <div className={own.liveRoomHeader}>
        <span>
          <i className={own.liveDot} data-live={round ? "true" : "false"} aria-hidden="true" />
          Public room
        </span>
        <span data-testid="live-room-players">
          {activePlayers > 0 ? `${activePlayers.toLocaleString("en-US")} playing now` : "Room open"}
        </span>
      </div>
      <div className={own.liveRoomBody}>
        <span className={own.liveRoomRound}>
          {round ? `Live now · ${answering ? "Answering" : "Reveal"}` : "One room, one clock"}
        </span>
        <strong className={own.liveRoomFormat} data-testid="live-room-format">
          {game ? (
            <>
              <ModeIcon mode={game} />
              {gameLabel(game)}
            </>
          ) : round ? (
            "Next round"
          ) : (
            "Connecting to the room…"
          )}
        </strong>
        <div className={own.liveRoomClock} data-phase={joinsThisRound ? "join" : "next"}>
          <span>Next round in</span>
          <strong data-testid="live-room-clock">{round ? `00:${seconds(clockMs)}` : "--:--"}</strong>
        </div>
        <div className={own.liveRoomTrack} aria-hidden="true">
          <span style={{ transform: `scaleX(${round ? Math.min(1, clockMs / clockSpan) : 0})` }} />
        </div>
        <p className={own.liveRoomJoin}>
          {joining
            ? "Joining the next full round…"
            : joinsThisRound
              ? "Play now and this round is yours."
              : round
                ? "Play now and you start with the next round."
                : "Everyone gets the same question on the same clock."}
        </p>
      </div>
    </div>
  );
}

export function ArcadeLobby({
  phase,
  account,
  roomError,
  activePlayers,
  lobbyPulse,
  setPrivateWaiting,
  setPartyOpen,
  setActivePrivateCode,
  setPartyInviteCode,
  privateCodeRef,
  answerDuration,
  startRun,
  returnToLobby,
  activeModeInfo,
}: ArcadeLobbyProps) {
  return (
    <section className={styles.lobby} id="arcade">
      <div className={own.lobbyCopy}>
        <h1>
          Dota side quests
          <br />
          <em>between matches</em>
        </h1>
        <p className={own.lead}>
          One public room, one {Math.round(answerDuration / 1_000)}-second clock. Everyone gets the same question, the
          room&rsquo;s split goes up at the reveal, and a right answer scores <strong>double</strong> when most of the
          crowd got it wrong.
        </p>

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
                window.history.pushState({ queueArcadeView: "party" }, "", withAudioDebug(PARTY_ARCADE_PATH));
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

        <div className={own.rotation} data-testid="round-mix">
          <span className={own.fieldLabel}>Ten games, one rotation</span>
          <ul className={own.rotationList} aria-label="Round identities">
            {ROUND_GAMES.map((game) => (
              <li key={game} data-round-family={game}>
                <ModeIcon mode={game} />
                {MODE_INFO[game].shortLabel}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <LiveRoom pulse={lobbyPulse} activePlayers={activePlayers} joining={phase === "waiting"} />
    </section>
  );
}
