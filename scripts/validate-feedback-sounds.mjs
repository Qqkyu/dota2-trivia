import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { answerFeedbackKind, DOTA_FEEDBACK_SOUNDS, dotaFeedbackSoundForKind } from "../src/lib/feedback-sounds.mjs";
import { createFeedbackPlayer, FEEDBACK_SOUND_KINDS } from "../src/lib/feedback-player.mjs";

const failures = [];
const componentPath = fileURLToPath(new URL("../src/components/queue-arcade.tsx", import.meta.url));
const component = await readFile(componentPath, "utf8");
const expectedKinds = ["lock", "correct", "wrong", "start"];
const expectedEvents = {
  lock: "ui_generic_button_click",
  correct: "General.Coins",
  wrong: "General.InvalidTarget_Invulnerable",
  start: "ui.matchmaking_find",
};
const expectedGains = {
  lock: [0.8],
  correct: [1],
  wrong: [1],
  start: [0.6, 1],
};
const seenSources = new Set();
let clipCount = 0;

if (JSON.stringify(Object.keys(DOTA_FEEDBACK_SOUNDS)) !== JSON.stringify(expectedKinds)) {
  failures.push("Every runtime UI cue must have one explicit Dota sound definition.");
}

for (const [kind, definition] of Object.entries(DOTA_FEEDBACK_SOUNDS)) {
  if (
    definition.event !== expectedEvents[kind] ||
    JSON.stringify(definition.clips.map((clip) => clip.gain)) !== JSON.stringify(expectedGains[kind])
  ) {
    failures.push(`${kind} no longer mirrors its reviewed Dota event and gain structure.`);
  }

  if (dotaFeedbackSoundForKind(kind) !== definition) {
    failures.push(`${kind} no longer resolves to its Dota UI cue.`);
  }

  for (const clip of definition.clips) {
    clipCount += 1;
    if (seenSources.has(clip.src)) failures.push(`${clip.src} is reused by multiple UI cue definitions.`);
    seenSources.add(clip.src);

    const soundPath = fileURLToPath(new URL(`../public${clip.src}`, import.meta.url));
    const sound = await readFile(soundPath);
    if (sound.subarray(0, 4).toString("ascii") !== "RIFF" || sound.subarray(8, 12).toString("ascii") !== "WAVE") {
      failures.push(`The ${kind} feedback asset ${clip.src} is not a valid RIFF/WAVE file.`);
    }

    const digest = createHash("sha256").update(sound).digest("hex");
    if (digest !== clip.sha256) {
      failures.push(`The ${kind} feedback asset hash changed: expected ${clip.sha256}, received ${digest}.`);
    }
  }
}

if (clipCount !== 5 || dotaFeedbackSoundForKind("not-a-cue") !== null) {
  failures.push("The reviewed four-event, five-clip Dota UI sound set changed unexpectedly.");
}

if (answerFeedbackKind(true) !== "correct" || answerFeedbackKind(false) !== "wrong") {
  failures.push("Answer results no longer map to the expected feedback kinds.");
}

const resultCalls = component.match(/playSound\(answerFeedbackKind\(isCorrect\)\)/g) ?? [];
const startCalls = component.match(/playSound\("start"\)/g) ?? [];
const lockCalls = component.match(/playSound\("lock"\)/g) ?? [];
if (
  resultCalls.length !== 1 ||
  startCalls.length !== 1 ||
  lockCalls.length !== 2 ||
  component.includes('playSound("correct")') ||
  component.includes('playSound("wrong")')
) {
  failures.push("UI cues are no longer confined to their reviewed start, lock, and finalized-result triggers.");
}

if (/AudioContext|createOscillator|createGain/.test(component)) {
  failures.push("A synthesized Web Audio cue remains in the arcade runtime.");
}

if (
  component.includes("feedbackAudioRef") ||
  !component.includes("createFeedbackPlayer") ||
  !component.includes("feedbackPlayerRef.current?.preload") ||
  !component.includes("feedbackPlayerRef.current?.play") ||
  !component.includes("feedbackPlayerRef.current?.pauseAll") ||
  !component.includes("feedbackPlayerRef.current?.resumeIfNeeded") ||
  !component.includes("feedbackPlayerRef.current?.clearPending") ||
  !component.includes("const DEFAULT_GAME_VOLUME = 0.7") ||
  component.includes("const DEFAULT_GAME_VOLUME = 0.1")
) {
  failures.push(
    "Arcade feedback still points at a removed audio ref, skips the preloaded board, or defaults to an inaudible volume.",
  );
}

class FakeAudio {
  constructor(src) {
    this.src = src;
    this.preload = "";
    this.volume = 1;
    this.currentTime = 0;
    this.paused = true;
    this.plays = 0;
    this.pauses = 0;
  }
  play() {
    this.paused = false;
    this.plays += 1;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.pauses += 1;
  }
}

