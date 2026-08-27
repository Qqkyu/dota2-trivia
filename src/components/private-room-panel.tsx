"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
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
}

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
  };
}

export function PrivateRoomPanel({
  gameOptions,
  playerId,
  displayName,
  initialCode,
  playActive,
  onStarted,
  onWaitingChange,
}: {
  gameOptions: Array<{ id: string; label: string }>;
  playerId: () => string;
  displayName: string;
  initialCode?: string;
  playActive: boolean;
  onStarted: (code: string) => void;
  onWaitingChange?: (waiting: boolean) => void;
}) {
  const [open, setOpen] = useState(Boolean(initialCode));
  const [selected, setSelected] = useState<string[]>(() => gameOptions.map((game) => game.id));
  const [joinCode, setJoinCode] = useState(initialCode ?? "");
  const [room, setRoom] = useState<PrivateRoomView | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  const applyPayload = useCallback(
    (payload: PrivateRoomPayload) => {
      const next = asRoomView(payload);
      if (!next) return null;
      setRoom(next);
      setError(null);
      onWaitingChange?.(next.waiting);
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
    const code = room?.code ?? initialCode;
    if (!code) return undefined;
    const load = () =>
      requestRoom(
        `/api/private-rooms?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(playerId())}`,
      ).catch((cause: Error) => setError(cause.message));
    const start = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 4000);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, [initialCode, playerId, requestRoom, room?.code]);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [room?.messages.length]);

  const toggleGame = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((game) => game !== id) : [...current, id]));
  };

  const createRoom = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await requestRoom("/api/private-rooms", {
        method: "POST",
        body: JSON.stringify({
          playerId: playerId(),
          games: selected.length ? selected : gameOptions.map((game) => game.id),
        }),
      });
      if (next) {
        window.history.pushState({ queueArcadeView: "play", privateRoom: next.code }, "", `/play?room=${next.code}`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create a room.");
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await requestRoom(
        `/api/private-rooms?code=${encodeURIComponent(joinCode)}&playerId=${encodeURIComponent(playerId())}`,
      );
      if (next) {
        window.history.pushState({ queueArcadeView: "play", privateRoom: next.code }, "", `/play?room=${next.code}`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not join that room.");
    } finally {
      setBusy(false);
    }
  };

  const startRoom = async () => {
    if (!room) return;
    setBusy(true);
    try {
      await requestRoom("/api/private-rooms/start", {
        method: "POST",
        body: JSON.stringify({ code: room.code, playerId: playerId() }),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start.");
    } finally {
      setBusy(false);
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
    } catch {
      setError(url);
    }
  };

  const chat = room ? (
    <div className={clsx(styles.chat, playActive && styles.chatDock)} data-testid="private-room-chat">
      <div className={styles.chatLog} ref={logRef}>
        {room.messages.length === 0 ? <p className={styles.chatEmpty}>Say hello.</p> : null}
        {room.messages.map((message) => (
          <p key={message.id}>
            <strong>{message.name}</strong> {message.text}
          </p>
        ))}
      </div>
      <form
        className={styles.chatForm}
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage();
        }}
      >
        <input
          value={draft}
          maxLength={80}
          placeholder="Chat"
          aria-label="Private room chat"
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
        <button type="submit" disabled={!draft.trim()}>
          Send
        </button>
      </form>
    </div>
  ) : null;

  if (playActive) return chat;

  if (room?.waiting) {
    return (
      <div className={styles.panel} data-testid="private-room-wait">
        <p className={styles.codeLine}>
          Room <strong data-testid="private-room-code">{room.code}</strong>
          <button type="button" onClick={() => void copyLink()}>
            Copy link
          </button>
        </p>
        <p className={styles.hint}>{room.isHost ? "Start when your friends are in." : "Wait for the host to start."}</p>
        {room.isHost ? (
          <button
            type="button"
            className={styles.startButton}
            data-testid="private-room-start"
            onClick={() => void startRoom()}
            disabled={busy}
          >
            Start
          </button>
        ) : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        {chat}
      </div>
    );
  }

  return (
    <div className={styles.entry} data-testid="private-room-entry">
      {open ? null : (
        <button
          type="button"
          className={styles.ghostButton}
          data-testid="private-room-open"
          onClick={() => setOpen(true)}
        >
          Private room
        </button>
      )}
      {open ? (
        <div className={styles.panel}>
          <span className={styles.label}>Games in this room</span>
          <div className={styles.games} role="group" aria-label="Private room games">
            {gameOptions.map((game) => (
              <label key={game.id}>
                <input type="checkbox" checked={selected.includes(game.id)} onChange={() => toggleGame(game.id)} />
                {game.label}
              </label>
            ))}
          </div>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.startButton}
              data-testid="private-room-create"
              onClick={() => void createRoom()}
              disabled={busy}
            >
              Create room
            </button>
            <input
              className={styles.codeInput}
              value={joinCode}
              maxLength={4}
              placeholder="Code"
              aria-label="Join private room code"
              data-testid="private-room-join-code"
              onChange={(event) => setJoinCode(event.currentTarget.value.toUpperCase())}
            />
            <button
              type="button"
              className={styles.ghostButton}
              data-testid="private-room-join"
              onClick={() => void joinRoom()}
              disabled={busy || joinCode.length < 4}
            >
              Join
            </button>
          </div>
          {error ? <p className={styles.error}>{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
