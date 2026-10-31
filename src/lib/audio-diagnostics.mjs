/**
 * A small in-page log of every sound the arcade asked the browser to play and
 * what came back: the cue kind, whether the player accepted it, why it skipped,
 * whether the browser started it, plus focus, tab ownership and the output
 * keep-alive state at that moment. The panel at `?audio-debug=1` renders it and
 * copies it as JSON, so a silent pick on a real speaker can be read instead of
 * guessed at. Recording is cheap and always on; the panel is opt-in.
 */
const MAX_EVENTS = 300;
const STORAGE_KEY = "queue-arcade:audio-debug";
const events = [];
const listeners = new Set();
let sequence = 0;

/**
 * Live probes the audio hooks keep current for the panel.
 * @type {{ keepAlive: string, owner: (() => boolean) | null }}
 */
export const audioProbe = { keepAlive: "none", owner: null };

export function recordAudioEvent(kind, detail = {}) {
  const event = { seq: (sequence += 1), at: Date.now(), kind, ...detail };
  events.push(event);
  if (events.length > MAX_EVENTS) events.shift();
  for (const listener of listeners) listener(event);
  return event;
}

export function audioEvents() {
  return events.slice();
}

export function clearAudioEvents() {
  events.length = 0;
  for (const listener of listeners) listener(null);
}

export function subscribeAudioEvents(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * `?audio-debug=1` turns the panel on for this browser until `?audio-debug=0`
 * turns it off. The flag lives in localStorage, so a new tab, a reload or the
 * client-side move to /play keeps the panel; `withAudioDebug` also keeps the
 * query on the URL so the state stays visible.
 */
export function audioDiagnosticsEnabled() {
  if (typeof window === "undefined") return false;
  try {
    const flag = new URLSearchParams(window.location.search).get("audio-debug");
    if (flag === "1") window.localStorage.setItem(STORAGE_KEY, "1");
    if (flag === "0") window.localStorage.removeItem(STORAGE_KEY);
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

const KEEP_ALIVE_KEY = "queue-arcade:keep-alive";
const KEEP_ALIVE_MODES = ["tone", "silence", "off"];
const modeListeners = new Set();

/**
 * What the output keep-alive plays while a round is live: a 20 Hz tone
 * (default; a speaker cannot reproduce it, but it keeps the amplifier from
 * idling), digital silence (keeps the stream open only), or nothing. The panel
 * switches it so a silent pick can be compared across the three.
 */
export function keepAliveMode() {
  if (typeof window === "undefined") return "tone";
  try {
    const stored = window.localStorage.getItem(KEEP_ALIVE_KEY);
    return KEEP_ALIVE_MODES.includes(stored) ? stored : "tone";
  } catch {
    return "tone";
  }
}

export function setKeepAliveMode(mode) {
  if (!KEEP_ALIVE_MODES.includes(mode)) return;
  try {
    window.localStorage.setItem(KEEP_ALIVE_KEY, mode);
  } catch {
    // Storage can be disabled; the hook falls back to the default.
  }
  recordAudioEvent("keepalive-mode", { mode });
  for (const listener of modeListeners) listener();
}

export function subscribeKeepAliveMode(listener) {
  modeListeners.add(listener);
  return () => modeListeners.delete(listener);
}

/** Keep `?audio-debug=1` on in-app navigation while the panel is on. */
export function withAudioDebug(href) {
  if (!audioDiagnosticsEnabled() || typeof href !== "string") return href;
  return href.includes("audio-debug=") ? href : `${href}${href.includes("?") ? "&" : "?"}audio-debug=1`;
}