const constructed = [];
const player = createFeedbackPlayer({
  AudioCtor: class extends FakeAudio {
    constructor(src) {
      super(src);
      constructed.push(this);
    }
  },
});

player.preload();
if (!FEEDBACK_SOUND_KINDS.every((kind) => player.has(kind)) || constructed.length !== 5) {
  failures.push("Feedback sounds are not all preloaded before the first pick.");
}

const firstLock = player.play("lock", { enabled: true, volume: 1 });
const afterWrong = player.play("wrong", { enabled: true, volume: 1 });
const secondLock = player.play("lock", { enabled: true, volume: 1 });
const lockClips = constructed.filter((audio) => audio.src.includes("button_click"));
const wrongClips = constructed.filter((audio) => audio.src.includes("magic_immune"));
if (!firstLock.played || !afterWrong.played || !secondLock.played) {
  failures.push("A feedback kind failed to play.");
}
if (constructed.length !== 5 || lockClips[0]?.plays !== 2 || wrongClips[0]?.plays !== 1) {
  failures.push("Pick sound still rebuilds audio after a result and can miss the next lock.");
}
if (!(lockClips[0]?.paused === false && wrongClips.every((audio) => audio.paused && audio.currentTime === 0))) {
  failures.push("Wrong and lock cues can still overlap and sound hollow.");
}
if (player.play("lock", { enabled: true, volume: 0 }).played !== false) {
  failures.push("Muted volume still starts a cue.");
}

class AbortOnPauseAudio {
  constructor(src) {
    this.src = src;
    this.preload = "auto";
    this.volume = 1;
    this.currentTime = 0;
    this.paused = true;
    this.plays = 0;
    this.pending = [];
  }
  play() {
    this.plays += 1;
    this.paused = false;
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
    });
  }
  pause() {
    this.paused = true;
    const waiters = this.pending.splice(0);
    for (const waiter of waiters) {
      waiter.reject(
        Object.assign(new Error("The play() request was interrupted by a call to pause()."), { name: "AbortError" }),
      );
    }
  }
}

const lateCues = [];
const latePlayer = createFeedbackPlayer({
  AudioCtor: class extends AbortOnPauseAudio {
    constructor(src) {
      super(src);
      lateCues.push(this);
    }
  },
});
latePlayer.preload();
latePlayer.play("start", { enabled: true, volume: 1 });
const startCues = lateCues.filter(
  (audio) => String(audio.src).includes("find_match") || String(audio.src).includes("select_md"),
);
const startPlaysAtLock = startCues.reduce((sum, audio) => sum + audio.plays, 0);
latePlayer.play("lock", { enabled: true, volume: 1 });
await new Promise((resolve) => setTimeout(resolve, 60));
const startPlaysAfterLock = startCues.reduce((sum, audio) => sum + audio.plays, 0);
if (startPlaysAfterLock > startPlaysAtLock) {
  failures.push("A paused start cue retried after the lock click and sounded late or hollow.");
}
const lockAfterStart = lateCues.find((audio) => String(audio.src).includes("button_click"));
if (!lockAfterStart || lockAfterStart.plays < 1 || lockAfterStart.paused !== false) {
  failures.push("Lock did not play after start was still running.");
}

latePlayer.play("wrong", { enabled: true, volume: 1 });
const lockPlaysAtWrong = lockAfterStart.plays;
await new Promise((resolve) => setTimeout(resolve, 60));
if (lockAfterStart.plays > lockPlaysAtWrong) {
  failures.push("A paused lock cue retried during the result and sounded like a cave.");
}

class ChromePauseThenPlayAudio {
  constructor(src) {
    this.src = src;
    this.preload = "auto";
    this.volume = 1;
    this.currentTime = 0;
    this.paused = true;
    this.plays = 0;
    this.started = 0;
    this.pausedRecently = false;
  }
  play() {
    this.plays += 1;
    if (this.pausedRecently) {
      this.pausedRecently = false;
      this.paused = true;
      return Promise.reject(
        Object.assign(new Error("The play() request was interrupted by a call to pause()."), { name: "AbortError" }),
      );
    }
    this.paused = false;
    this.started += 1;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.pausedRecently = true;
  }
}

const caveClips = [];
const cavePlayer = createFeedbackPlayer({
  AudioCtor: class extends ChromePauseThenPlayAudio {
    constructor(src) {
      super(src);
      caveClips.push(this);
    }
  },
});
cavePlayer.play("wrong", { enabled: true, volume: 1 });
await new Promise((resolve) => setTimeout(resolve, 60));
const caveWrong = caveClips.find((audio) => String(audio.src).includes("magic_immune"));
if (!caveWrong || caveWrong.plays !== 1 || caveWrong.started !== 1 || caveWrong.paused !== false) {
  failures.push(
    `Wrong cue stacked on itself (${caveWrong?.plays ?? 0} play calls, ${caveWrong?.started ?? 0} started) and sounded like a cave.`,
  );
}

