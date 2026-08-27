"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Copy, Users } from "lucide-react";
import clsx from "clsx";
import { PRIVATE_ROOM_CODE_ALPHABET, PRIVATE_ROOM_CODE_LENGTH } from "@/lib/private-rooms.mjs";
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

type PartyScreen = "gate" | "create" | "join" | "wait";

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
    .slice(0, PRIVATE_ROOM_CODE_LENGTH);
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
          placeholder="Message the party"
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
  gameOptions: Array<{ id: string; label: string }>;
  playerId: () => string;
  displayName: string;
  initialCode?: string;
  playActive: boolean;
  onStarted: (code: string) => void;
  onWaitingChange?: (waiting: boolean) => void;
  onClose?: () => void;
}) {
  const [screen, setScreen] = useState<PartyScreen>(initialCode ? "wait" : "gate");
  const [selected, setSelected] = useState<string[]>(() => gameOptions.map((game) => game.id));
  const [joinCode, setJoinCode] = useState(() => filterCode(initialCode ?? ""));
  const [room, setRoom] = useState<PrivateRoomView | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "join" | "start" | null>(null);
  const [copied, setCopied] = useState(false);
  const startedRef = useRef(false);
  const joinInputRef = useRef<HTMLInputElement | null>(null);

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

  const trackedCode = room?.code;
  useEffect(() => {
    const code = trackedCode ?? initialCode;
    if (!code) return undefined;
    const load = () =>
      requestRoom(
        `/api/private-rooms?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(playerId())}`,
      ).catch((cause: Error) => {
        setError(cause.message);
        if (!trackedCode) {
          setScreen("join");
          setJoinCode(filterCode(code));
        }
      });
    const start = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 4000);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, [initialCode, playerId, requestRoom, trackedCode]);

  useEffect(() => {
    if (screen === "join") joinInputRef.current?.focus();
  }, [screen]);

  const toggleGame = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((game) => game !== id) : [...current, id]));
  };

  const createRoom = async () => {
    if (!selected.length) {
      setError("Pick at least one game.");
      return;
    }
    setBusy("create");
    setError(null);
    try {
      const next = await requestRoom("/api/private-rooms", {
        method: "POST",
        body: JSON.stringify({ playerId: playerId(), games: selected }),
      });
      if (next) {
        window.history.pushState({ queueArcadeView: "play", privateRoom: next.code }, "", `/play?room=${next.code}`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create a party.");
    } finally {
      setBusy(null);
    }
  };

  const joinRoom = async () => {
    const code = filterCode(joinCode);
    if (code.length !== PRIVATE_ROOM_CODE_LENGTH) {
      setError("The code is 4 letters. Ask the host.");
      joinInputRef.current?.focus();
      return;
    }
    setBusy("join");
    setError(null);
    try {
      const next = await requestRoom(
        `/api/private-rooms?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(playerId())}`,
      );
      if (next) {
        window.history.pushState({ queueArcadeView: "play", privateRoom: next.code }, "", `/play?room=${next.code}`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No party uses that code.");
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
    <button
      type="button"
      className={styles.back}
      onClick={() => {
        if (screen === "gate" || screen === "wait") onClose?.();
        else {
          setError(null);
          setScreen("gate");
        }
      }}
    >
      <ArrowLeft />
      {screen === "wait" ? "Leave party" : "Back"}
    </button>
  );

  if (screen === "wait") {
    if (!room) {
      return (
        <section className={styles.view} data-testid="private-room-wait">
          {back}
          <p className={styles.kicker}>Party lobby</p>
          <h1>Opening party…</h1>
          {error ? <p className={styles.error}>{error}</p> : null}
        </section>
      );
    }
    const gameLabels = room.games.length
      ? room.games.map((id) => gameOptions.find((game) => game.id === id)?.label ?? id).join(" · ")
      : "Full mix";
    return (
      <section className={styles.view} data-testid="private-room-wait">
        {back}
        <div className={styles.waitGrid}>
          <div>
            <p className={styles.kicker}>Party lobby</p>
            <h1>Share this code</h1>
            <div className={styles.ticket} data-testid="private-room-code">
              {[...room.code].map((letter, index) => (
                <span key={`${letter}-${index}`}>{letter}</span>
              ))}
            </div>
            <div className={styles.waitMeta}>
              <span>
                <Users />
                {room.activePlayers > 0 ? `${room.activePlayers} here` : "Waiting for friends"}
              </span>
              <span>{gameLabels}</span>
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
                  {busy === "start" ? "Starting…" : "Start match"}
                </button>
              ) : (
                <p className={styles.muted}>Wait for the host to start.</p>
              )}
            </div>
            {error ? <p className={styles.error}>{error}</p> : null}
          </div>
          <ChatBox room={room} draft={draft} onDraft={setDraft} onSend={() => void sendMessage()} />
        </div>
      </section>
    );
  }

  if (screen === "create") {
    return (
      <section className={styles.view} data-testid="private-room-create-view">
        {back}
        <p className={styles.kicker}>Play with friends</p>
        <h1>Create a party</h1>
        <p className={styles.lead}>Pick the games for this party. Friends only see this mix.</p>
        <div className={styles.games} role="group" aria-label="Games in this party">
          {gameOptions.map((game) => {
            const on = selected.includes(game.id);
            return (
              <button
                key={game.id}
                type="button"
                className={styles.gameTile}
                aria-pressed={on}
                data-on={on ? "true" : "false"}
                onClick={() => toggleGame(game.id)}
              >
                {game.label}
              </button>
            );
          })}
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
        <button
          type="button"
          className={styles.primary}
          data-testid="private-room-create"
          onClick={() => void createRoom()}
        >
          {busy === "create" ? "Creating…" : "Create party"}
        </button>
      </section>
    );
  }

  if (screen === "join") {
    const remaining = PRIVATE_ROOM_CODE_LENGTH - joinCode.length;
    return (
      <section className={styles.view} data-testid="private-room-join-view">
        {back}
        <p className={styles.kicker}>Play with friends</p>
        <h1>Join a party</h1>
        <p className={styles.lead}>Type the 4-letter code from the host.</p>
        <label className={styles.codeEntry}>
          <span className={styles.boxes} aria-hidden="true">
            {Array.from({ length: PRIVATE_ROOM_CODE_LENGTH }, (_, index) => (
              <i key={index} data-filled={joinCode[index] ? "true" : "false"}>
                {joinCode[index] ?? ""}
              </i>
            ))}
          </span>
          <input
            ref={joinInputRef}
            className={styles.hiddenCode}
            value={joinCode}
            maxLength={PRIVATE_ROOM_CODE_LENGTH}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Party code"
            data-testid="private-room-join-code"
            onChange={(event) => {
              setJoinCode(filterCode(event.currentTarget.value));
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void joinRoom();
            }}
          />
        </label>
        <p className={styles.help}>
          {remaining > 0 ? `${remaining} more character${remaining === 1 ? "" : "s"}.` : "Code looks complete."}
        </p>
        {error ? <p className={styles.error}>{error}</p> : null}
        <button
          type="button"
          className={styles.primary}
          data-testid="private-room-join"
          onClick={() => void joinRoom()}
        >
          {busy === "join" ? "Joining…" : "Join party"}
        </button>
      </section>
    );
  }

  return (
    <section className={styles.view} data-testid="private-room-gate">
      {back}
      <p className={styles.kicker}>Play with friends</p>
      <h1>A party of your own</h1>
      <p className={styles.lead}>Same 15-second rounds. Separate from the public room.</p>
      <div className={styles.gate}>
        <button
          type="button"
          className={styles.gateCard}
          data-testid="private-room-go-create"
          onClick={() => setScreen("create")}
        >
          <strong>Create a party</strong>
          <span>You host. You pick the games. Friends join with a code.</span>
        </button>
        <button
          type="button"
          className={styles.gateCard}
          data-testid="private-room-go-join"
          onClick={() => setScreen("join")}
        >
          <strong>I have a code</strong>
          <span>Enter the 4-letter code and sit in the lobby until the host starts.</span>
        </button>
      </div>
    </section>
  );
}
