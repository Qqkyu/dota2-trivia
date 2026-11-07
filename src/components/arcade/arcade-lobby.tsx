import Link from "next/link";
import { Signal } from "lucide-react";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { splitAccent } from "@/i18n/format.mjs";
import { useLocale } from "@/i18n/provider";
import { FRESH_ROUND_MIN_REMAINING_MS } from "@/lib/arcade-entry.mjs";
import { ROUND_GAME_LABEL_KEYS, ROUND_GAME_SHORT_LABEL_KEYS } from "@/lib/arcade-games.mjs";
import { withAudioDebug } from "@/lib/audio-diagnostics.mjs";
import { lobbyRoundAt } from "@/lib/lobby-round.mjs";
import { PARTY_ARCADE_PATH } from "@/lib/arcade-navigation.mjs";
import { LinkStatusLabel } from "../link-status-label";
import { SteamAvatar } from "../steam-avatar";
import { SteamSignIn } from "../steam-sign-in";
import styles from "../queue-arcade.module.css";
import own from "./arcade-lobby.module.css";
import { ModeIcon } from "./mode-icon";
import { type LobbyPulse, ROUND_GAMES } from "./shared";

import type { useArcadeRoom } from "./use-arcade-room";

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
>;

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
  const { t, number } = useLocale();
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
          {t("lobby.live.publicRoom")}
        </span>
        <span data-testid="live-room-players">
          {activePlayers > 0
            ? t("roomStatus.playing", { count: activePlayers, players: number(activePlayers) })
            : t("roomStatus.open")}
        </span>
      </div>
      <div className={own.liveRoomBody}>
        <span className={own.liveRoomRound}>
          {round ? t(answering ? "lobby.live.answering" : "lobby.live.reveal") : t("lobby.live.idle")}
        </span>
        <strong className={own.liveRoomFormat} data-testid="live-room-format">
          {game ? (
            <>
              <ModeIcon mode={game} />
              {t(ROUND_GAME_LABEL_KEYS[game])}
            </>
          ) : round ? (
            t("lobby.live.nextRound")
          ) : (
            t("lobby.live.connecting")
          )}
        </strong>
        <div className={own.liveRoomClock} data-phase={joinsThisRound ? "join" : "next"}>
          <span>{t("lobby.live.nextRoundIn")}</span>
          <strong data-testid="live-room-clock">{round ? `00:${seconds(clockMs)}` : "--:--"}</strong>
        </div>
        <div className={own.liveRoomTrack} aria-hidden="true">
          <span style={{ transform: `scaleX(${round ? Math.min(1, clockMs / clockSpan) : 0})` }} />
        </div>
        <p className={own.liveRoomJoin}>
          {joining
            ? t("lobby.live.joiningNext")
            : joinsThisRound
              ? t("lobby.live.joinThisRound")
              : round
                ? t("lobby.live.joinNextRound")
                : t("lobby.live.sameQuestion")}
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
}: ArcadeLobbyProps) {
  const { t } = useLocale();
  const lead = splitAccent(t("lobby.lead", { seconds: Math.round(answerDuration / 1_000) }));
  return (
    <section className={styles.lobby} id="arcade">
      <div className={own.lobbyCopy}>
        <h1>
          {t("lobby.title")}
          <br />
          <em>{t("lobby.titleAccent")}</em>
        </h1>
        <p className={own.lead}>
          {lead.before}
          <strong>{lead.accent}</strong>
          {lead.after}
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
            {phase === "waiting" ? t("lobby.joining") : t("lobby.play")}
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
            {t("lobby.party")}
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
                  <small>
                    <LinkStatusLabel pending={t("lobby.openingRecords")}>
                      {t("lobby.accuracy", { accuracy: account.profile.stats.accuracy })}
                    </LinkStatusLabel>
                  </small>
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
          <span className={own.fieldLabel}>{t("lobby.rotation")}</span>
          <ul className={own.rotationList} aria-label={t("lobby.rotationList")}>
            {ROUND_GAMES.map((game) => (
              <li key={game} data-round-family={game}>
                <ModeIcon mode={game} />
                {t(ROUND_GAME_SHORT_LABEL_KEYS[game])}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <LiveRoom pulse={lobbyPulse} activePlayers={activePlayers} joining={phase === "waiting"} />
    </section>
  );
}
