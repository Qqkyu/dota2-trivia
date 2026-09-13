// Runs before the real /play client. Only room data is replaced. Audio uses the
// browser's native decoder, autoplay policy and audio thread, through a PCM tap.
export function installSoundProbe(fixtures, fault) {
  const nativeFetch = window.fetch.bind(window);
  const crowd = { counts: [0, 0, 0, 0], total: 0, keyCounts: [], scoreSummary: null };
  const json = (value) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
  let sequence = 0;
  let firstRequest = true;
  let state;
  const wake = () => window.dispatchEvent(new Event("online"));
  window.__soundFixture = {
    set(name, options = {}) {
      state = {
        name,
        id: `sound-${++sequence}`,
        deadline: Date.now() + 60_000,
        vote: null,
        reveal: false,
        ...options,
      };
      wake();
      return state.id;
    },
    reveal() {
      state.reveal = true;
      wake();
    },
    vote: () => state.vote,
  };
  window.__soundFixture.set(Object.keys(fixtures)[0]);
  window.fetch = async (...args) => {
    const input = args[0];
    const path = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url, location.href)
      .pathname;
    if (!path.startsWith("/api/")) return nativeFetch(...args);
    if (path === "/api/me") return json({ authenticated: false });
    if (path === "/api/votes") {
      const body = JSON.parse(args[1].body);
      state.vote = {
        answerIndex: body.answerIndex,
        submittedAt: Date.now(),
        ...(body.answerKey ? { answerKey: body.answerKey } : {}),
      };
      if (state.revealOnVote) {
        state.reveal = true;
        // A reveal delivered right after a last-moment vote uses the same UI
        // callbacks as the normal room deadline, without a 15-second wait.
        setTimeout(wake, 0);
      }
      return json({ accepted: true, ...crowd, playerVote: state.vote });
    }
    if (path !== "/api/rounds") return json({ activePlayers: 1 });
    const now = Date.now();
    const gate = firstRequest;
    firstRequest = false;
    const question = fixtures[state.name][state.reveal ? "reveal" : "answering"];
    const id = gate ? "sound-entry-gate" : state.id;
    return json({
      serverNow: now,
      room: { id: "sound-check", gameId: "dota2", contentVersion: "sound-check", mode: "mixed", filter: "Mixed" },
      round: {
        id,
        number: sequence,
        phase: gate || state.reveal ? "reveal" : "answering",
        game: question.game,
        startedAt: state.deadline - 15_000,
        answerDeadline: gate || state.reveal ? now - 100 : state.deadline,
        revealDeadline: gate ? now + 100 : now + 60_000,
        answerDuration: 15_000,
      },
      questionRevision: `${id}:${state.reveal ? "reveal" : "answering"}`,
      question: gate ? null : { ...question, id },
      presence: { activePlayers: 1 },
      crowd,
      playerVote: state.vote,
      playerReport: null,
    });
  };

  const NativeAudio = window.Audio;
  const nativePlay = HTMLMediaElement.prototype.play;
  const context = new AudioContext({ sampleRate: 44_100 });
  const voices = [];
  const elements = new WeakMap();
  const log = [];
  const references = new Map();
  let intent = null;
  const workletSource = `class Meter extends AudioWorkletProcessor {
    process(inputs, outputs) {
      const input = inputs[0] ?? [], output = outputs[0] ?? [];
      for (let ch = 0; ch < output.length; ch++) if (input[ch]) output[ch].set(input[ch]);
      let energy = 0, samples = 0;
      for (const value of input[0] ?? []) { energy += value * value; if (Math.abs(value) > 0.0001) samples++; }
      if (energy > 0) this.port.postMessage({ energy, samples });
      return true;
    }
  }
  registerProcessor("sound-meter", Meter);`;
  const moduleUrl = URL.createObjectURL(new Blob([workletSource], { type: "text/javascript" }));
  const ready = context.audioWorklet.addModule(moduleUrl).then(() => URL.revokeObjectURL(moduleUrl));
  const unlock = (event) => {
    if (event.isTrusted && context.state !== "running") void context.resume();
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  window.Audio = function (...args) {
    const audio = new NativeAudio(...args);
    const record = { id: voices.length, src: String(args[0]), energy: 0, samples: 0, plays: 0, ended: false };
    voices.push(record);
    elements.set(audio, record);
    ready.then(() => {
      const source = context.createMediaElementSource(audio);
      const meter = new AudioWorkletNode(context, "sound-meter", { outputChannelCount: [2] });
      meter.port.onmessage = ({ data }) => {
        record.energy += data.energy;
        record.samples += data.samples;
        if (data.samples && record.firstSampleAt === undefined) record.firstSampleAt = performance.now();
      };
      source.connect(meter).connect(context.destination);
      const disconnect = () =>
        setTimeout(() => {
          source.disconnect();
          meter.disconnect();
        }, 100);
      audio.addEventListener("ended", disconnect, { once: true });
      audio.addEventListener("error", disconnect, { once: true });
    });
    audio.addEventListener("ended", () => {
      record.ended = true;
    });
    audio.addEventListener("pause", () => {
      record.pausedAt = audio.currentTime;
    });
    return audio;
  };
  window.Audio.prototype = NativeAudio.prototype;
  HTMLMediaElement.prototype.play = function () {
    const record = elements.get(this);
    if (!record) return nativePlay.apply(this, arguments);
    record.plays++;
    record.intent = intent;
    record.calledAt = performance.now();
    record.volume = this.volume;
    // Negative controls: both fooled a play()-promise-only check.
    if (fault === "silent-lock" && record.src.includes("button_click")) this.muted = true;
    const request = nativePlay.apply(this, arguments);
    return request.then(
      () => {
        record.started = true;
        if (fault === "cut-lock" && record.src.includes("button_click")) this.pause();
      },
      (error) => {
        record.error = error.name;
        throw error;
      },
    );
  };
  window.__soundProbe = {
    ready,
    mark(label) {
      intent = label;
      return performance.now();
    },
    snapshot: () => ({ context: context.state, hidden: document.hidden, voices, log }),
    async reference(src) {
      if (!references.has(src)) {
        const buffer = await context.decodeAudioData(await (await nativeFetch(src)).arrayBuffer());
        let energy = 0;
        for (const value of buffer.getChannelData(0)) energy += value * value;
        references.set(src, energy);
      }
      return references.get(src);
    },
  };
}
