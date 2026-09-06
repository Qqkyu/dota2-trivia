"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, MessageSquare, Pencil, Users } from "lucide-react";
import clsx from "clsx";
import type { FormatPreview } from "@/components/format-look";
import { FormatPreviewCard, formatPreviewCardStyles } from "@/components/format-preview-card";
import {
  PRIVATE_ROOM_CODE_ALPHABET,
  PRIVATE_ROOM_CODE_MAX,
  PRIVATE_ROOM_NAME_MAX,
  PRIVATE_ROOM_NAME_NOTICE_MS,
  PRIVATE_ROOM_POLL_MS,
  partyCodeError,
  partyLobbyRoster,
  partyNameInputValue,
  partyNameSeed,
  partyPlayerTag,
  rankPartyPlayers,
  storedPartyNameDraft,
} from "@/lib/private-rooms.mjs";
import styles from "./private-room-panel.module.css";

export interface PrivateChatMessage {
  id: string;
  name: string;
  text: string;
  at: number;
}

export interface PrivateRoomPlayer {
  name: string;
  host: boolean;
  self: boolean;
  score: number;
  /** Nobody has heard from this tab for a while; seat and score are kept. */
  away: boolean;
}

export interface PrivateRoomView {
  code: string;
  games: string[];
  formats: string[];
  startedAt: number | null;
  isHost: boolean;
  players: PrivateRoomPlayer[];
  messages: PrivateChatMessage[];
  waiting: boolean;
  countdownMs: number;
  activePlayers: number;
  nameTaken: boolean;
}

export interface PartyGameOption {
  id: string;
  label: string;
  preview?: FormatPreview | null;
}

type PartyScreen = "setup" | "wait";

interface PrivateRoomPayload {
  waiting?: boolean;
  countdownMs?: number;
  nameTaken?: boolean;
  privateRoom?: {
    code: string;
    games: string[];
    formats: string[];
    startedAt: number | null;
    isHost: boolean;
    players?: PrivateRoomPlayer[];
    messages: PrivateChatMessage[];
  };
  presence?: { activePlayers?: number };
  error?: string;
}

function asRoomView(payload: PrivateRoomPayload | null): PrivateRoomView | null {
  const room = payload?.privateRoom;
  if (!room?.code) return null;
  return {
    code: room.code,
    games: Array.isArray(room.games) ? room.games : [],
    formats: Array.isArray(room.formats) ? room.formats : [],
    startedAt: typeof room.startedAt === "number" ? room.startedAt : null,
    isHost: Boolean(room.isHost),
    players: Array.isArray(room.players)
      ? room.players.map((player) => ({
          name: player.name,
          host: Boolean(player.host),
          self: Boolean(player.self),
          score: Number(player.score) || 0,
          away: Boolean(player.away),
        }))
      : [],
    messages: Array.isArray(room.messages) ? room.messages : [],
    waiting: payload?.waiting !== false,
    countdownMs: Math.max(0, Number(payload?.countdownMs) || 0),
    activePlayers: Number(payload?.presence?.activePlayers) || 0,
    nameTaken: Boolean(payload?.nameTaken),
  };
}

function filterCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .split("")
    .filter((character) => PRIVATE_ROOM_CODE_ALPHABET.includes(character))
    .join("")
    .slice(0, PRIVATE_ROOM_CODE_MAX);
}

function ChatBox({
  room,
  draft,
  dock,
  onDraft,
  onSend,
}: {
  room: PrivateRoomView;
  draft: string;
  dock?: boolean;
  onDraft: (value: string) => void;
  onSend: () => void;
}) {
  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [room.messages.length]);

  return (
    <div className={clsx(styles.chat, dock && styles.chatDock)} data-testid="private-room-chat">
      <div className={styles.chatLog} ref={logRef}>
        {room.messages.length === 0 ? <p className={styles.muted}>No messages yet.</p> : null}
        {room.messages.map((message) => (
          <p key={message.id}>
            <strong>{message.name}</strong>
            {message.text}
          </p>
        ))}
      </div>
      <form
        className={styles.chatForm}
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <input
          value={draft}
          maxLength={80}
          placeholder="Message"
          aria-label="Party chat"
          data-testid="private-room-chat-input"
          onChange={(event) => onDraft(event.currentTarget.value)}
        />
        <button type="submit" data-testid="private-room-chat-send">
          Send
        </button>
      </form>
    </div>
  );
}

