#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { publicQuestionForRound } from "../src/lib/public-question.mjs";
import { DOTA_FEEDBACK_SOUNDS } from "../src/lib/feedback-sounds.mjs";
import { click, delay, soundBrowser } from "./lib/feedback-browser.mjs";
import { installSoundFixtures } from "./lib/feedback-sound-probe.mjs";
import { nativeAudioOutput, sampleEnergy, subtractWaveform, wavChannels } from "./lib/native-audio-output.mjs";

const fault = process.argv.find((arg) => arg.startsWith("--fault="))?.split("=")[1] ?? "";
if (!fault && !process.argv.includes("--skip-controls")) {
  for (const control of ["raw-lock", "double-result"]) {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), `--fault=${control}`], {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      child.stdout.on("data", (data) => {
        output += data;
      });
      child.stderr.on("data", (data) => {
        output += data;
      });
      child.on("error", reject);
      child.on("exit", (code) => resolve({ code, output }));
    });
    assert(
      result.code === 1 && result.output.includes("NATIVE PCM FAIL"),
      `Native negative control ${control} did not detect bad output: ${result.output}`,
    );
    console.log(`Native output check rejects ${control}.`);
  }
  if (process.argv.includes("--self-test")) process.exit(0);
}

const data = async (name) => JSON.parse(await readFile(new URL(`../src/data/${name}.json`, import.meta.url)));
const [shop, aghanim] = await Promise.all([data("shopkeeper-questions"), data("aghanim-questions")]);
const cases = [
  ["Shopkeeper first recipe pick", "shopkeeper", shop.find((q) => q.id === "shopkeeper-recipe:bloodstone")],
  ["Shopkeeper first answer pick", "shopkeeper", shop.find((q) => q.kind === "shopkeeper-build-result")],
  ["Aghanim first answer pick", "aghanim-lab", aghanim[0]],
];
const references = Object.fromEntries(
  await Promise.all(
    Object.entries(DOTA_FEEDBACK_SOUNDS).map(async ([kind, definition]) => [
      kind,
      await Promise.all(
        definition.clips.map(async (clip) => ({
          channels: wavChannels(await readFile(new URL(`../public${clip.src}`, import.meta.url))),
          gain: clip.gain,
        })),
      ),
    ]),
  ),
);
const output = await nativeAudioOutput();
const failures = [];
let checks = 0;
const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Observe calls without routing media through Web Audio. Return the ORIGINAL
// play promise. The injected controls still use native decoders and output.
function observeNativeAudio(fault) {
  const nativePlay = HTMLMediaElement.prototype.play;
  const NativeAudio = window.Audio;
  const calls = [];
  if (fault === "raw-lock") {
    window.Audio = function (...args) {
      if (String(args[0]).includes("button_click"))
        args[0] = "/assets/dota2/sounds/panorama_generic_button_click_01.wav";
      return new NativeAudio(...args);
    };
    window.Audio.prototype = NativeAudio.prototype;
  }
  HTMLMediaElement.prototype.play = function (...args) {
    const call = { src: this.src, at: performance.now(), volume: this.volume };
    calls.push(call);
    const request = nativePlay.apply(this, args);
    request.then(
      () => {
        call.resolved = true;
      },
      (error) => {
        call.error = error.name;
      },
    );
    if (fault === "double-result" && this.src.includes("magic_immune")) {
      const copy = new NativeAudio(this.src);
      copy.volume = this.volume;
      setTimeout(() => {
        void nativePlay.call(copy).catch(() => {});
      }, 75);
    }
    return request;
  };
  window.__nativeAudioCalls = calls;
}

