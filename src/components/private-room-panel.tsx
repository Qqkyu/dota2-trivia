"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, Pencil, Users } from "lucide-react";
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
  partyNameInputValue,
  partyNameSeed,
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
        }))
      : [],
    messages: Array.isArray(room.messages) ? room.messages : [],
    waiting: payload?.waiting !== false && room.startedAt == null,
    activePlayers: Number(payload?.presence?.activePlayers) || 0,
    nameTaken: Boolean(payload?.nameTaken),
  };
}

function rankedPlayers(players: PrivateRoomPlayer[]) {
  return [...players].sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
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
          onChange={(event) => onDraft(event.currentTarget.value)}
        />
        <button type="submit">Send</button>
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
  const [busy, setBusy] = useState<"enter" | "start" | null>(null);
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const startedRef = useRef(false);
  const joinInputRef = useRef<HTMLInputElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const nameRef = useRef("");
  const committedNameRef = useRef("");
  const nameEditingRef = useRef(false);
  const trackedCode = room?.code;
  const selfServerName = room?.players.find((player) => player.self)?.name ?? "";
  const shownName = partyNameInputValue({
    draft: nameDraft,
    seed: partyNameSeed({ serverName: selfServerName, displayName }),
  });

  useEffect(() => {
    nameRef.current = shownName;
  }, [shownName]);

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
      if (next.startedAt && !startedRef.current) {
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

  const enterRoom = async () => {
    const hint = partyCodeError(joinCode);
    if (hint) {
      setError(hint);
      setErrorField("code");
      joinInputRef.current?.focus();
      return;
    }
    const name = shownName.trim();
    const code = filterCode(joinCode);
    setBusy("enter");
    setError(null);
    setErrorField(null);
    try {
      const player = playerId();
      const existing = await fetch(
        `/api/private-rooms?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(player)}&name=${encodeURIComponent(name)}`,
      );
      const existingPayload = (await existing.json()) as PrivateRoomPayload;
      if (existing.ok) {
        applyPayload(existingPayload);
        window.history.pushState({ queueArcadeView: "play", privateRoom: code }, "", `/play?room=${code}`);
        return;
      }
      if (existing.status !== 404) throw new Error(existingPayload.error ?? "Could not enter that party.");
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
        applyPayload(createdPayload);
        window.history.pushState({ queueArcadeView: "play", privateRoom: code }, "", `/play?room=${code}`);
        return;
      }
      const retry = await fetch(
        `/api/private-rooms?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(player)}&name=${encodeURIComponent(name)}`,
      );
      const retryPayload = (await retry.json()) as PrivateRoomPayload;
      if (retry.ok) {
        applyPayload(retryPayload);
        window.history.pushState({ queueArcadeView: "play", privateRoom: code }, "", `/play?room=${code}`);
        return;
      }
      throw new Error(createdPayload.error ?? "Could not enter that party.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not enter that party.");
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

  const sendMessage = async () => {
    if (!room || !draft.trim()) return;
    const text = draft;
    setDraft("");
    try {
      await requestRoom("/api/private-rooms/messages", {
        method: "POST",
        body: JSON.stringify({
          code: room.code,
          playerId: playerId(),
          name: committedNameRef.current.trim() || shownName.trim(),
          text,
        }),
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

  const chatPanel = room ? (
    <div className={styles.chatShell} data-open={chatOpen ? "true" : "false"}>
      <button
        type="button"
        className={styles.chatToggle}
        data-testid="private-room-chat-toggle"
        aria-pressed={chatOpen}
        onClick={() => setChatOpen((open) => !open)}
      >
        {chatOpen ? "Hide chat" : "Show chat"}
      </button>
      {chatOpen ? <ChatBox room={room} draft={draft} onDraft={setDraft} onSend={() => void sendMessage()} /> : null}
    </div>
  ) : null;

  if (playActive) {
    return room ? (
      <div className={styles.playDock} data-testid="private-room-play-dock">
        <ol className={styles.ranking} data-testid="private-room-ranking">
          {rankedPlayers(room.players).map((player, index) => (
            <li key={player.self ? "self" : `${player.name}-${index}`} data-self={player.self}>
              <span>{index + 1}</span>
              <strong>{player.name}</strong>
              <em>{player.score}</em>
            </li>
          ))}
        </ol>
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
    const roster = [
      ...(room.players.length
        ? room.players
        : [{ name: shownName.trim() || "You", host: room.isHost, self: true, score: 0 }]),
    ].sort((left, right) => Number(right.self) - Number(left.self));
    return (
      <section className={clsx(styles.view, styles.waitView)} data-testid="private-room-wait">
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
                  <span>{player.host ? "Host" : player.self ? "You" : ""}</span>
                  {room.startedAt != null ? <em>{player.score}</em> : null}
                </li>
              ))}
            </ul>
          </div>
          {room.isHost ? (
            <button
              type="button"
              className={styles.primary}
              data-testid="private-room-start"
              onClick={() => void startRoom()}
            >
              {busy === "start" ? "Starting…" : "Start"}
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
            onKeyDown={(event) => {
              if (event.key === "Enter") void enterRoom();
            }}
          />
          <button
            type="button"
            className={styles.primary}
            data-testid="private-room-enter"
            aria-busy={busy === "enter"}
            disabled={busy === "enter"}
            onClick={() => void enterRoom()}
          >
            <span className={styles.enterFace} data-show={busy === "enter" ? "false" : "true"}>
              Enter
            </span>
            <span className={styles.enterFace} data-show={busy === "enter" ? "true" : "false"}>
              Entering…
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