const PARTY_NAME_KEY = "queue-arcade:party-name";

function persistPartyName(value: string) {
  if (value.trim()) window.localStorage.setItem(PARTY_NAME_KEY, value);
  else window.localStorage.removeItem(PARTY_NAME_KEY);
}

export function PrivateRoomPanel({
  gameOptions,
  playerId,
  displayName,
  initialCode,
  playActive,
  onStarted,
  onWaitingChange,
  onClose,
}: {
  gameOptions: PartyGameOption[];
  playerId: () => string;
  displayName: string;
  initialCode?: string;
  playActive: boolean;
  onStarted: (code: string) => void;
  onWaitingChange?: (waiting: boolean) => void;
  onClose?: () => void;
}) {
  const [screen, setScreen] = useState<PartyScreen>(initialCode ? "wait" : "setup");
  const [selected, setSelected] = useState<string[]>(() => gameOptions.map((game) => game.id));
  const [joinCode, setJoinCode] = useState(() => filterCode(initialCode ?? ""));
  const [nameDraft, setNameDraft] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return storedPartyNameDraft(window.localStorage.getItem(PARTY_NAME_KEY));
  });
  const [room, setRoom] = useState<PrivateRoomView | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<"code" | "name" | "games" | null>(null);
  const [nameNotice, setNameNotice] = useState<string | null>(null);
  const nameNoticeTimerRef = useRef<number | null>(null);
  const [busy, setBusy] = useState<"create" | "join" | "start" | "rematch" | null>(null);
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const startedRef = useRef(false);
  const joinInputRef = useRef<HTMLInputElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const nameRef = useRef("");
  const committedNameRef = useRef("");
  const nameEditingRef = useRef(false);
  const countdownEndRef = useRef<number | null>(null);
  const [countdownRemainingMs, setCountdownRemainingMs] = useState<number | null>(null);
  const trackedCode = room?.code;
  const selfServerName = room?.players.find((player) => player.self)?.name ?? "";
  const shownName = partyNameInputValue({
    draft: nameDraft,
    seed: partyNameSeed({ serverName: selfServerName, displayName }),
  });

  useEffect(() => {
    nameRef.current = shownName;
  }, [shownName]);

  useEffect(() => {
    if (!room?.waiting || !room.countdownMs) {
      countdownEndRef.current = null;
      return undefined;
    }
    countdownEndRef.current = Date.now() + room.countdownMs;
    const timer = window.setInterval(() => {
      const end = countdownEndRef.current;
      if (end == null) return;
      setCountdownRemainingMs(Math.max(0, end - Date.now()));
    }, 200);
    return () => window.clearInterval(timer);
  }, [room?.countdownMs, room?.startedAt, room?.waiting]);

  const countdownSeconds =
    room?.waiting && room.countdownMs > 0
      ? Math.max(1, Math.ceil((countdownRemainingMs ?? room.countdownMs) / 1000))
      : 0;

  const clearNameNotice = useCallback(() => {
    if (nameNoticeTimerRef.current != null) {
      window.clearTimeout(nameNoticeTimerRef.current);
      nameNoticeTimerRef.current = null;
    }
    setNameNotice(null);
  }, []);

  const flashNameNotice = useCallback((message: string) => {
    setNameNotice(message);
    if (nameNoticeTimerRef.current != null) window.clearTimeout(nameNoticeTimerRef.current);
    nameNoticeTimerRef.current = window.setTimeout(() => {
      setNameNotice(null);
      nameNoticeTimerRef.current = null;
    }, PRIVATE_ROOM_NAME_NOTICE_MS);
  }, []);

  useEffect(
    () => () => {
      if (nameNoticeTimerRef.current != null) window.clearTimeout(nameNoticeTimerRef.current);
    },
    [],
  );

  const saveName = (value: string) => {
    const next = value.slice(0, PRIVATE_ROOM_NAME_MAX);
    nameEditingRef.current = true;
    setNameDraft(next);
    setError(null);
    setErrorField(null);
    clearNameNotice();
  };

  const adoptServerName = useCallback((selfName: string) => {
    if (!selfName) return;
    nameEditingRef.current = false;
    committedNameRef.current = selfName;
    setNameDraft(selfName);
    persistPartyName(selfName);
  }, []);

  const applyPayload = useCallback(
    (payload: PrivateRoomPayload) => {
      const next = asRoomView(payload);
      if (!next) return null;
      const selfName = next.players.find((player) => player.self)?.name ?? "";
      if (selfName && !nameEditingRef.current) {
        committedNameRef.current = selfName;
        setNameDraft(selfName);
      } else if (selfName && !committedNameRef.current) {
        committedNameRef.current = selfName;
      }
      setRoom(next);
      onWaitingChange?.(next.waiting);
      if (next.waiting) setScreen("wait");
      if (!next.waiting && next.startedAt && !startedRef.current) {
        startedRef.current = true;
        if (!playActive) onStarted(next.code);
      }
      return next;
    },
    [onStarted, onWaitingChange, playActive],
  );

  const requestRoom = useCallback(
    async (path: string, init?: RequestInit) => {
      const response = await fetch(path, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      });
      const payload = (await response.json()) as PrivateRoomPayload;
      if (init?.signal?.aborted) return null;
      if (!response.ok) throw new Error(payload.error ?? "Request failed.");
      return applyPayload(payload);
    },
    [applyPayload],
  );

  const syncName = useCallback(
    async (value: string) => {
      const next = value.trim();
      const current = committedNameRef.current.trim();
      if (!trackedCode) return true;
      if (!next) {
        adoptServerName(current);
        return true;
      }
      if (next.toLowerCase() === current.toLowerCase()) {
        adoptServerName(current);
        return true;
      }
      if (room?.players.some((player) => !player.self && player.name.toLowerCase() === next.toLowerCase())) {
        adoptServerName(current);
        flashNameNotice("That name is taken.");
        return false;
      }
      try {
        const payload = await requestRoom(
          `/api/private-rooms?code=${encodeURIComponent(trackedCode)}&playerId=${encodeURIComponent(playerId())}&name=${encodeURIComponent(next)}`,
        );
        if (!payload) return false;
        const selfName = payload.players.find((player) => player.self)?.name ?? "";
        if (payload.nameTaken || (selfName && selfName.toLowerCase() !== next.toLowerCase())) {
          adoptServerName(selfName || current);
          flashNameNotice("That name is taken.");
          return false;
        }
        adoptServerName(selfName || next);
        clearNameNotice();
        return true;
      } catch (cause) {
        adoptServerName(current);
        flashNameNotice(cause instanceof Error ? cause.message : "Could not save that name.");
        return false;
      }
    },
    [adoptServerName, clearNameNotice, flashNameNotice, playerId, requestRoom, room?.players, trackedCode],
  );

  useEffect(() => {
    const code = trackedCode ?? initialCode;
    if (!code) return undefined;
    const abort = new AbortController();
    const load = () =>
      requestRoom(`/api/private-rooms?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(playerId())}`, {
        signal: abort.signal,
      }).catch((cause: unknown) => {
        if (abort.signal.aborted) return;
        if (cause instanceof Error && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Request failed.");
        if (!trackedCode) setScreen("setup");
      });
    const start = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), PRIVATE_ROOM_POLL_MS);
    return () => {
      abort.abort();
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, [initialCode, playerId, requestRoom, trackedCode]);

  const toggleGame = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((game) => game !== id) : [...current, id]));
  };

  const goToRoom = (payload: PrivateRoomPayload, code: string) => {
    applyPayload(payload);
    window.history.pushState({ queueArcadeView: "play", privateRoom: code }, "", `/play?room=${code}`);
  };

  const joinRoom = async () => {
    const hint = partyCodeError(joinCode);
    if (hint) {
      setError(hint);
      setErrorField("code");
      joinInputRef.current?.focus();
      return;
    }
    const name = shownName.trim();
    const code = filterCode(joinCode);
    setBusy("join");
    setError(null);
    setErrorField(null);
    try {
      const player = playerId();
      const joined = await fetch(
        `/api/private-rooms?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(player)}&name=${encodeURIComponent(name)}`,
      );
      const payload = (await joined.json()) as PrivateRoomPayload;
      if (joined.status === 404) throw new Error("No party with that code.");
      if (!joined.ok) throw new Error(payload.error ?? "Could not join that party.");
      goToRoom(payload, code);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not join that party.");
      setErrorField("code");
    } finally {
      setBusy(null);
    }
  };

  const createRoom = async () => {
    const hint = partyCodeError(joinCode);
    if (hint) {
      setError(hint);
      setErrorField("code");
      joinInputRef.current?.focus();
      return;
    }
    const name = shownName.trim();
    const code = filterCode(joinCode);
    setBusy("create");
    setError(null);
    setErrorField(null);
    try {
      const player = playerId();
      const existing = await fetch(`/api/private-rooms?code=${encodeURIComponent(code)}&peek=1`);
      const existingPayload = (await existing.json()) as PrivateRoomPayload;
      if (existing.ok) {
        setError("That code is taken.");
        setErrorField("code");
        return;
      }
      if (existing.status !== 404) throw new Error(existingPayload.error ?? "Could not create that party.");
      if (!selected.length) {
        setError("Pick at least one game.");
        setErrorField("games");
        return;
      }
      const created = await fetch("/api/private-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: player, games: selected, code, name }),
      });
      const createdPayload = (await created.json()) as PrivateRoomPayload;
      if (created.ok) {
        goToRoom(createdPayload, code);
        return;
      }
      if (createdPayload.error === "That code is taken.") {
        setError("That code is taken.");
        setErrorField("code");
        return;
      }
      throw new Error(createdPayload.error ?? "Could not create that party.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create that party.");
      setErrorField("code");
    } finally {
      setBusy(null);
    }
  };

  const startRoom = async () => {
    if (!room) return;
    await syncName(nameInputRef.current?.value ?? shownName);
    setBusy("start");
    setError(null);
    setErrorField(null);
    try {
      await requestRoom("/api/private-rooms/start", {
        method: "POST",
        body: JSON.stringify({ code: room.code, playerId: playerId() }),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start.");
    } finally {
      setBusy(null);
    }
  };

  const rematchRoom = async () => {
    if (!room) return;
    setBusy("rematch");
    setError(null);
    setErrorField(null);
    try {
      await requestRoom("/api/private-rooms/start", {
        method: "POST",
        body: JSON.stringify({ code: room.code, playerId: playerId(), rematch: true }),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not rematch.");
    } finally {
      setBusy(null);
    }
  };

  const sendMessage = async () => {
    if (!room || !draft.trim()) return;
    const text = draft;
    setDraft("");
    try {
      await requestRoom("/api/private-rooms/messages", {
        method: "POST",
        body: JSON.stringify({ code: room.code, playerId: playerId(), text }),
      });
    } catch (cause) {
      setDraft(text);
      setError(cause instanceof Error ? cause.message : "Could not send.");
    }
  };

  const copyLink = async () => {
    if (!room) return;
    const url = `${window.location.origin}/play?room=${room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError(url);
    }
  };

  const leaveParty = useCallback(() => {
    const code = trackedCode ?? (screen === "wait" ? joinCode : "");
    if (!code) return;
    const body = JSON.stringify({ code, playerId: playerId() });
    const blob = new Blob([body], { type: "application/json" });
    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/private-rooms/leave", blob)) {
      return;
    }
    void fetch("/api/private-rooms/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  }, [joinCode, playerId, screen, trackedCode]);

  useEffect(() => {
    if (playActive || screen !== "wait" || !trackedCode) return undefined;
    const onLeave = () => leaveParty();
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [leaveParty, playActive, screen, trackedCode]);

  const chatBox = room ? (
    <ChatBox room={room} draft={draft} onDraft={setDraft} onSend={() => void sendMessage()} />
  ) : null;

  const chatPanel = room ? (
    <div className={styles.chatShell} data-open={chatOpen ? "true" : "false"}>
      {playActive ? (
        <div className={styles.chatSlot} aria-hidden={!chatOpen} inert={chatOpen ? undefined : true}>
          {chatBox}
        </div>
      ) : chatOpen ? (
        chatBox
      ) : null}
      <button
        type="button"
        className={styles.chatToggle}
        data-testid="private-room-chat-toggle"
        aria-pressed={chatOpen}
        onClick={() => setChatOpen((open) => !open)}
      >
        <MessageSquare aria-hidden="true" data-testid="private-room-chat-icon" />
        <span className={styles.chatToggleFaces}>
          <span className={styles.chatToggleFace} data-show={chatOpen ? "false" : "true"}>
            Show chat
          </span>
          <span className={styles.chatToggleFace} data-show={chatOpen ? "true" : "false"}>
            Hide chat
          </span>
        </span>
      </button>
    </div>
  ) : null;

  if (playActive) {
    return room ? (
      <div className={styles.playDock} data-testid="private-room-play-dock">
        <ol className={styles.ranking} data-testid="private-room-ranking">
          {rankPartyPlayers(room.players).map((player, index) => (
            <li
              key={player.self ? "self" : `${player.name}-${index}`}
              data-self={player.self}
              data-away={player.away && !player.self}
            >
              <span>{index + 1}</span>
              <strong>
                {player.name}
                {partyPlayerTag(player) === "Away" ? <small>Away</small> : null}
              </strong>
              <em>{player.score}</em>
            </li>
          ))}
        </ol>
        <div className={styles.rematchSlot} data-testid="private-room-rematch-slot">
          {room.isHost ? (
            <button
              type="button"
              className={styles.primary}
              data-testid="private-room-rematch"
              disabled={busy === "rematch" || room.waiting}
              onClick={() => void rematchRoom()}
            >
              Rematch
            </button>
          ) : null}
        </div>
        {chatPanel}
      </div>
    ) : null;
  }

  const back = (
    <button
      type="button"
      className={styles.back}
      data-testid="private-room-leave"
      onClick={() => {
        if (screen === "wait") leaveParty();
        onClose?.();
      }}
    >
      <ArrowLeft />
      Leave
    </button>
  );

  if (screen === "wait") {
    if (!room) {
      return (
        <section className={clsx(styles.view, styles.waitView)} data-testid="private-room-wait">
          {back}
          {error ? <p className={styles.error}>{error}</p> : null}
        </section>
      );
    }
    const roster = partyLobbyRoster(
      room.players.length
        ? room.players
        : [{ name: shownName.trim() || "You", host: room.isHost, self: true, score: 0, away: false }],
    );
    return (
      <section className={clsx(styles.view, styles.waitView)} data-testid="private-room-wait">
        <h1 className="sr-only">Party lobby</h1>
        <div className={styles.lobby}>
          {back}
          <header className={styles.lobbyHead}>
            <div>
              <small>Party code</small>
              <strong data-testid="private-room-code">{room.code}</strong>
            </div>
            <button type="button" className={clsx(styles.ghost, styles.copyLink)} onClick={() => void copyLink()}>
              {copied ? <Check data-testid="private-room-copied" /> : <Copy />}
              Copy link
            </button>
          </header>
          <div>
            <p className={styles.sectionLabel}>
              <Users />
              Players
            </p>
            <ul className={styles.players} data-testid="private-room-players">
              {roster.map((player, index) => (
                <li
                  key={player.self ? "self" : `${player.name}-${index}`}
                  data-host={player.host}
                  data-self={player.self}
                  data-away={player.away && !player.self}
                >
                  {player.self ? (
                    <div className={styles.selfStack}>
                      <label className={styles.selfName}>
                        <input
                          ref={nameInputRef}
                          className={styles.playerName}
                          value={shownName}
                          maxLength={PRIVATE_ROOM_NAME_MAX}
                          placeholder="Your name"
                          autoComplete="nickname"
                          spellCheck={false}
                          aria-describedby={nameNotice ? "private-room-name-error" : undefined}
                          aria-label="Your name"
                          data-testid="private-room-name"
                          onChange={(event) => saveName(event.currentTarget.value)}
                          onFocus={() => {
                            nameEditingRef.current = true;
                          }}
                          onBlur={(event) => {
                            void syncName(event.currentTarget.value);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.currentTarget.blur();
                            }
                          }}
                        />
                        <Pencil aria-hidden="true" data-testid="private-room-name-pen" />
                      </label>
                      {nameNotice ? (
                        <p
                          id="private-room-name-error"
                          className={styles.nameError}
                          role="status"
                          aria-live="polite"
                          data-testid="private-room-name-error"
                        >
                          {nameNotice}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <strong>{player.name}</strong>
                  )}
                  <span>{partyPlayerTag(player)}</span>
                  {!room.waiting ? <em>{player.score}</em> : null}
                </li>
              ))}
            </ul>
          </div>
          {countdownSeconds > 0 ? (
            <p className={styles.countdown} data-testid="private-room-countdown">
              {countdownSeconds}
            </p>
          ) : room.isHost ? (
            <button
              type="button"
              className={styles.primary}
              data-testid="private-room-start"
              disabled={busy === "start"}
              onClick={() => void startRoom()}
            >
              Start
            </button>
          ) : (
            <p className={styles.startWait} data-testid="private-room-host-wait">
              Waiting for {room.players.find((player) => player.host)?.name || "the host"} to start
            </p>
          )}
          {error && errorField !== "name" ? (
            <p className={styles.error} role="alert" data-testid="private-room-error">
              {error}
            </p>
          ) : null}
          {chatPanel}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.view} data-testid="private-room-setup">
      <h1 className="sr-only">Party</h1>
      {back}
      <div
        className={clsx(formatPreviewCardStyles.cardGrid, styles.games)}
        role="group"
        aria-label="Games"
        data-invalid={errorField === "games" ? "true" : undefined}
      >
        {gameOptions.map((game) => {
          const on = selected.includes(game.id);
          return (
            <FormatPreviewCard
              key={game.id}
              as="button"
              type="button"
              game={game.id}
              label={game.label}
              preview={game.preview}
              className={styles.gameCard}
              aria-pressed={on}
              data-on={on ? "true" : "false"}
              onClick={() => toggleGame(game.id)}
            />
          );
        })}
      </div>
      <div className={styles.enter}>
        <div className={styles.joinRow}>
          <input
            ref={joinInputRef}
            className={styles.codeInput}
            value={joinCode}
            maxLength={PRIVATE_ROOM_CODE_MAX}
            placeholder="YOUR CODE"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={errorField === "code"}
            aria-describedby={error ? "party-code-error" : undefined}
            data-invalid={errorField === "code" ? "true" : undefined}
            aria-label="Party code"
            data-testid="private-room-join-code"
            onChange={(event) => {
              setJoinCode(filterCode(event.currentTarget.value));
              setError(null);
              setErrorField(null);
            }}
          />
          <button
            type="button"
            className={styles.dashButton}
            data-testid="private-room-create"
            aria-busy={busy === "create"}
            disabled={busy !== null}
            onClick={() => void createRoom()}
          >
            <span className={styles.enterFace} data-show={busy === "create" ? "false" : "true"}>
              Create
            </span>
            <span className={styles.enterFace} data-show={busy === "create" ? "true" : "false"}>
              Creating…
            </span>
          </button>
          <button
            type="button"
            className={styles.dashButton}
            data-testid="private-room-join"
            aria-busy={busy === "join"}
            disabled={busy !== null}
            onClick={() => void joinRoom()}
          >
            <span className={styles.enterFace} data-show={busy === "join" ? "false" : "true"}>
              Join
            </span>
            <span className={styles.enterFace} data-show={busy === "join" ? "true" : "false"}>
              Joining…
            </span>
          </button>
        </div>
        {error ? (
          <p id="party-code-error" className={styles.error} role="alert" data-testid="private-room-error">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