async function open(page, testCase) {
  const [, game, raw] = testCase;
  assert(raw, `Missing native sound fixture: ${testCase[0]}`);
  const fixtures = {
    first: Object.fromEntries(
      ["answering", "reveal"].map((phase) => [
        phase,
        publicQuestionForRound(
          raw,
          { id: "first", game, phase, answerDeadline: Date.now() + 15_000, answerDuration: 15_000 },
          Date.now(),
        ),
      ]),
    ),
  };
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(${installSoundFixtures.toString()})(${JSON.stringify(fixtures)}); (${observeNativeAudio.toString()})(${JSON.stringify(fault)});`,
  });
  await page.send("Page.navigate", { url: `${appUrl}/play` });
  await page.waitFor('document.querySelector("main")?.dataset.phase === "answering"');
  const key = fixtures.first.reveal.reveal.correctAnswerKey;
  const selector =
    game === "shopkeeper"
      ? `[data-testid="shopkeeper-store-item"]:not([data-item-key="${key}"])`
      : `[data-testid="hero-picker-hero"]:not([data-hero-key="${key}"])`;
  await page.waitFor(`document.querySelector(${JSON.stringify(selector)}) !== null`);
  return async () => {
    await click(page, selector);
    if (raw.kind === "shopkeeper-real-recipe") {
      await page.waitFor(
        'document.querySelectorAll("[data-testid=shopkeeper-recipe-slot]:not([data-empty=true])").length === 1',
      );
    } else await page.waitFor("window.__soundFixture.vote() !== null");
  };
}

async function measure(label, page, kinds, act, duration = 2_100) {
  // The marker is in the external recording, not in a substituted audio node.
  const mark = output.mark();
  const callsBefore = await page.evaluate("window.__nativeAudioCalls.length");
  await act();
  await delay(duration);
  const channels = output.read(mark);
  const volume = await page.evaluate('Number(document.querySelector("[data-testid=game-volume]").value) / 100');
  const clips = kinds
    .flatMap((kind) => references[kind])
    .sort((a, b) => sampleEnergy(b.channels[0]) - sampleEnergy(a.channels[0]));
  const metrics = channels.map((samples, channel) => {
    const energy = sampleEnergy(samples);
    let expectedEnergy = 0;
    const fits = clips.map((clip) => {
      const reference = Float64Array.from(
        clip.channels[channel] ?? clip.channels[0],
        (value) => value * volume * clip.gain,
      );
      expectedEnergy += sampleEnergy(reference);
      return subtractWaveform(samples, reference);
    });
    return {
      energy: energy / expectedEnergy,
      residual: sampleEnergy(samples) / expectedEnergy,
      gains: fits.map((fit) => fit.gain),
    };
  });
  const ok = metrics.every(
    (metric) => metric.residual < 0.03 && metric.gains.every((gain) => gain > 0.9 && gain < 1.1),
  );
  if (!ok) {
    const calls = await page.evaluate(`window.__nativeAudioCalls.slice(${callsBefore})`);
    failures.push(label);
    console.error(`NATIVE PCM FAIL ${label}: ${JSON.stringify({ metrics, calls })}`);
  } else {
    checks++;
    console.log(`Native PCM ok: ${label} (both output channels, full waveform, no extra copy)`);
  }
}

try {
  for (const testCase of fault ? (fault === "raw-lock" ? [cases[1]] : []) : cases) {
    const client = await soundBrowser({ muteAudio: false, env: output.env });
    try {
      const pick = await open(client.page, testCase);
      await measure(testCase[0], client.page, ["lock"], pick, 1_000);
      if (testCase[2].kind !== "shopkeeper-real-recipe" && !fault) {
        await measure(`${testCase[0]} wrong result`, client.page, ["wrong"], () =>
          client.page.evaluate("window.__soundFixture.reveal()"),
        );
      }
    } finally {
      await client.close();
    }
  }
  if (fault !== "raw-lock") {
    const client = await soundBrowser({ muteAudio: false, env: output.env });
    try {
      const pickOld = await open(client.page, cases[2]);
      await pickOld();
      await delay(1_000);
      const second = await client.newPage();
      const pickNew = await open(second.page, cases[2]);
      // This origin already has a user gesture, so let its entry cue finish.
      await delay(1_400);
      await pickNew();
      await delay(1_000);
      await client.page.waitFor("document.hidden === true");
      await measure("wrong result with two game tabs", second.page, ["wrong"], async () => {
        await second.page.evaluate("window.__soundFixture.reveal()");
        await second.page.waitFor('document.querySelector("main")?.dataset.phase === "reveal"');
        await delay(75);
        await client.page.evaluate("window.__soundFixture.reveal()");
      });
      if (!fault) {
        const mark = output.mark();
        await client.browser.send("Target.activateTarget", { targetId: client.targetId });
        await client.page.waitFor("document.hidden === false");
        await delay(500);
        assert(
          output.read(mark).every((channel) => sampleEnergy(channel) < 0.00001),
          "Returning to the older tab replayed a stale result",
        );
        await client.page.evaluate('window.__soundFixture.set("first")');
        await client.page.waitFor('document.querySelector("main")?.dataset.phase === "answering"');
        await measure("pick after tab ownership returns", client.page, ["lock"], pickOld, 1_000);
        await measure("result after tab ownership returns", client.page, ["wrong"], () =>
          client.page.evaluate("window.__soundFixture.reveal()"),
        );
      }
    } finally {
      await client.close();
    }
  }
} finally {
  await output.close();
}
assert.equal(failures.length, 0, `NATIVE PCM FAIL: ${failures.join(", ")}`);
console.log(
  `Native feedback output holds: ${checks} checks. Cold first picks and the combined output of two live tabs.`,
);