class FirstPlayAbortsAudio {
  constructor(src) {
    this.src = src;
    this.preload = "auto";
    this.volume = 1;
    this.currentTime = 0;
    this.paused = true;
    this.plays = 0;
    this.started = 0;
  }
  play() {
    this.plays += 1;
    if (this.plays === 1) {
      this.paused = true;
      return Promise.reject(
        Object.assign(new Error("The play() request was interrupted by a call to pause()."), { name: "AbortError" }),
      );
    }
    this.paused = false;
    this.started += 1;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

const abortThenPlay = [];
const abortThenPlayPlayer = createFeedbackPlayer({
  AudioCtor: class extends FirstPlayAbortsAudio {
    constructor(src) {
      super(src);
      abortThenPlay.push(this);
    }
  },
});
abortThenPlayPlayer.play("lock", { enabled: true, volume: 1 });
await new Promise((resolve) => setTimeout(resolve, 40));
const recoveredLock = abortThenPlay.find((audio) => String(audio.src).includes("button_click"));
if (!recoveredLock || recoveredLock.started !== 1 || recoveredLock.paused !== false) {
  failures.push(
    `Lock stayed silent after Chrome aborted the first play() (${recoveredLock?.plays ?? 0} calls, ${recoveredLock?.started ?? 0} started).`,
  );
}

class PlayingSkipAudio {
  constructor(src) {
    this.src = src;
    this.preload = "auto";
    this.volume = 1;
    this._time = 4;
    this.paused = false;
    this.readyState = 0;
    this.plays = 0;
  }
  play() {
    this.plays += 1;
    this.paused = false;
    this._time = 0;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  set currentTime(_value) {
    throw new Error("The HTMLMediaElement has not loaded.");
  }
  get currentTime() {
    return this._time;
  }
}

const stuck = [];
const stuckPlayer = createFeedbackPlayer({
  AudioCtor: class extends PlayingSkipAudio {
    constructor(src) {
      super(src);
      stuck.push(this);
    }
  },
});
stuckPlayer.preload();
const stuckLock = stuck.find((audio) => String(audio.src).includes("button_click"));
if (stuckLock) stuckLock.paused = false;
stuckPlayer.play("lock", { enabled: true, volume: 1 });
if (!stuckLock || stuckLock.plays < 1) {
  failures.push("A lock clip that looked like it was still playing never got play() and stayed silent.");
}

const throwing = [];
const hardy = createFeedbackPlayer({
  AudioCtor: class {
    constructor(src) {
      this.src = src;
      this.preload = "auto";
      this.volume = 1;
      this.readyState = 0;
      this.plays = 0;
      throwing.push(this);
    }
    play() {
      this.plays += 1;
      return Promise.resolve();
    }
    pause() {}
    set currentTime(_value) {
      throw new Error("The HTMLMediaElement has not loaded.");
    }
    get currentTime() {
      return 0;
    }
  },
});
const hardyPlay = hardy.play("wrong", { enabled: true, volume: 1 });
const hardyWrong = throwing.find((audio) => String(audio.src).includes("magic_immune"));
if (!hardyPlay.played || hardyWrong?.plays !== 1) {
  failures.push("A not-ready clip still blocks the next feedback sound.");
}

const hiddenClips = [];
let tabHidden = true;
const hiddenPlayer = createFeedbackPlayer({
  AudioCtor: class extends FakeAudio {
    constructor(src) {
      super(src);
      hiddenClips.push(this);
    }
  },
  isHidden: () => tabHidden,
});
hiddenPlayer.play("wrong", { enabled: true, volume: 1 });
const hiddenWrong = hiddenClips.find((audio) => String(audio.src).includes("magic_immune"));
await new Promise((resolve) => setTimeout(resolve, 0));
hiddenWrong.paused = true;
hiddenWrong.currentTime = 0;
tabHidden = false;
const heardReplay = hiddenPlayer.resumeIfNeeded();
if (heardReplay.played || hiddenWrong.plays !== 1) {
  failures.push("A result that already played in the background played again when the tab came back.");
}

const blockedClips = [];
let blockedHidden = true;
const blockedPlayer = createFeedbackPlayer({
  AudioCtor: class extends FakeAudio {
    constructor(src) {
      super(src);
      blockedClips.push(this);
    }
    play() {
      this.plays += 1;
      return Promise.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));
    }
  },
  isHidden: () => blockedHidden,
});
blockedPlayer.play("wrong", { enabled: true, volume: 1 });
const blockedWrong = blockedClips.find((audio) => String(audio.src).includes("magic_immune"));
await new Promise((resolve) => setTimeout(resolve, 0));
blockedHidden = false;
blockedWrong.play = FakeAudio.prototype.play;
const recovered = blockedPlayer.resumeIfNeeded();
if (!recovered.played || blockedWrong.plays < 2) {
  failures.push("A result that failed while hidden did not play when the tab became visible.");
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(
  "Validated four Dota UI events, five original WAVs, exclusive preloaded playback, and zero synthesized runtime cues.",
);
