"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Copy, Users } from "lucide-react";
import clsx from "clsx";
import type { FormatPreview } from "@/components/format-look";
import { FormatPreviewCard, formatPreviewCardStyles } from "@/components/format-preview-card";
import { PRIVATE_ROOM_CODE_ALPHABET, PRIVATE_ROOM_CODE_MAX, partyCodeError } from "@/lib/private-rooms.mjs";
import styles from "./private-room-panel.module.css";

export interface PrivateChatMessage {
  id: string;
  name: string;
  text: string;
  at: number;
}

export interface PrivateRoomView {
  code: string;
  games: string[];
  formats: string[];
  startedAt: number | null;
  isHost: boolean;
  messages: PrivateChatMessage[];
  waiting: boolean;
  activePlayers: number;
}

export interface PartyGameOption {
  id: string;
  label: string;
  preview?: FormatPreview | null;
}

type PartyScreen = "setup" | "wait";

interface PrivateRoomPayload {
  waiting?: boolean;
  privateRoom?: {
    code: string;
    games: string[];
    formats: string[];
    startedAt: number | null;
    isHost: boolean;
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
    messages: Array.isArray(room.messages) ? room.messages : [],
    waiting: payload?.waiting !== false && room.startedAt == null,
    activePlayers: Number(payload?.presence?.activePlayers) || 0,
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
          onChange={(event) => onDraft(event.currentTarget.value)}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
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
  const [room, setRoom] = useState<PrivateRoomView | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<"code" | "games" | null>(null);
  const [busy, setBusy] = useState<"enter" | "start" | null>(null);
  const [copied, setCopied] = useState(false);
  const startedRef = useRef(false);
  const joinInputRef = useRef<HTMLInputElement | null>(null);
  const trackedCode = room?.code;

  const applyPayload = useCallback(
    (payload: PrivateRoomPayload) => {
      const next = asRoomView(payload);
      if (!next) return null;
      setRoom(next);
      setError(null);
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
      if (!response.ok) throw new Error(payload.error ?? "Request failed.");
      return applyPayload(payload);
    },
    [applyPayload],
  );

  useEffect(() => {
    const code = trackedCode ?? initialCode;
    if (!code) return undefined;
    const load = () =>
      requestRoom(
        `/api/private-rooms?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(playerId())}`,
      ).catch((cause: Error) => {
        setError(cause.message);
        if (!trackedCode) setScreen("setup");
      });
    const start = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 4000);
    return () => {
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
    const code = filterCode(joinCode);
    setBusy("enter");
    setError(null);
    setErrorField(null);
    try {
      const player = playerId();
      const existing = await fetch(
        `/api/private-rooms?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(player)}`,
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
        body: JSON.stringify({ playerId: player, games: selected, code }),
      });
      const createdPayload = (await created.json()) as PrivateRoomPayload;
      if (created.ok) {
        applyPayload(createdPayload);
        window.history.pushState({ queueArcadeView: "play", privateRoom: code }, "", `/play?room=${code}`);
        return;
      }
      const retry = await fetch(
        `/api/private-rooms?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(player)}`,
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
    setBusy("start");
    setError(null);
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
        body: JSON.stringify({ code: room.code, playerId: playerId(), name: displayName, text }),
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

  if (playActive) {
    return room ? (
      <ChatBox room={room} draft={draft} dock onDraft={setDraft} onSend={() => void sendMessage()} />
    ) : null;
  }

  const back = (
    <button type="button" className={styles.back} onClick={() => onClose?.()}>
      <ArrowLeft />
      Leave
    </button>
  );

  if (screen === "wait") {
    if (!room) {
      return (
        <section className={styles.view} data-testid="private-room-wait">
          {back}
          {error ? <p className={styles.error}>{error}</p> : null}
        </section>
      );
    }
    return (
      <section className={styles.view} data-testid="private-room-wait">
        {back}
        <div className={styles.waitGrid}>
          <div>
            <div className={styles.ticket} data-testid="private-room-code">
              {room.code}
            </div>
            <div className={styles.waitMeta}>
              <span>
                <Users />
                {room.activePlayers || 1}
              </span>
            </div>
            <div className={styles.waitActions}>
              <button type="button" className={styles.ghost} onClick={() => void copyLink()}>
                <Copy />
                {copied ? "Copied" : "Copy link"}
              </button>
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
                <p className={styles.muted}>Waiting for host</p>
              )}
            </div>
            {error ? <p className={styles.error}>{error}</p> : null}
          </div>
          <ChatBox room={room} draft={draft} onDraft={setDraft} onSend={() => void sendMessage()} />
        </div>
      </section>
    );
  }

  return (
    <section className={styles.view} data-testid="private-room-setup">
      {back}
      <div className={clsx(formatPreviewCardStyles.cardGrid, styles.games)} role="group" aria-label="Games">
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
