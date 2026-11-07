#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import {
  journeyBrowser,
  journeyFixtures,
  fillInput,
  nativeKey,
  tap,
  touchRange,
  changeRound,
} from "./lib/journey-browser.mjs";
import { click, delay } from "./lib/feedback-browser.mjs";

const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const evidence = process.env.JOURNEY_EVIDENCE_DIR ?? "/tmp/queue-arcade-deep-review/evidence";
await mkdir(evidence, { recursive: true });
const browser = await journeyBrowser(appUrl);
const results = [];
async function check(name, options, run) {
  if (process.env.JOURNEY_CASE && !name.includes(process.env.JOURNEY_CASE)) return;
  let page;
  try {
    page = await browser.setup(options);
    await run(page);
    results.push({ name, passed: true });
    console.log("PASS " + name);
  } catch (error) {
    const detail = { name, passed: false, error: error.message };
    if (page) {
      detail.state = await page
        .evaluate(
          `({path:location.pathname,phase:document.querySelector('main')?.dataset.phase,text:document.body.innerText.slice(-4000),submissions:window.__journey?.submissions,calls:window.__journey?.calls.slice(-12)})`,
        )
        .catch(() => null);
      const screenshot = await page.send("Page.captureScreenshot", { format: "png" }).catch(() => null);
      if (screenshot)
        await writeFile(`${evidence}/${name.replace(/[^a-z0-9]+/gi, "-")}.png`, Buffer.from(screenshot.data, "base64"));
    }
    results.push(detail);
    console.error("FAIL " + name + ": " + error.message);
  } finally {
    if (page) await page.send("Page.navigate", { url: "about:blank" });
    await writeFile(`${evidence}/user-journeys.json`, JSON.stringify(results, null, 2) + "\n");
  }
}
const votes = (page) => page.evaluate("window.__journey.submissions.length");
async function finishRound(page) {
  await changeRound(page, `window.__journey.phase='reveal'`);
  await page.waitFor(`document.querySelector('main')?.dataset.phase==='reveal'`);
}
async function answerByTouch(page, kind) {
  const question = journeyFixtures[kind].reveal;
  const key = question.reveal.correctAnswerKey;
  if (question.answerMode === "hero-grid") {
    await tap(page, `[data-hero-key="${key}"]`);
  } else if (question.answerMode === "item-grid") {
    await fillInput(page, '[data-testid="shopkeeper-search-field"]', key);
    await tap(page, `[data-testid="shopkeeper-store-item"][data-item-key="${key}"]`);
  } else if (question.answerMode === "item-recipe") {
    for (const item of key.slice("recipe-v1:".length).split("+")) {
      await fillInput(page, '[data-testid="shopkeeper-search-field"]', item);
      await tap(page, `[data-testid="shopkeeper-store-item"][data-item-key="${item}"]`);
    }
    await tap(page, '[data-testid="shopkeeper-recipe-build"]');
  } else if (question.answerMode === "flashback-year") {
    await touchRange(page, '[data-testid="flashback-year-slider"]', Number(key.slice("year-v1:".length)));
    await tap(page, '[data-testid="flashback-year-lock"]');
  } else if (question.answerMode === "value-order" || question.answerMode === "flashback-order") {
    const cards = question.valueOrder?.cards ?? question.flashback.cards;
    const selector =
      question.answerMode === "value-order"
        ? '[data-testid="value-order-card"]'
        : '[data-testid="flashback-order-card"]';
    for (const item of key.slice("order-v1:".length).split(","))
      await tap(
        page,
        selector,
        cards.findIndex((card) => card.key === item),
      );
  } else {
    await tap(page, '[data-testid="arcade-answer"]', question.reveal.correctIndex);
  }
  await page.waitFor("window.__journey.submissions.length===1");
}
try {
  await check("mobile hero search has an editable input", { mobile: true, kind: "hero" }, async (page) => {
    assert.equal(await page.evaluate(`!!document.querySelector('input[data-testid="hero-search-input"]')`), true);
    await tap(page, '[data-testid="hero-search-input"]');
    assert.equal(await page.evaluate(`document.activeElement?.dataset.testid`), "hero-search-input");
    await fillInput(page, '[data-testid="hero-search-input"]', "Abaddon");
    await nativeKey(page, "Enter");
    await page.waitFor("window.__journey.submissions.length===1");
    assert.equal(await page.evaluate("window.__journey.submissions[0].answerKey"), "npc_dota_hero_abaddon");
  });
  for (const action of ["join", "create"]) {
    await check(`cancel delayed party ${action} with Back`, { path: "/party", holdParty: action }, async (page) => {
      await click(page, `[data-testid="private-room-choose-${action}"]`);
      await fillInput(page, '[data-testid="private-room-join-code"]', "JOURNEY");
      await click(page, `[data-testid="private-room-${action}"]`);
      await page.waitFor("Boolean(window.__journey.releaseParty)");
      await click(page, '[data-testid="private-room-leave"]');
      await page.evaluate("window.__journey.releaseParty()");
      await delay(150);
      assert.equal(await page.evaluate("location.pathname"), "/party");
      assert.equal(
        await page.evaluate(`document.querySelector('[data-testid="private-room-setup"]')?.dataset.path`),
        "choose",
      );
    });
  }
  await check(
    "party response body timeout leaves Join usable",
    { path: "/party", holdPartyBody: "join" },
    async (page) => {
      await click(page, '[data-testid="private-room-choose-join"]');
      await fillInput(page, '[data-testid="private-room-join-code"]', "JOURNEY");
      await click(page, '[data-testid="private-room-join"]');
      await page.waitFor(`!document.querySelector('[data-testid="private-room-join"]').disabled`, 8000);
      assert.match(
        await page.evaluate(`document.querySelector('[data-testid="private-room-error"]').textContent`),
        /timed out/i,
      );
      await click(page, '[data-testid="private-room-join"]');
      await page.waitFor(`!!document.querySelector('[data-testid="private-room-start"]')`);
    },
  );
  await check("rapid party Join sends one request", { path: "/party", holdParty: "join" }, async (page) => {
    await click(page, '[data-testid="private-room-choose-join"]');
    await fillInput(page, '[data-testid="private-room-join-code"]', "JOURNEY");
    await page.evaluate(
      `const button=document.querySelector('[data-testid="private-room-join"]');button.click();button.click();`,
    );
    await page.waitFor("Boolean(window.__journey.releaseParty)");
    assert.equal(
      await page.evaluate(
        `window.__journey.calls.filter(call=>call.path==='/api/private-rooms'&&call.body.action==='join').length`,
      ),
      1,
    );
    await page.evaluate("window.__journey.releaseParty()");
  });
  for (const kind of Object.keys(journeyFixtures)) {
    await check(`touch answer and reveal ${kind}`, { mobile: true, kind }, async (page) => {
      assert.equal(
        await page.evaluate(
          `document.querySelectorAll('[data-testid="reveal-panel"],[data-state="correct"],[data-correct="true"]').length`,
        ),
        0,
      );
      if (kind === "freerecipe") {
        assert.equal(
          await page.evaluate(`document.querySelectorAll('[data-testid="shopkeeper-recipe-included"]').length`),
          0,
        );
        assert.equal(
          await page.evaluate(`document.querySelectorAll('[data-testid="shopkeeper-no-recipe"]').length`),
          1,
        );
      }
      await answerByTouch(page, kind);
      await finishRound(page);
      if (kind === "freerecipe")
        assert.equal(
          await page.evaluate(`document.querySelectorAll('[data-testid="shopkeeper-recipe-included"]').length`),
          0,
        );
      assert.equal(
        await page.evaluate(`document.querySelector('[data-testid="score-grid"] strong')?.textContent`),
        "200",
      );
      assert.equal(await votes(page), 1);
    });
  }
  for (const width of [320, 390]) {
    for (const kind of ["flashchoice", "hero", "shop"]) {
      await check(
        `mobile next round restores prompt ${width} ${kind}`,
        { mobile: true, width, height: width === 320 ? 568 : 844, kind },
        async (page) => {
          await finishRound(page);
          await page.evaluate(
            `document.querySelector('[data-testid="reveal-explanation"]').scrollIntoView({block:'end'});window.scrollTo(0,document.scrollingElement.scrollHeight)`,
          );
          assert.ok((await page.evaluate("window.scrollY")) > 200, "The previous reveal must start below the prompt");
          await changeRound(page, "window.__journey.number+=1;window.__journey.phase='answering'");
          await page.waitFor(`document.querySelector('main')?.dataset.phase==='answering'`);
          const position = await page.evaluate(
            `(() => {const prompt=document.querySelector('[data-testid="round-prompt"] h2').getBoundingClientRect(),timer=document.querySelector('[data-testid="round-timer"]').getBoundingClientRect();return {promptTop:prompt.top,promptBottom:prompt.bottom,timerTop:timer.top,timerBottom:timer.bottom,height:innerHeight,scroll:scrollY};})()`,
          );
          assert.ok(
            position.promptTop >= position.timerBottom && position.promptBottom <= position.height,
            "Next prompt must be visible: " + JSON.stringify(position),
          );
          assert.ok(
            position.timerTop >= 0 && position.timerBottom <= position.height,
            "Next timer must be visible: " + JSON.stringify(position),
          );
          await answerByTouch(page, kind);
          assert.equal(await votes(page), 1);
        },
      );
    }
  }
  for (const kind of ["hero", "shop"]) {
    await check(`mobile next round resets nested ${kind} search and scroll`, { mobile: true, kind }, async (page) => {
      const search = kind === "hero" ? '[data-testid="hero-search-input"]' : '[data-testid="shopkeeper-search-field"]';
      const board = kind === "hero" ? '[data-testid="hero-picker-board"]' : '[data-testid="shopkeeper-groups"]';
      await fillInput(page, search, "a");
      await page.evaluate(
        `document.activeElement?.blur();const board=document.querySelector(${JSON.stringify(board)});board.scrollTop=board.scrollHeight;window.scrollTo(0,document.scrollingElement.scrollHeight)`,
      );
      const before = await page.evaluate(
        `({page:scrollY,board:document.querySelector(${JSON.stringify(board)}).scrollTop})`,
      );
      assert.ok(before.board > 50 && before.page > 200, "Both nested and page positions must start scrolled");
      await changeRound(page, "window.__journey.laterClue=true");
      assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(search)}).value`), "a");
      assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(board)}).scrollTop`), before.board);
      assert.ok(
        Math.abs((await page.evaluate("scrollY")) - before.page) < 3,
        "Same-round clue update must not reset page scroll",
      );
      await changeRound(page, "window.__journey.number+=1;window.__journey.laterClue=false");
      await page.waitFor(`document.querySelector('main')?.dataset.roundId.endsWith(':round:2')`);
      assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(search)}).value`), "");
      assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(board)}).scrollTop`), 0);
      await page.evaluate("window.scrollTo(0,document.scrollingElement.scrollHeight)");
      await finishRound(page);
      assert.ok((await page.evaluate("scrollY")) > 200, "Reveal must not reset the page to the prompt");
    });
  }
  await check(
    "mobile next round preserves active party chat",
    { mobile: true, path: "/play?room=JOURNEY", kind: "hero" },
    async (page) => {
      await page.evaluate("window.__journey.waiting=false");
      await page.waitFor(
        `!!document.querySelector('[data-testid="private-room-play-dock"]') && document.querySelector('main')?.dataset.phase==='answering'`,
        20000,
      );
      await fillInput(page, '[data-testid="private-room-chat-input"]', "Keep this draft");
      await page.evaluate(
        `document.querySelector('[data-testid="private-room-chat-input"]').focus();window.scrollTo(0,document.scrollingElement.scrollHeight)`,
      );
      const before = await page.evaluate("window.scrollY");
      await changeRound(page, "window.__journey.number+=1");
      await page.waitFor(`document.querySelector('main')?.dataset.roundId.endsWith(':round:2')`);
      assert.equal(await page.evaluate("document.activeElement?.dataset.testid"), "private-room-chat-input");
      assert.equal(
        await page.evaluate(`document.querySelector('[data-testid="private-room-chat-input"]').value`),
        "Keep this draft",
      );
      assert.ok(
        Math.abs((await page.evaluate("window.scrollY")) - before) < 3,
        "Chat typing must not scroll to the prompt",
      );
      assert.equal(await votes(page), 0);
    },
  );
  for (const kind of ["order", "flashorder"]) {
    await check(`edit partial ${kind} without an accidental lock`, { mobile: true, kind }, async (page) => {
      const selector = kind === "order" ? '[data-testid="value-order-card"]' : '[data-testid="flashback-order-card"]';
      await tap(page, selector, 0);
      await tap(page, selector, 1);
      assert.equal(await votes(page), 0);
      await tap(page, '[aria-label="Undo last card"]');
      assert.equal(await page.evaluate(`document.querySelectorAll('${selector}[data-selected="true"]').length`), 1);
      await tap(page, selector, 0);
      assert.equal(await page.evaluate(`document.querySelectorAll('${selector}[data-selected="true"]').length`), 0);
      await answerByTouch(page, kind);
    });
  }
  await check("recipe removal and incomplete build stay unlocked", { mobile: true, kind: "recipe" }, async (page) => {
    assert.equal(
      await page.evaluate(`document.querySelector('[data-testid="shopkeeper-recipe-build"]').disabled`),
      true,
    );
    const item = journeyFixtures.recipe.reveal.reveal.correctAnswerKey.slice("recipe-v1:".length).split("+")[0];
    await fillInput(page, '[data-testid="shopkeeper-search-field"]', item);
    await tap(page, `[data-testid="shopkeeper-store-item"][data-item-key="${item}"]`);
    await tap(page, 'button[data-testid="shopkeeper-recipe-slot"]');
    assert.equal(
      await page.evaluate(`document.querySelector('[data-testid="shopkeeper-recipe-builder"]').dataset.selectionCount`),
      "0",
    );
    assert.equal(await votes(page), 0);
    await answerByTouch(page, "recipe");
  });
  await check("hero zero and ambiguous searches never submit", { kind: "hero" }, async (page) => {
    await fillInput(page, '[data-testid="hero-search-input"]', "no-such-hero");
    await page.evaluate(`document.querySelector('[data-testid="hero-search-input"]').focus()`);
    await nativeKey(page, "Enter");
    assert.equal(await votes(page), 0);
    await fillInput(page, '[data-testid="hero-search-input"]', "a");
    await nativeKey(page, "Enter");
    assert.equal(await votes(page), 0);
    await nativeKey(page, "Escape");
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="hero-search-input"]').value`), "");
  });
  await check("failed vote retries once without resetting the round", { kind: "classic" }, async (page) => {
    await page.evaluate("window.__journey.voteFailures=1");
    await click(page, '[data-testid="arcade-answer"]', 0);
    await page.waitFor(`!!document.querySelector('[data-testid="vote-retry"]')`);
    await click(page, '[data-testid="arcade-answer"]', 1);
    await page.waitFor("window.__journey.submissions.length===2");
    assert.equal(await page.evaluate(`document.querySelector('main').dataset.phase`), "answering");
    await finishRound(page);
    assert.equal(await votes(page), 2);
  });
  await check("offline polling recovers with the same accepted answer", { kind: "classic" }, async (page) => {
    await click(page, '[data-testid="arcade-answer"]', journeyFixtures.classic.reveal.reveal.correctIndex);
    await page.waitFor("window.__journey.submissions.length===1");
    await changeRound(page, "window.__journey.blockRounds=true");
    await delay(700);
    assert.equal(await votes(page), 1);
    await changeRound(page, `window.__journey.blockRounds=false;window.__journey.phase='reveal'`);
    await page.waitFor(`document.querySelector('[data-testid="score-grid"] strong')?.textContent==='200'`);
    assert.equal(await votes(page), 1);
  });
  await check(
    "open report follows its original round",
    { mobile: true, width: 320, height: 568, kind: "classic" },
    async (page) => {
      await finishRound(page);
      await page.evaluate(`document.querySelector('[data-testid="report-question"]').focus()`);
      await nativeKey(page, "Enter");
      await nativeKey(page, "Tab");
      const reason = await page.evaluate(`document.activeElement.dataset.reportReason`);
      assert.equal(reason, "incorrect");
      await changeRound(page, `window.__journey.number+=1;window.__journey.phase='answering'`);
      await page.waitFor(`!!document.querySelector('[data-testid="report-carryover"]')`);
      assert.equal(await page.evaluate(`document.activeElement.dataset.reportReason`), reason);
      await click(page, '[data-testid="report-reason"][data-report-reason="ambiguous"]');
      await page.waitFor("window.__journey.reports.length===1");
      assert.ok(await page.evaluate(`window.__journey.reports[0].roundId.endsWith(':round:1')`));
      assert.equal(await votes(page), 0);
    },
  );
  await check("keyboard focus keeps year slider and lock separate", { kind: "year" }, async (page) => {
    await page.evaluate(`document.querySelector('[data-testid="flashback-year-slider"]').focus()`);
    const before = Number(await page.evaluate(`document.activeElement.value`));
    await nativeKey(page, "ArrowRight");
    assert.equal(Number(await page.evaluate(`document.activeElement.value`)), before + 1);
    assert.equal(await votes(page), 0);
    await nativeKey(page, "Tab");
    assert.equal(await page.evaluate(`document.activeElement.dataset.testid`), "flashback-year-lock");
    await nativeKey(page, "Enter");
    await page.waitFor("window.__journey.submissions.length===1");
  });
  await check("Back and Forward keep the public route usable", { kind: "classic" }, async (page) => {
    await click(page, '[data-testid="site-home"]');
    assert.equal(await page.evaluate("location.pathname"), "/");
    await page.evaluate("history.back()");
    await page.waitFor(`location.pathname==='/play'`);
    await changeRound(page, "window.__journey.number+=1");
    await page.waitFor(`document.querySelector('main')?.dataset.phase==='answering'`);
    await page.evaluate("history.forward()");
    await page.waitFor(`location.pathname==='/' && document.querySelector('main')?.dataset.phase==='lobby'`);
  });
  await check("account change does not write connected results into guest stats", { kind: "classic" }, async (page) => {
    const before = await page.evaluate(
      `JSON.parse(localStorage.getItem('queue-arcade:stats:v2') || '{"answered":0}').answered`,
    );
    await changeRound(page, "window.__journey.authenticated=true");
    await delay(200);
    await click(page, '[data-testid="arcade-answer"]', journeyFixtures.classic.reveal.reveal.correctIndex);
    await finishRound(page);
    await delay(200);
    assert.equal(
      await page.evaluate(`JSON.parse(localStorage.getItem('queue-arcade:stats:v2') || '{"answered":0}').answered`),
      before,
    );
  });
  await check("account logout starts a separate guest run", { kind: "classic", connected: true }, async (page) => {
    const before = await page.evaluate(
      `JSON.parse(localStorage.getItem('queue-arcade:stats:v2') || '{"answered":0}').answered`,
    );
    await click(page, '[data-testid="arcade-answer"]', journeyFixtures.classic.reveal.reveal.correctIndex);
    await finishRound(page);
    await page.waitFor(`document.querySelector('[data-testid="score-grid"] strong')?.textContent==='200'`);
    await changeRound(
      page,
      "window.__journey.authenticated=false;window.__journey.number+=1;window.__journey.phase='answering'",
    );
    await page.waitFor(`document.querySelector('[data-testid="score-grid"] strong')?.textContent==='0'`);
    await click(page, '[data-testid="arcade-answer"]', journeyFixtures.classic.reveal.reveal.correctIndex);
    await finishRound(page);
    await page.waitFor(
      `JSON.parse(localStorage.getItem('queue-arcade:stats:v2') || '{"answered":0}').answered===${before + 1}`,
    );
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="score-grid"] strong').textContent`), "200");
  });
  for (const failOldVote of [false, true]) {
    await check(
      "account switch ignores delayed " + (failOldVote ? "failed" : "accepted") + " vote",
      { kind: "classic" },
      async (page) => {
        const correct = journeyFixtures.classic.reveal.reveal.correctIndex;
        const wrong = (correct + 1) % 4;
        await page.evaluate("window.__journey.holdVote=true");
        await click(page, '[data-testid="arcade-answer"]', wrong);
        await page.waitFor("typeof window.__journey.releaseVote==='function'");
        await changeRound(page, "window.__journey.authenticated=true");
        await page.waitFor(`!document.querySelector('[data-testid="arcade-answer"]').disabled`);
        await click(page, '[data-testid="arcade-answer"]', correct);
        await page.waitFor("window.__journey.submissions.length===2");
        await page.evaluate(`window.__journey.failHeldVote=${failOldVote};window.__journey.releaseVote()`);
        await finishRound(page);
        await page.waitFor(`document.querySelector('[data-testid="score-grid"] strong')?.textContent==='200'`);
        assert.equal(
          await page.evaluate(
            `document.querySelectorAll('[data-testid="arcade-answer"]')[${correct}].getAttribute('aria-pressed')`,
          ),
          "true",
        );
      },
    );
  }
  await check(
    "account metadata missing cannot create guest credit",
    { kind: "classic", omitIdentity: true },
    async (page) => {
      const before = await page.evaluate(
        `JSON.parse(localStorage.getItem('queue-arcade:stats:v2') || '{"answered":0}').answered`,
      );
      await click(page, '[data-testid="arcade-answer"]', journeyFixtures.classic.reveal.reveal.correctIndex);
      await finishRound(page);
      await page.waitFor(`document.querySelector('[data-testid="score-grid"] strong')?.textContent==='200'`);
      assert.equal(
        await page.evaluate(`JSON.parse(localStorage.getItem('queue-arcade:stats:v2') || '{"answered":0}').answered`),
        before,
      );
    },
  );
  await check(
    "account switch discards an old profile response",
    { kind: "classic", connected: true, holdProfile: true },
    async (page) => {
      await page.waitFor("typeof window.__journey.releaseProfile==='function'");
      await changeRound(page, "window.__journey.authenticated=false");
      await page.evaluate("window.__journey.releaseProfile()");
      await delay(150);
      const before = await page.evaluate(
        `JSON.parse(localStorage.getItem('queue-arcade:stats:v2') || '{"answered":0}').answered`,
      );
      await click(page, '[data-testid="arcade-answer"]', journeyFixtures.classic.reveal.reveal.correctIndex);
      await finishRound(page);
      await page.waitFor(
        `JSON.parse(localStorage.getItem('queue-arcade:stats:v2') || '{"answered":0}').answered===${before + 1}`,
      );
    },
  );
  await check(
    "account vote response migrates pending ownership from an old guest tab",
    { kind: "classic" },
    async (page) => {
      const second = await browser.setup({ kind: "classic", connected: true });
      try {
        const before = await page.evaluate(
          `JSON.parse(localStorage.getItem('queue-arcade:stats:v2') || '{"answered":0}').answered`,
        );
        await page.evaluate("window.__journey.authenticated=true;window.__journey.blockRounds=true");
        await click(page, '[data-testid="arcade-answer"]', journeyFixtures.classic.reveal.reveal.correctIndex);
        await page.waitFor(
          `JSON.parse(sessionStorage.getItem('queue-arcade:pending-votes:v2') || '[]').some(record=>record.playerId==='account:journey-account')`,
        );
        assert.equal(
          await page.evaluate(
            `JSON.parse(sessionStorage.getItem('queue-arcade:pending-votes:v2') || '[]').filter(record=>record.playerId!=='account:journey-account').length`,
          ),
          0,
        );
        await page.evaluate("window.__journey.blockRounds=false");
        await finishRound(page);
        await page.waitFor(`document.querySelector('[data-testid="score-grid"] strong')?.textContent==='200'`);
        assert.equal(
          await page.evaluate(`JSON.parse(localStorage.getItem('queue-arcade:stats:v2') || '{"answered":0}').answered`),
          before,
        );
      } finally {
        await second.send("Page.navigate", { url: "about:blank" });
      }
    },
  );
  await check(
    "account metadata restoration excludes earlier unknown results",
    { kind: "classic", omitIdentity: true },
    async (page) => {
      await click(page, '[data-testid="arcade-answer"]', journeyFixtures.classic.reveal.reveal.correctIndex);
      await finishRound(page);
      await page.waitFor(`document.querySelector('[data-testid="score-grid"] strong')?.textContent==='200'`);
      await changeRound(
        page,
        "window.__journey.omitIdentity=false;window.__journey.number+=1;window.__journey.phase='answering';window.__journey.votes.clear()",
      );
      await page.waitFor(`document.querySelector('[data-testid="score-grid"] strong')?.textContent==='0'`);
      await click(page, '[data-testid="arcade-answer"]', journeyFixtures.classic.reveal.reveal.correctIndex);
      await finishRound(page);
      await page.waitFor(`document.querySelector('[data-testid="score-grid"] strong')?.textContent==='200'`);
    },
  );
  await check("account metadata gap cannot add unowned points to a known run", { kind: "classic" }, async (page) => {
    await changeRound(page, "window.__journey.omitIdentity=true");
    await click(page, '[data-testid="arcade-answer"]', journeyFixtures.classic.reveal.reveal.correctIndex);
    await finishRound(page);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="score-grid"] strong').textContent`), "0");
    await changeRound(
      page,
      "window.__journey.omitIdentity=false;window.__journey.number+=1;window.__journey.phase='answering';window.__journey.votes.clear()",
    );
    await page.waitFor(`document.querySelector('main')?.dataset.phase==='answering'`);
    await click(page, '[data-testid="arcade-answer"]', journeyFixtures.classic.reveal.reveal.correctIndex);
    await finishRound(page);
    await page.waitFor(`document.querySelector('[data-testid="score-grid"] strong')?.textContent==='200'`);
  });
  await check("party chat draft survives the start transition", { path: "/play?room=JOURNEY" }, async (page) => {
    await page.waitFor(`!!document.querySelector('[data-testid="private-room-chat-input"]')`);
    await fillInput(page, '[data-testid="private-room-chat-input"]', "Meet after this round");
    await page.evaluate("window.__journey.waiting=false");
    await page.waitFor(`!!document.querySelector('[data-testid="private-room-play-dock"]')`, 10000);
    assert.equal(
      await page.evaluate(`document.querySelector('[data-testid="private-room-chat-input"]').value`),
      "Meet after this round",
    );
    await page.evaluate(`document.querySelector('[data-testid="private-room-chat-input"]').focus()`);
    await nativeKey(page, "Enter");
    await page.waitFor(`window.__journey.messages.length===1`);
    assert.equal(await votes(page), 0);
  });
  await check("mobile rotation preserves a partial order", { mobile: true, kind: "order" }, async (page) => {
    await tap(page, '[data-testid="value-order-card"]', 0);
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: 844,
      height: 390,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await delay(100);
    assert.equal(
      await page.evaluate(`document.querySelectorAll('[data-testid="value-order-card"][data-selected="true"]').length`),
      1,
    );
    assert.equal(await votes(page), 0);
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: 320,
      height: 568,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await tap(page, '[aria-label="Undo last card"]');
    assert.equal(
      await page.evaluate(`document.querySelectorAll('[data-testid="value-order-card"][data-selected="true"]').length`),
      0,
    );
  });
  if (process.env.ALLOW_LIVE_JOURNEYS === "1") {
    assert.ok(
      ["127.0.0.1", "localhost", "[::1]"].includes(new URL(appUrl).hostname),
      "Live fixture writes require a loopback test server",
    );
    await check("live party handoff reload and rejoin", { real: true, path: "/party" }, async (host) => {
      let guest;
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const code =
        "J" + Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
      try {
        await host.waitFor(`!!document.querySelector('[data-testid="private-room-choose-create"]')`);
        await click(host, '[data-testid="private-room-choose-create"]');
        await fillInput(host, '[data-testid="private-room-join-code"]', code);
        await click(host, '[data-testid="private-room-create"]');
        await host.waitFor(
          `document.querySelector('[data-testid="private-room-code"]')?.textContent===${JSON.stringify(code)}`,
        );
        guest = await browser.setup({ real: true, path: "/party" });
        await guest.waitFor(`!!document.querySelector('[data-testid="private-room-choose-join"]')`);
        await click(guest, '[data-testid="private-room-choose-join"]');
        await fillInput(guest, '[data-testid="private-room-join-code"]', code);
        await click(guest, '[data-testid="private-room-join"]');
        await host.waitFor(`document.querySelectorAll('[data-testid="private-room-players"] li').length===2`);
        await guest.send("Page.reload");
        await guest.waitFor(`document.querySelectorAll('[data-testid="private-room-players"] li').length===2`, 20000);
        await click(host, '[data-testid="private-room-leave"]');
        await guest.waitFor(`!!document.querySelector('[data-testid="private-room-start"]')`);
        await click(host, '[data-testid="private-room-open"]');
        await click(host, '[data-testid="private-room-choose-join"]');
        await fillInput(host, '[data-testid="private-room-join-code"]', code);
        await click(host, '[data-testid="private-room-join"]');
        await guest.waitFor(`document.querySelectorAll('[data-testid="private-room-players"] li').length===2`);
        assert.equal(await host.evaluate(`!!document.querySelector('[data-testid="private-room-start"]')`), false);
        await click(guest, '[data-testid="private-room-start"]');
        await guest.waitFor(
          `!!document.querySelector('[data-testid="private-room-countdown"]') || document.querySelector('main')?.dataset.phase==='answering'`,
        );
      } finally {
        for (const page of [host, guest].filter(Boolean)) {
          await page.evaluate(`document.querySelector('[data-testid="site-home"]')?.click()`).catch(() => undefined);
        }
        if (guest) await guest.send("Page.navigate", { url: "about:blank" });
      }
    });
  }
  if (process.env.JOURNEY_PROFILE_COOKIE) {
    await check(
      "profile cancel and failed deletion preserve the account",
      { real: true, path: "/profile", cookie: process.env.JOURNEY_PROFILE_COOKIE },
      async (page) => {
        await page.waitFor(`!!document.querySelector('button[data-danger="true"]')`);
        await page.evaluate(
          `window.__deletes=0;window.confirm=()=>false;const originalFetch=window.fetch.bind(window);window.fetch=(input,init={})=>{if(String(input)==='/api/me'&&init.method==='DELETE'){window.__deletes++;return Promise.resolve(new Response('{}',{status:503,headers:{'Content-Type':'application/json'}}));}return originalFetch(input,init);};`,
        );
        await click(page, 'button[data-danger="true"]');
        assert.equal(await page.evaluate("window.__deletes"), 0);
        await page.evaluate("window.confirm=()=>true");
        await click(page, 'button[data-danger="true"]');
        await page.waitFor(`!!document.querySelector('[role="alert"]')`);
        assert.equal(await page.evaluate("window.__deletes"), 1);
        assert.equal(await page.evaluate(`document.querySelector('button[data-danger="true"]').disabled`), false);
        assert.equal(await page.evaluate("location.pathname"), "/profile");
      },
    );
  }
} finally {
  await browser.close();
}
assert.ok(results.length > 0, "At least one journey must run");
assert.equal(
  results.filter((result) => !result.passed).length,
  0,
  JSON.stringify(
    results.filter((result) => !result.passed).map(({ name, error }) => ({ name, error })),
    null,
    2,
  ),
);
console.log(`Validated ${results.length} player journeys.`);
