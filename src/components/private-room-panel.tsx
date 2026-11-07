"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, MessageSquare, Pencil, Users } from "lucide-react";
import clsx from "clsx";
import { useLocale } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/types";
import { safeBrowserStorage } from "@/lib/browser-storage.mjs";
import { requestWithRetry } from "@/lib/request-retry.mjs";
import type { FormatPreview } from "@/components/format-look";
import { FormatPreviewCard, formatPreviewCardStyles } from "@/components/format-preview-card";
import {
  PRIVATE_ROOM_CODE_ALPHABET,
  PRIVATE_ROOM_CODE_MAX,
  PRIVATE_ROOM_NAME_MAX,
  PRIVATE_ROOM_NAME_NOTICE_MS,
  PRIVATE_ROOM_PLAYER_MAX,
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

const PARTY_GONE_AFTER_MISSES = 2;

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

type PartyScreen = "choose" | "create" | "join" | "wait";

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
  /** Machine-readable cause; `error` is in the player's language. */
  reason?: string;
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
  sending,
  error,
}: {
  room: PrivateRoomView;
  draft: string;
  dock?: boolean;
  onDraft: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  error: string | null;
}) {
  const { t } = useLocale();
  const logRef = useRef<HTMLDivElement | null>(null);
  const followLogRef = useRef(true);
  const latestMessageId = room.messages.at(-1)?.id;
  useEffect(() => {
    if (followLogRef.current) logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [latestMessageId]);

  return (
    <div className={clsx(styles.chat, dock && styles.chatDock)} data-testid="private-room-chat">
      <div
        className={styles.chatLog}
        ref={logRef}
        role="log"
        aria-label={t("party.chat.log")}
        aria-live="polite"
        aria-relevant="additions"
        onScroll={(event) => {
          const log = event.currentTarget;
          followLogRef.current = log.scrollHeight - log.clientHeight - log.scrollTop <= 8;
        }}
      >
        {room.messages.length === 0 ? <p className={styles.muted}>{t("party.chat.empty")}</p> : null}
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
          placeholder={t("party.chat.placeholder")}
          aria-label={t("party.chat.input")}
          data-testid="private-room-chat-input"
          onChange={(event) => onDraft(event.currentTarget.value)}
        />
        <button type="submit" data-testid="private-room-chat-send" disabled={sending} aria-busy={sending}>
          {t("party.chat.send")}
        </button>
      </form>
      <p className={styles.chatError} role="status" data-testid="private-room-chat-error">
        {error ?? "\u00a0"}
      </p>
    </div>
  );
}

const PARTY_CHAT_DRAFT_KEY = "queue-arcade:party-chat-draft:v1";

function readChatDraft(code?: string) {
  if (!code) return "";
  try {
    const saved = JSON.parse(safeBrowserStorage("session").getItem(PARTY_CHAT_DRAFT_KEY) ?? "null");
    return saved?.code === code && typeof saved.text === "string" ? saved.text.slice(0, 80) : "";
  } catch {
    return "";
  }
}

function saveChatDraft(code: string | undefined, text: string) {
  if (!code) return;
  const storage = safeBrowserStorage("session");
  if (text) storage.setItem(PARTY_CHAT_DRAFT_KEY, JSON.stringify({ code, text: text.slice(0, 80) }));
  else storage.removeItem(PARTY_CHAT_DRAFT_KEY);
}

const PARTY_NAME_KEY = "queue-arcade:party-name";

function persistPartyName(value: string) {
  const storage = safeBrowserStorage("local");
  if (value.trim()) storage.setItem(PARTY_NAME_KEY, value);
  else storage.removeItem(PARTY_NAME_KEY);
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
  onEnded,
  notice = null,
  onDismissNotice,
}: {
  gameOptions: PartyGameOption[];
  playerId: () => string;
  displayName: string;
  initialCode?: string;
  playActive: boolean;
  onStarted: (code: string) => void;
  onWaitingChange?: (waiting: boolean) => void;
  onClose?: () => void;
  /** The server no longer knows this party (it restarted, for example for a deploy). */
  onEnded?: () => void;
  /** Message key, shown on the choose screen until the player acts. */
  notice?: string | null;
  onDismissNotice?: () => void;
}) {
  const { t } = useLocale();
  const [screen, setScreen] = useState<PartyScreen>(initialCode ? "wait" : "choose");
  const [selected, setSelected] = useState<string[]>(() => gameOptions.map((game) => game.id));
  const [joinCode, setJoinCode] = useState(() => filterCode(initialCode ?? ""));
  const [nameDraft, setNameDraft] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return storedPartyNameDraft(safeBrowserStorage("local").getItem(PARTY_NAME_KEY));
  });
  const [room, setRoom] = useState<PrivateRoomView | null>(null);
  const [draft, setDraft] = useState(() => readChatDraft(initialCode));
  const draftVersionRef = useRef(0);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [failedInitialCode, setFailedInitialCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<"code" | "name" | "games" | null>(null);
  const [nameNotice, setNameNotice] = useState<string | null>(null);
  const nameNoticeTimerRef = useRef<number | null>(null);
  const [busy, setBusy] = useState<"create" | "join" | "start" | null>(null);
  const busyRef = useRef<"create" | "join" | "start" | null>(null);
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const startedRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const requestsRef = useRef(new Set<AbortController>());
  const requestSequenceRef = useRef(0);
  const appliedSequenceRef = useRef(0);
  const onStartedRef = useRef(onStarted);
  const onWaitingChangeRef = useRef(onWaitingChange);
  const onEndedRef = useRef(onEnded);
  const partyMissesRef = useRef(0);
  const playerIdRef = useRef(playerId);
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
    onStartedRef.current = onStarted;
    onWaitingChangeRef.current = onWaitingChange;
    onEndedRef.current = onEnded;
    playerIdRef.current = playerId;
  }, [onEnded, onStarted, onWaitingChange, playerId]);

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
      requestGenerationRef.current += 1;
      for (const request of requestsRef.current) request.abort();
      requestsRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (!playActive) return;
    document
      .querySelector('[data-testid="private-room-ranking"] li[data-self="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [playActive, room?.players.length]);

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
      // A response captured before the start must not return a running party to its lobby.
      if (next.waiting && (playActive || startedRef.current)) return null;
      const selfName = next.players.find((player) => player.self)?.name ?? "";
      if (selfName && !nameEditingRef.current) {
        committedNameRef.current = selfName;
        setNameDraft(selfName);
      } else if (selfName && !committedNameRef.current) {
        committedNameRef.current = selfName;
      }
      setRoom(next);
      onWaitingChangeRef.current?.(next.waiting);
      if (next.waiting) setScreen("wait");
      if (!next.waiting && next.startedAt && !startedRef.current) {
        startedRef.current = true;
        if (!playActive) onStartedRef.current(next.code);
      }
      return next;
    },
    [playActive],
  );

  const cancelRequests = () => {
    requestGenerationRef.current += 1;
    for (const request of requestsRef.current) request.abort();
    requestsRef.current.clear();
    busyRef.current = null;
    setBusy(null);
  };

  const beginEntry = (action: "create" | "join") => {
    if (busyRef.current) return null;
    busyRef.current = action;
    setBusy(action);
    const generation = requestGenerationRef.current;
    const controller = new AbortController();
    requestsRef.current.add(controller);
    const current = () => !controller.signal.aborted && generation === requestGenerationRef.current;
    return {
      current,
      fetch: (path: string, init?: RequestInit) =>
        requestWithRetry(
          async (signal: AbortSignal) => {
            const response = await fetch(path, { ...init, signal });
            const payload = (await response.json()) as PrivateRoomPayload;
            return { response, payload };
          },
          {
            signal: controller.signal,
            attempts: 1,
          },
        ),
      finish: () => {
        requestsRef.current.delete(controller);
        if (current()) {
          busyRef.current = null;
          setBusy(null);
        }
      },
    };
  };

  const requestRoom = useCallback(
    async (path: string, init?: RequestInit) => {
      const generation = requestGenerationRef.current;
      const sequence = ++requestSequenceRef.current;
      const controller = new AbortController();
      const abort = () => controller.abort();
      init?.signal?.addEventListener("abort", abort, { once: true });
      if (init?.signal?.aborted) controller.abort();
      requestsRef.current.add(controller);
      try {
        const { response, payload } = await requestWithRetry(
          async (signal: AbortSignal) => {
            const response = await fetch(path, {
              ...init,
              signal,
              headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
            });
            const payload = (await response.json()) as PrivateRoomPayload;
            return { response, payload };
          },
          { signal: controller.signal, attempts: 1 },
        );
        if (controller.signal.aborted || generation !== requestGenerationRef.current) return null;
        if (!response.ok)
          throw Object.assign(new Error(payload.error ?? t("party.error.requestFailed")), { status: response.status });
        if (sequence < appliedSequenceRef.current) return null;
        appliedSequenceRef.current = sequence;
        return applyPayload(payload);
      } catch (cause) {
        if (controller.signal.aborted || generation !== requestGenerationRef.current) return null;
        if (cause instanceof Error && cause.name === "AbortError") throw new Error(t("party.error.timeout"));
        throw cause;
      } finally {
        requestsRef.current.delete(controller);
        init?.signal?.removeEventListener("abort", abort);
      }
    },
    [applyPayload, t],
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
        flashNameNotice(t("party.error.nameTaken"));
        return false;
      }
      try {
        const payload = await requestRoom("/api/private-rooms", {
          method: "POST",
          body: JSON.stringify({ action: "rename", code: trackedCode, playerId: playerIdRef.current(), name: next }),
        });
        if (!payload) return false;
        const selfName = payload.players.find((player) => player.self)?.name ?? "";
        if (payload.nameTaken || (selfName && selfName.toLowerCase() !== next.toLowerCase())) {
          adoptServerName(selfName || current);
          flashNameNotice(t("party.error.nameTaken"));
          return false;
        }
        adoptServerName(selfName || next);
        clearNameNotice();
        return true;
      } catch (cause) {
        adoptServerName(current);
        flashNameNotice(cause instanceof Error ? cause.message : t("party.error.nameSave"));
        return false;
      }
    },
    [adoptServerName, clearNameNotice, flashNameNotice, requestRoom, room?.players, t, trackedCode],
  );

  useEffect(() => {
    const code = trackedCode ?? (initialCode !== failedInitialCode ? initialCode : undefined);
    if (!code) return undefined;
    const abort = new AbortController();
    let loading = false;
    const load = async () => {
      if (loading || abort.signal.aborted) return;
      loading = true;
      try {
        await requestRoom("/api/private-rooms", {
          method: "POST",
          signal: abort.signal,
          body: JSON.stringify({
            action: trackedCode ? "touch" : "join",
            code,
            playerId: playerIdRef.current(),
            ...(!trackedCode && !playActive ? { name: nameRef.current } : {}),
          }),
        });
        partyMissesRef.current = 0;
      } catch (cause) {
        if (abort.signal.aborted) return;
        if (cause instanceof Error && cause.name === "AbortError") return;
        // A party this tab is in, or is playing, that the server no longer knows has ended:
        // parties live in server memory, so a restart ends them. Two misses in a row rule out a fluke.
        if ((trackedCode || playActive) && (cause as { status?: number }).status === 404) {
          partyMissesRef.current += 1;
          if (partyMissesRef.current >= PARTY_GONE_AFTER_MISSES) {
            abort.abort();
            partyMissesRef.current = 0;
            requestGenerationRef.current += 1;
            setRoom(null);
            setError(null);
            setFailedInitialCode(code);
            setScreen("choose");
            onEndedRef.current?.();
          }
          return;
        }
        setError(cause instanceof Error ? cause.message : t("party.error.requestFailed"));
        if (!trackedCode) {
          setFailedInitialCode(code);
          setScreen("choose");
        }
      } finally {
        loading = false;
      }
    };
    const start = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), PRIVATE_ROOM_POLL_MS);
    return () => {
      abort.abort();
      window.clearTimeout(start);
      window.clearInterval(timer);
    };
  }, [failedInitialCode, initialCode, playActive, requestRoom, t, trackedCode]);

  const toggleGame = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((game) => game !== id) : [...current, id]));
    if (errorField === "games") {
      setError(null);
      setErrorField(null);
    }
  };

  const goToRoom = (payload: PrivateRoomPayload, code: string) => {
    applyPayload(payload);
    window.history.pushState({ queueArcadeView: "play", privateRoom: code }, "", `/play?room=${code}`);
  };

  const joinRoom = async () => {
    const hint = partyCodeError(joinCode);
    if (hint) {
      setError(t(hint.key, hint.vars));
      setErrorField("code");
      joinInputRef.current?.focus();
      return;
    }
    const name = shownName.trim();
    const code = filterCode(joinCode);
    const entry = beginEntry("join");
    if (!entry) return;
    setError(null);
    setErrorField(null);
    try {
      const player = playerId();
      const { response: joined, payload } = await entry.fetch("/api/private-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", code, playerId: player, name }),
      });
      if (!entry.current()) return;
      if (joined.status === 404) throw new Error(t("party.error.noParty"));
      if (joined.status === 409) {
        setError(payload.error ?? t("party.error.full"));
        setErrorField(null);
        return;
      }
      if (!joined.ok) throw new Error(payload.error ?? t("party.error.joinFailed"));
      goToRoom(payload, code);
    } catch (cause) {
      if (!entry.current()) return;
      setError(
        cause instanceof Error && cause.name === "AbortError"
          ? t("party.error.timeout")
          : cause instanceof Error
            ? cause.message
            : t("party.error.joinFailed"),
      );
      setErrorField("code");
    } finally {
      entry.finish();
    }
  };

  const createRoom = async () => {
    const hint = partyCodeError(joinCode);
    if (hint) {
      setError(t(hint.key, hint.vars));
      setErrorField("code");
      joinInputRef.current?.focus();
      return;
    }
    const name = shownName.trim();
    const code = filterCode(joinCode);
    const entry = beginEntry("create");
    if (!entry) return;
    setError(null);
    setErrorField(null);
    try {
      const player = playerId();
      const { response: existing, payload: existingPayload } = await entry.fetch(
        `/api/private-rooms?code=${encodeURIComponent(code)}&peek=1`,
      );
      if (!entry.current()) return;
      if (!existing.ok && existing.status !== 404) {
        throw new Error(existingPayload.error ?? t("party.error.createFailed"));
      }
      if (!selected.length) {
        setError(t("party.error.pickGame"));
        setErrorField("games");
        return;
      }
      const { response: created, payload: createdPayload } = await entry.fetch("/api/private-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: player, games: selected, code, name }),
      });
      if (!entry.current()) return;
      if (created.ok) {
        goToRoom(createdPayload, code);
        return;
      }
      if (createdPayload.reason === "code-taken") {
        setError(t("party.error.codeTaken"));
        setErrorField("code");
        return;
      }
      throw new Error(createdPayload.error ?? t("party.error.createFailed"));
    } catch (cause) {
      if (!entry.current()) return;
      setError(
        cause instanceof Error && cause.name === "AbortError"
          ? t("party.error.timeout")
          : cause instanceof Error
            ? cause.message
            : t("party.error.createFailed"),
      );
      setErrorField("code");
    } finally {
      entry.finish();
    }
  };

  const startRoom = async () => {
    if (!room || busyRef.current) return;
    const generation = requestGenerationRef.current;
    busyRef.current = "start";
    setBusy("start");
    await syncName(nameInputRef.current?.value ?? shownName);
    if (generation !== requestGenerationRef.current) return;
    setError(null);
    setErrorField(null);
    try {
      await requestRoom("/api/private-rooms/start", {
        method: "POST",
        body: JSON.stringify({ code: room.code, playerId: playerId() }),
      });
    } catch (cause) {
      if (generation !== requestGenerationRef.current) return;
      setError(cause instanceof Error ? cause.message : t("party.error.startFailed"));
    } finally {
      if (generation === requestGenerationRef.current) {
        busyRef.current = null;
        setBusy(null);
      }
    }
  };

  const sendMessage = async () => {
    if (!room || !draft.trim() || sendingRef.current) return;
    const text = draft;
    const version = draftVersionRef.current;
    const generation = requestGenerationRef.current;
    sendingRef.current = true;
    setSending(true);
    setChatError(null);
    setDraft("");
    saveChatDraft(room.code, "");
    try {
      await requestRoom("/api/private-rooms/messages", {
        method: "POST",
        body: JSON.stringify({ code: room.code, playerId: playerId(), text }),
      });
    } catch (cause) {
      if (generation !== requestGenerationRef.current) return;
      if (draftVersionRef.current === version) {
        setDraft(text);
        saveChatDraft(room.code, text);
      }
      setChatError(cause instanceof Error ? cause.message : t("party.error.sendFailed"));
    } finally {
      sendingRef.current = false;
      setSending(false);
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

  const playerTagText = (player: PrivateRoomPlayer) => {
    const tag = partyPlayerTag(player);
    return tag ? t(tag) : "";
  };

  const chatBox = room ? (
    <ChatBox
      room={room}
      draft={draft}
      onDraft={(value) => {
        draftVersionRef.current += 1;
        setDraft(value);
        saveChatDraft(room.code, value);
      }}
      onSend={() => void sendMessage()}
      sending={sending}
      error={chatError}
    />
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
            {t("party.chat.show")}
          </span>
          <span className={styles.chatToggleFace} data-show={chatOpen ? "true" : "false"}>
            {t("party.chat.hide")}
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
                {partyPlayerTag(player) === "party.tag.away" ? <small>{t("party.tag.away")}</small> : null}
              </strong>
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
        cancelRequests();
        onDismissNotice?.();
        if (screen === "wait") {
          leaveParty();
          onClose?.();
          return;
        }
        if (screen === "create" || screen === "join") {
          setError(null);
          setErrorField(null);
          setScreen("choose");
          return;
        }
        onClose?.();
      }}
    >
      <ArrowLeft />
      {t(
        screen === "create" || screen === "join"
          ? "party.back"
          : screen === "choose"
            ? "party.backToLobby"
            : "party.leave",
      )}
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
        : [{ name: shownName.trim() || t("party.tag.you"), host: room.isHost, self: true, score: 0, away: false }],
    );
    const hostName = room.players.find((player) => player.host)?.name;
    return (
      <section className={clsx(styles.view, styles.waitView)} data-testid="private-room-wait">
        <h1 className="sr-only">{t("party.lobby.title")}</h1>
        <div className={styles.lobby}>
          {back}
          <header className={styles.lobbyHead}>
            <div>
              <small>{t("party.code")}</small>
              <strong data-testid="private-room-code">{room.code}</strong>
            </div>
            <button type="button" className={clsx(styles.ghost, styles.copyLink)} onClick={() => void copyLink()}>
              {copied ? <Check data-testid="private-room-copied" /> : <Copy />}
              {t("party.copyLink")}
            </button>
          </header>
          <div className={styles.playersBlock}>
            <p className={styles.sectionLabel}>
              <Users />
              {t("party.players")}
              <span data-testid="private-room-player-count">
                {roster.length}/{PRIVATE_ROOM_PLAYER_MAX}
              </span>
            </p>
            <div className={styles.playersScroll} data-testid="private-room-players-scroll">
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
                            placeholder={t("party.name.placeholder")}
                            autoComplete="nickname"
                            spellCheck={false}
                            aria-describedby={nameNotice ? "private-room-name-error" : undefined}
                            aria-label={t("party.name.placeholder")}
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
                    <span>{playerTagText(player)}</span>
                    {!room.waiting ? <em>{player.score}</em> : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className={styles.startSlot}>
            {room.isHost ? (
              <button
                type="button"
                className={styles.primary}
                data-testid="private-room-start"
                disabled={busy === "start" || countdownSeconds > 0}
                onClick={() => void startRoom()}
              >
                {t("party.start")}
              </button>
            ) : (
              <p className={styles.startWait} data-testid="private-room-host-wait">
                {hostName ? t("party.waiting.named", { name: hostName }) : t("party.waiting.host")}
              </p>
            )}
          </div>
          {error && errorField !== "name" ? (
            <p className={styles.error} role="alert" data-testid="private-room-error">
              {error}
            </p>
          ) : null}
          {chatPanel}
          {countdownSeconds > 0 ? (
            <p className={styles.countdown} data-testid="private-room-countdown" aria-live="polite">
              {countdownSeconds}
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  const codeField = (
    <div className={styles.codeField}>
      <label htmlFor="party-code-input" data-testid="private-room-code-label">
        {t("party.code")}
      </label>
      <input
        ref={joinInputRef}
        id="party-code-input"
        className={styles.codeInput}
        value={joinCode}
        maxLength={PRIVATE_ROOM_CODE_MAX}
        placeholder="ABC12"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={errorField === "code"}
        aria-describedby={error ? "party-code-error" : undefined}
        data-invalid={errorField === "code" ? "true" : undefined}
        data-testid="private-room-join-code"
        onChange={(event) => {
          setJoinCode(filterCode(event.currentTarget.value));
          setError(null);
          setErrorField(null);
        }}
      />
    </div>
  );

  const setupMessage = error ?? (screen === "choose" && notice ? t(notice as MessageKey) : null);
  const setupError = setupMessage ? (
    <p id="party-code-error" className={styles.error} role="alert" data-testid="private-room-error">
      {setupMessage}
    </p>
  ) : null;

  if (screen === "choose") {
    return (
      <section className={styles.view} data-testid="private-room-setup" data-path="choose">
        <h1 className={styles.setupTitle}>{t("party.setup.title")}</h1>
        <p className={styles.setupIntro}>{t("party.setup.intro")}</p>
        {back}
        {setupError}
        <div className={styles.chooseDoors}>
          <button
            type="button"
            className={styles.dashButton}
            data-testid="private-room-choose-create"
            onClick={() => {
              setError(null);
              setErrorField(null);
              onDismissNotice?.();
              setScreen("create");
            }}
          >
            {t("party.setup.create")}
          </button>
          <button
            type="button"
            className={styles.dashButton}
            data-testid="private-room-choose-join"
            onClick={() => {
              setError(null);
              setErrorField(null);
              onDismissNotice?.();
              setScreen("join");
            }}
          >
            {t("party.setup.join")}
          </button>
        </div>
      </section>
    );
  }

  if (screen === "join") {
    return (
      <section className={clsx(styles.view, styles.joinView)} data-testid="private-room-setup" data-path="join">
        <h1 className="sr-only">{t("party.setup.join")}</h1>
        {back}
        <div className={styles.enter}>
          {codeField}
          <button
            type="button"
            className={styles.dashButton}
            data-testid="private-room-join"
            aria-busy={busy === "join"}
            disabled={busy !== null}
            onClick={() => void joinRoom()}
          >
            <span className={styles.enterFace} data-show={busy === "join" ? "false" : "true"}>
              {t("party.join")}
            </span>
            <span className={styles.enterFace} data-show={busy === "join" ? "true" : "false"}>
              {t("party.joining")}
            </span>
          </button>
          {setupError}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.view} data-testid="private-room-setup" data-path="create">
      <h1 className="sr-only">{t("party.setup.create")}</h1>
      {back}
      <div
        className={clsx(formatPreviewCardStyles.cardGrid, styles.games)}
        role="group"
        aria-label={t("party.games")}
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
        {codeField}
        <button
          type="button"
          className={styles.dashButton}
          data-testid="private-room-create"
          aria-busy={busy === "create"}
          disabled={busy !== null}
          onClick={() => void createRoom()}
        >
          <span className={styles.enterFace} data-show={busy === "create" ? "false" : "true"}>
            {t("party.create")}
          </span>
          <span className={styles.enterFace} data-show={busy === "create" ? "true" : "false"}>
            {t("party.creating")}
          </span>
        </button>
        {setupError}
      </div>
    </section>
  );
}
