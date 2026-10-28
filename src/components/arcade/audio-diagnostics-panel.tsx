import { useEffect, useState, useSyncExternalStore } from "react";
import {
  audioDiagnosticsEnabled,
  audioEvents,
  audioProbe,
  clearAudioEvents,
  recordAudioEvent,
  subscribeAudioEvents,
} from "@/lib/audio-diagnostics.mjs";
import own from "./audio-diagnostics-panel.module.css";

type Cue = "lock" | "correct" | "wrong" | "start";
const CUES: Cue[] = ["lock", "correct", "wrong", "start"];

type AudioEvent = { seq: number; at: number; kind: string } & Record<string, unknown>;

function describe(event: AudioEvent) {
  return Object.entries(event)
    .filter(([key, value]) => !["seq", "at", "kind"].includes(key) && value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" ");
}

/**
 * Sound diagnostics, on at `?audio-debug=1`. Shows what the arcade asked the
 * browser to play and what the browser answered, lets the player fire the four
 * cues in a row, and copies the whole log as JSON for a bug report.
 */
export function AudioDiagnosticsPanel({
  playSound,
  soundEnabled,
  gameVolume,
}: {
  playSound: (kind: Cue) => void;
  soundEnabled: boolean;
  gameVolume: number;
}) {
  const enabled = useSyncExternalStore(
    () => () => undefined,
    () => audioDiagnosticsEnabled(),
    () => false,
  );
  const [events, setEvents] = useState<AudioEvent[]>(() => audioEvents() as AudioEvent[]);
  const [probe, setProbe] = useState({ focus: true, hidden: false, owner: null as boolean | null, keepAlive: "none" });
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!enabled) return;
    const stop = subscribeAudioEvents(() => setEvents(audioEvents() as AudioEvent[]));
    const timer = window.setInterval(() => {
      setProbe({
        focus: document.hasFocus(),
        hidden: document.hidden,
        owner: typeof audioProbe.owner === "function" ? audioProbe.owner() : null,
        keepAlive: audioProbe.keepAlive,
      });
    }, 500);
    return () => {
      stop();
      window.clearInterval(timer);
    };
  }, [enabled]);

  if (!enabled) return null;

  const testCues = () => {
    recordAudioEvent("test", { note: "cue sequence: lock, correct, wrong, start" });
    CUES.forEach((cue, index) => window.setTimeout(() => playSound(cue), index * 900));
  };
  const copyLog = () => {
    const text = JSON.stringify(
      { at: new Date().toISOString(), userAgent: navigator.userAgent, probe, soundEnabled, gameVolume, events },
      null,
      1,
    );
    void navigator.clipboard?.writeText(text).then(
      () => setNote("Log copied. Paste it into the chat."),
      () => setNote("Copy failed. Select the log by hand."),
    );
  };
  const first = events[0]?.at ?? 0;

  return (
    <aside className={own.panel} data-testid="audio-diagnostics" aria-label="Sound diagnostics">
      <div className={own.head}>
        <strong>Sound diagnostics</strong>
        <span>
          <button type="button" onClick={testCues}>
            Test cues
          </button>
          <button type="button" onClick={copyLog}>
            Copy log
          </button>
          <button type="button" onClick={clearAudioEvents}>
            Clear
          </button>
        </span>
      </div>
      <div className={own.status}>
        focus={String(probe.focus)} hidden={String(probe.hidden)} owner={String(probe.owner)} keepAlive=
        {probe.keepAlive} sounds={soundEnabled ? "on" : "off"} volume={Math.round(gameVolume * 100)}%
        {note ? ` · ${note}` : ""}
      </div>
      <ol className={own.log}>
        {events
          .slice(-40)
          .reverse()
          .map((event) => (
            <li key={event.seq} data-kind={event.kind}>
              <span>+{((event.at - first) / 1000).toFixed(1)}s</span> <b>{event.kind}</b> {describe(event)}
            </li>
          ))}
      </ol>
    </aside>
  );
}
