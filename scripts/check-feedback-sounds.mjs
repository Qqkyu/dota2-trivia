#!/usr/bin/env node

/**
 * Deterministic UI -> native media -> PCM check. No speakers, API writes,
 * autoplay exemptions, fake successful play(), or random format coverage.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { publicQuestionForRound } from "../src/lib/public-question.mjs";
import { DOTA_FEEDBACK_SOUNDS } from "../src/lib/feedback-sounds.mjs";
import { valueOrderAnswerKey } from "../src/lib/value-order.mjs";
import { click, delay, press, soundBrowser } from "./lib/feedback-browser.mjs";
import { installSoundProbe } from "./lib/feedback-sound-probe.mjs";

if (!process.argv.includes("--probe")) {
  for (const fault of ["silent-lock", "cut-lock"]) {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--probe"], {
        env: { ...process.env, SOUND_FAULT: fault },
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
      result.code === 1 && result.output.includes("PCM FAIL"),
      `Negative control ${fault} did not fail for missing audio: ${result.output}`,
    );
    console.log(`PCM check rejects ${fault}, even though native play() resolves.`);
  }
  if (process.argv.includes("--self-test")) process.exit(0);
}

const data = async (name) => JSON.parse(await readFile(new URL(`../src/data/${name}.json`, import.meta.url)));
const [generated, shop, valueOrder, flashback, catalog] = await Promise.all(
  [
    "questions.generated",
    "shopkeeper-questions",
    "value-order-questions",
    "flashback-questions",
    "shopkeeper-catalog",
  ].map(data),
);
const cases = [
  ["shop-recipe", "shopkeeper", shop.find((q) => q.id === "shopkeeper-recipe:bloodstone")],
  ["shop-build", "shopkeeper", shop.find((q) => q.kind === "shopkeeper-build-result")],
  ["shop-path", "shopkeeper", shop.find((q) => q.kind === "shopkeeper-upgrade-path")],
  ["shop-shared", "shopkeeper", shop.find((q) => q.kind === "shopkeeper-shared-part")],
  ["fogged-vision", "fogged-vision", generated.find((q) => q.kind === "fogged-hero")],
  ["spell-link", "spell-link", generated.find((q) => q.id === "ability-owner:mirana_arrow")],
  ["trivia", "trivia", generated.find((q) => q.kind === "mana-cost")],
  ["value-order", "order-up", valueOrder.find((q) => q.kind === "value-order-item")],
  ["flashback-order", "flashback", flashback.find((q) => q.kind === "flashback-order")],
];
const fixtures = Object.fromEntries(
  cases.map(([name, game, raw]) => {
    assert(raw, `Missing sound fixture: ${name}`);
    return [
      name,
      Object.fromEntries(
        ["answering", "reveal"].map((phase) => [
          phase,
          publicQuestionForRound(
            raw,
            { id: name, game, phase, answerDeadline: Date.now() + 15_000, answerDuration: 15_000 },
            Date.now(),
          ),
        ]),
      ),
    ];
  }),
);
const itemNames = new Map(catalog.groups.flatMap((group) => group.items.map((item) => [item.key, item.name])));
const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const { browser, page, targetId, close } = await soundBrowser();
const selector = (testId) => `[data-testid="${testId}"]`;
let checks = 0;

async function round(name, options = {}) {
  const id = await page.evaluate(`window.__soundFixture.set(${JSON.stringify(name)}, ${JSON.stringify(options)})`);
  await page.waitFor(
    `document.querySelector("main")?.dataset.roundId === ${JSON.stringify(id)} && document.querySelector("main")?.dataset.phase === "answering"`,
  );
}
async function mark(label) {
  return page.evaluate(`window.__soundProbe.mark(${JSON.stringify(label)})`);
}
async function search(testId, text) {
  await click(page, selector(testId));
  await page.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "a",
    code: "KeyA",
    windowsVirtualKeyCode: 65,
    modifiers: 2,
  });
  await page.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "a",
    code: "KeyA",
    windowsVirtualKeyCode: 65,
    modifiers: 2,
  });
  await page.send("Input.insertText", { text });
  await page.waitFor(`document.querySelector(${JSON.stringify(selector(testId))})?.value === ${JSON.stringify(text)}`);
}
async function measure(label, kinds) {
  const wanted = kinds.flatMap((kind) => DOTA_FEEDBACK_SOUNDS[kind].clips);
  const deadline = Date.now() + 3_000;
  let snapshot;
  let voices;
  do {
    snapshot = await page.evaluate("window.__soundProbe.snapshot()");
    voices = snapshot.voices.filter((voice) => voice.intent === label && voice.plays);
    if (voices.length >= wanted.length && voices.every((voice) => voice.ended || voice.error)) break;
    await delay(25);
  } while (Date.now() < deadline);
  // Flush the final audio-thread messages after ended.
  await delay(100);
  snapshot = await page.evaluate("window.__soundProbe.snapshot()");
  voices = snapshot.voices.filter((voice) => voice.intent === label && voice.plays);
  const fail = (why) => {
    throw new Error(`PCM FAIL ${label}: ${why} ${JSON.stringify({ context: snapshot.context, voices })}`);
  };
  if (voices.length !== wanted.length) fail(`expected ${wanted.length} cues, got ${voices.length}`);
  for (const clip of wanted) {
    const voice = voices.find((entry) => entry.src === clip.src);
    if (!voice) fail(`missing ${clip.src}`);
    const reference = await page.evaluate(`window.__soundProbe.reference(${JSON.stringify(clip.src)})`);
    const gameVolume = await page.evaluate(`Number(document.querySelector('[data-testid="game-volume"]').value) / 100`);
    const expectedEnergy = reference * (gameVolume * clip.gain) ** 2;
    const fraction = voice.energy / expectedEnergy;
    if (voice.plays !== 1 || !voice.started || !voice.ended || voice.error || !(fraction >= 0.9 && fraction <= 1.1)) {
      fail(`incomplete/quiet cue: ${Math.round(fraction * 100)}% of expected sample energy`);
    }
    if (!(voice.firstSampleAt - voice.calledAt < 350)) fail("first audio sample arrived more than 350 ms after play");
  }
  checks++;
  console.log(`PCM ok: ${label} (${kinds.join(" + ")})`);
}

async function pick(name, correct = false, keyboard = false) {
  const question = fixtures[name].reveal;
  const key = question.reveal.correctAnswerKey;
  if (question.answerMode === "hero-grid") {
    const hero = `${selector("hero-picker-hero")}${correct ? `[data-hero-key="${key}"]` : `:not([data-hero-key="${key}"])`}`;
    if (keyboard) {
      const name = await page.evaluate(`document.querySelector(${JSON.stringify(hero)}).title`);
      for (const key of name) {
        await page.send("Input.dispatchKeyEvent", { type: "keyDown", key });
        await page.send("Input.dispatchKeyEvent", { type: "keyUp", key });
      }
      await page.waitFor(
        `document.querySelector('[data-testid="hero-search"]')?.dataset.query === ${JSON.stringify(name)}`,
      );
      await press(page, "Enter");
    } else await click(page, hero);
  } else if (question.answerMode === "item-grid") {
    if (correct || keyboard) {
      await search("shopkeeper-search-field", correct ? itemNames.get(key) : "Blink Dagger");
      if (keyboard) await press(page, "Enter");
      else await click(page, `${selector("shopkeeper-store-item")}[data-item-key="${key}"]`);
    } else await click(page, `${selector("shopkeeper-store-item")}:not([data-item-key="${key}"])`);
  } else {
    const index = correct ? question.reveal.correctIndex : (question.reveal.correctIndex + 1) % 4;
    if (keyboard) await press(page, String(index + 1), `Digit${index + 1}`, 49 + index);
    else await click(page, selector("arcade-answer"), index);
  }
}

try {
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(${installSoundProbe.toString()})(${JSON.stringify(fixtures)}, ${JSON.stringify(process.env.SOUND_FAULT ?? "")})`,
  });
  await page.send("Page.navigate", { url: `${appUrl}/play` });
  await page.waitFor(`document.querySelector("main")?.dataset.phase === "answering"`);
  await page.evaluate("window.__soundProbe.ready");

  if (process.argv.includes("--probe")) {
    await round("shop-build");
    await mark("probe pick");
    await pick("shop-build");
    await measure("probe pick", ["lock"]);
  } else {
    // The maintainer's Shopkeeper silent pick: adding a component is a pick,
    // even though it does not submit the complete recipe to /api/votes yet.
    await round("shop-recipe", { revealOnVote: true });
    await mark("Shopkeeper recipe mouse pick");
    await click(page, selector("shopkeeper-store-item"));
    assert.equal(
      await page.evaluate(
        `document.querySelectorAll('[data-testid="shopkeeper-recipe-slot"]:not([data-empty="true"])').length`,
      ),
      1,
    );
    assert.equal(await page.evaluate("window.__soundFixture.vote()"), null);
    await measure("Shopkeeper recipe mouse pick", ["lock"]);

    await mark("Shopkeeper recipe remove");
    await click(page, `${selector("shopkeeper-recipe-slot")}:not([data-empty="true"])`);
    await measure("Shopkeeper recipe remove", ["lock"]);
    const size = fixtures["shop-recipe"].answering.shopkeeper.recipeSize;
    for (let index = 0; index < size; index++) {
      await search("shopkeeper-search-field", "Blink Dagger");
      await mark(`Shopkeeper recipe Enter pick ${index + 1}`);
      await press(page, "Enter");
      await measure(`Shopkeeper recipe Enter pick ${index + 1}`, ["lock"]);
    }
    await mark("Shopkeeper build at reveal");
    await click(page, selector("shopkeeper-recipe-build"));
    await measure("Shopkeeper build at reveal", ["lock", "wrong"]);

    for (const name of ["shop-build", "shop-path", "shop-shared", "fogged-vision", "spell-link", "trivia"]) {
      await round(name, { revealOnVote: true });
      await mark(`${name} pick at reveal`);
      await pick(name);
      await measure(`${name} pick at reveal`, ["lock", "wrong"]);
    }
    for (const name of ["shop-build", "fogged-vision", "spell-link", "trivia"]) {
      await round(name, { revealOnVote: true });
      await mark(`${name} correct Enter pick`);
      await pick(name, true, true);
      await measure(`${name} correct Enter pick`, ["lock", "correct"]);
    }

    // Each partial ordering pick needs its own cue; the last pick locks once.
    for (const [name, testId] of [
      ["value-order", "value-order-card"],
      ["flashback-order", "flashback-order-card"],
    ]) {
      await round(name, { revealOnVote: true });
      for (let index = 0; index < 4; index++) {
        const label = `${name} card ${index + 1}`;
        await mark(label);
        await click(page, selector(testId), index);
        const question = fixtures[name].reveal;
        const cards = question.valueOrder?.cards ?? question.flashback.cards;
        const correct = question.reveal.correctAnswerKey === valueOrderAnswerKey(cards.map((card) => card.key));
        await measure(label, index === 3 ? ["lock", correct ? "correct" : "wrong"] : ["lock"]);
      }
    }

    // A delayed reveal and the next pick must not cancel the wrong-answer cue.
    await round("trivia");
    await mark("before delayed result");
    await pick("trivia");
    await measure("before delayed result", ["lock"]);
    await mark("delayed wrong result");
    await page.evaluate("window.__soundFixture.reveal()");
    await page.waitFor(`document.querySelector("main")?.dataset.phase === "reveal"`);
    await round("fogged-vision");
    await mark("next round pick");
    await pick("fogged-vision");
    await measure("delayed wrong result", ["wrong"]);
    await measure("next round pick", ["lock"]);

    // Exercise a genuinely hidden tab under Chrome's normal autoplay rules.
    await round("trivia");
    await mark("before hidden result");
    await pick("trivia");
    await measure("before hidden result", ["lock"]);
    const background = await browser.send("Target.createTarget", { url: "about:blank" });
    await browser.send("Target.activateTarget", { targetId: background.targetId });
    await page.waitFor("document.hidden === true");
    await mark("hidden wrong result");
    await page.evaluate("window.__soundFixture.reveal()");
    await measure("hidden wrong result", ["wrong"]);
    await browser.send("Target.activateTarget", { targetId });
    await page.waitFor("document.hidden === false");
    await delay(250);
    const count = await page.evaluate(
      `window.__soundProbe.snapshot().voices.filter(v => v.intent === "hidden wrong result" && v.plays).length`,
    );
    assert.equal(count, 1, "A heard result replayed after returning to the tab");
    await browser.send("Target.closeTarget", { targetId: background.targetId });

    await click(page, '[aria-label="Mute game sounds"]');
    await round("shop-build", { revealOnVote: true });
    await mark("muted pick and result");
    await pick("shop-build");
    await page.waitFor(`document.querySelector("main")?.dataset.phase === "reveal"`);
    await delay(200);
    assert.equal(
      await page.evaluate(
        `window.__soundProbe.snapshot().voices.filter(v => v.intent === "muted pick and result" && v.plays).length`,
      ),
      0,
    );
    await click(page, '[aria-label="Enable game sounds"]');
    console.log(
      `Feedback playback holds: ${checks} PCM checks, nine fixed formats, mouse/keyboard, deadline races, hidden tab, and mute.`,
    );
  }
} finally {
  await close();
}
