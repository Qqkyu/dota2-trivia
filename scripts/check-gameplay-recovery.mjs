#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { soundBrowser, delay } from "./lib/feedback-browser.mjs";
import { publicQuestionForRound } from "../src/lib/public-question.mjs";

const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const generated = JSON.parse(await readFile(new URL("../src/data/questions.generated.json", import.meta.url)));
const flashback = JSON.parse(await readFile(new URL("../src/data/flashback-questions.json", import.meta.url)));
const examples = {
  trivia: [generated.find((question) => question.kind === "mana-cost"), "trivia"],
  hero: [generated.find((question) => question.kind === "spell-owner"), "spell-link"],
  year: [flashback.find((question) => question.kind === "flashback-year"), "flashback"],
};
const fixtures = Object.fromEntries(
  Object.entries(examples).map(([kind, [question, game]]) => [
    kind,
    {
      answering: publicQuestionForRound(
        question,
        { id: "fixture", game, phase: "answering", answerDeadline: Date.now() + 15000, answerDuration: 15000 },
        Date.now(),
      ),
      reveal: publicQuestionForRound(
        question,
        { id: "fixture", game, phase: "reveal", answerDeadline: Date.now(), answerDuration: 15000 },
        Date.now(),
      ),
    },
  ]),
);
const browser = await soundBrowser();
const pages = [];
async function setup(options = {}) {
  const { page } = await browser.newPage();
  pages.push(page);
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
    const fixtures = ${JSON.stringify(fixtures)};
    const options = ${JSON.stringify(options)};
    if (options.blockIndexedDB) Object.defineProperty(window, 'indexedDB', {get() { throw new DOMException('Persistence blocked', 'SecurityError'); }});
    if (options.blockStorageGetter) for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(window, key, {get() { throw new DOMException('Storage blocked', 'SecurityError'); }});
    if (options.blockStorage) Storage.prototype.setItem = function() { throw new DOMException('Storage blocked', 'SecurityError'); };
    const state = window.__gameplay = {number: 0, phase: 'answering', kind: options.kind || 'trivia', requests: 0, votes: new Map(), voteCalls: 0, queries: []};
    const room = {id: 'dota2:' + 'gameplay-fixture-'.repeat(14) + ':public', gameId: 'dota2', contentVersion: 'fixture', mode: 'mixed', filter: 'Mixed'};
    const idFor = number => room.id + ':round:' + number;
    const response = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type':'application/json'}});
    const account = {authenticated: true, profile: {user: {id: 'fixture-account', steamId: '76561198000000000', displayName: 'Fixture player', avatarUrl: null, profileUrl: '', createdAt: 0}, stats: {answered:0, correct:0, accuracy:0, currentStreak:0, bestStreak:0, bestTenCorrect:null, firstStageCorrect:0, progressiveCorrect:0, progressiveAnswered:0, formats:[], recentRounds:[]}}};
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname === '/api/me') return state.profileFailure ? response({error:'Temporary failure'},503) : response(options.connected ? account : {authenticated: false});
      if (url.pathname === '/api/votes') {
        const body = JSON.parse(init.body); state.voteCalls++;
        if (options.holdCommit) await new Promise(resolve => state.releaseVote = resolve);
        const correct = fixtures[state.kind].reveal.reveal;
        const isCorrect = body.answerKey ? body.answerKey === correct.correctAnswerKey : body.answerIndex === correct.correctIndex;
        const vote = {answerIndex: body.answerIndex, ...(body.answerKey ? {answerKey: body.answerKey} : {}), submittedAt: Date.now()};
        if (options.authoritativeCorrect) vote.answerIndex = correct.correctIndex;
        state.votes.set(body.roundId, {vote, points: isCorrect || options.authoritativeCorrect ? 200 : 0, kind: state.kind});
        if (options.holdResponse) await new Promise(resolve => state.releaseVote = resolve);
        return response({playerIdentity:options.connected?{kind:'account',id:'fixture-account'}:{kind:'guest',id:body.voterId},accepted:true, playerVote:vote, counts:[0,0,0,0], total:1, keyCounts:[], scoreSummary:null});
      }
      if (url.pathname === '/api/rounds') {
        state.requests++; state.queries.push(url.searchParams.get('pendingRoundIds') || '');
        if (state.requests === 1 && options.holdRoom) await new Promise(resolve => state.releaseRoom = resolve);
        if (state.requests === 1 && options.failFirst) return response({error:'Temporary failure'},503);
        if (state.requests === 1 && options.hangFirst) return new Promise(() => {});
        const boot = state.number === 0;
        const number = state.number;
        if (boot) state.number = 1;
        const phase = boot ? 'reveal' : state.phase;
        const now = Date.now();
        const id = idFor(number);
        const question = {...fixtures[state.kind][phase], id};
        const stored = state.votes.get(id);
        const counts = [0,0,0,0];
        if (stored) counts[fixtures[state.kind].reveal.reveal.correctIndex] = 1;
        const previousResults = [...state.votes.entries()].filter(([roundId]) => roundId !== id && (url.searchParams.get('pendingRoundIds') || '').split(',').includes(roundId)).map(([roundId,result]) => ({roundId, correct:result.points>0, points:result.points, game:fixtures[result.kind].answering.game, category:fixtures[result.kind].answering.category}));
        return response({playerIdentity:options.connected?{kind:'account',id:'fixture-account'}:{kind:'guest',id:url.searchParams.get('playerId')},serverNow:now, room,
          round:{id,number,game:question.game,phase,startedAt:now,answerDeadline:now+15000,revealDeadline:now+(boot?100:22000),answerDuration:15000},
          questionRevision:id+':'+phase, question, presence:{activePlayers:1},
          crowd:{counts:phase==='reveal'?counts:[0,0,0,0],total:stored?1:0,keyCounts:[],scoreSummary:phase==='reveal'?{correctCount:stored?.points?1:0,average:stored?.points||null,best:stored?.points||null,playerPoints:stored ? stored.points * (state.factor || 1) : null}:null},
          playerVote:stored?.vote??null,playerReport:null,previousResults});
      }
      if (url.pathname.startsWith('/api/')) return response({ok:true,activePlayers:0});
      return originalFetch(input,init);
    };
  })();`,
  });
  await page.send("Page.navigate", { url: appUrl + "/play" });
  if (options.skipReady) {
    await page.waitFor(`Boolean(window.__gameplay?.releaseRoom)`);
    return page;
  }
  await page.waitFor(
    `document.querySelector('main')?.dataset.phase === 'answering' && document.querySelector('main')?.dataset.clientReady === 'true'`,
    20000,
  );
  return page;
}
async function change(page, expression) {
  await page.evaluate(`${expression}; window.dispatchEvent(new Event('focus'));`);
  await delay(150);
}
async function correct(page) {
  await page.evaluate(
    `document.querySelectorAll('[data-testid="arcade-answer"]')[${fixtures.trivia.reveal.reveal.correctIndex}].click()`,
  );
  await page.waitFor(`window.__gameplay.voteCalls === 1`);
}
async function reveal(page) {
  await change(page, `window.__gameplay.phase = 'reveal'`);
  await page.waitFor(`document.querySelector('main')?.dataset.phase === 'reveal'`);
}
async function score(page) {
  return page.evaluate(
    `Array.from(document.querySelectorAll('[data-testid="score-grid"] strong'),node=>Number(node.textContent.replaceAll(',','')))`,
  );
}
async function done(page) {
  await page.send("Page.navigate", { url: "about:blank" });
}
async function keyboard(page, key, modifiers = 0) {
  const code = key.length === 1 ? (/\d/.test(key) ? "Digit" + key : "Key" + key.toUpperCase()) : key;
  const windowsVirtualKeyCode = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 13;
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode, modifiers });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode, modifiers });
}
async function press(page, key, code = key, windowsVirtualKeyCode = 13) {
  // Chromium needs text to run native Enter/Space activation, as a real key press does.
  const params = { key, code, windowsVirtualKeyCode };
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", ...params, text: key === "Enter" ? "\r" : key });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", ...params });
}
try {
  for (const option of [
    { failFirst: true },
    { hangFirst: true },
    { blockStorage: true },
    { blockStorageGetter: true },
  ]) {
    const page = await setup(option);
    assert.equal(await page.evaluate(`document.querySelector('main').dataset.phase`), "answering");
    if (option.failFirst || option.hangFirst) assert.ok(await page.evaluate(`window.__gameplay.requests >= 3`));
    if (option.blockStorage || option.blockStorageGetter) {
      await correct(page);
      await reveal(page);
      assert.deepEqual(await score(page), [200, 1]);
    }
    await done(page);
    console.log(`PASS entry and storage ${JSON.stringify(option)}`);
  }
  const first = await setup();
  const second = await setup();
  const before = await first.evaluate(
    `JSON.parse(localStorage.getItem('queue-arcade:stats:v2')||'{"answered":0}').answered`,
  );
  await Promise.all([correct(first), correct(second)]);
  await Promise.all([reveal(first), reveal(second)]);
  assert.deepEqual(await score(first), [200, 1]);
  assert.deepEqual(await score(second), [200, 1]);
  try {
    await first.waitFor(`JSON.parse(localStorage.getItem('queue-arcade:stats:v2')).answered === ${before + 2}`);
  } catch (error) {
    console.error(
      "Guest settlement state",
      await Promise.all(
        [first, second].map((page) =>
          page.evaluate(
            `({stats:localStorage.getItem('queue-arcade:stats:v2'),voter:sessionStorage.getItem('queue-arcade:player:v2:tab'),pending:sessionStorage.getItem('queue-arcade:pending-votes:v2')})`,
          ),
        ),
      ),
    );
    throw error;
  }
  for (const page of [first, second])
    assert.match(
      await page.evaluate(`document.querySelector('[data-testid="kill-streak-banner"]')?.textContent ?? ''`),
      /first blood/i,
    );
  for (let number = 2; number <= 100; number += 1) {
    await Promise.all(
      [first, second].map((page) =>
        change(
          page,
          `window.__gameplay.number = ${number}; window.__gameplay.phase = 'answering'; window.__gameplay.voteCalls = 0`,
        ),
      ),
    );
    await Promise.all([correct(first), correct(second)]);
    await Promise.all([reveal(first), reveal(second)]);
    await first.waitFor(
      `JSON.parse(localStorage.getItem('queue-arcade:stats:v2')).answered === ${before + number * 2}`,
    );
    assert.deepEqual(await score(first), [number * 200, number]);
    assert.deepEqual(await score(second), [number * 200, number]);
  }
  console.log("PASS 100 concurrent rounds preserve all 200 guest lifetime results");
  await first.evaluate(
    `localStorage.setItem('queue-arcade:stats:v2', JSON.stringify({runs:0,answered:0,correct:0,bestScore:0}))`,
  );
  await first.waitFor(`JSON.parse(localStorage.getItem('queue-arcade:stats:v2')).answered === ${before + 200}`);
  console.log("PASS stale local mirror cannot replace the authoritative guest record");
  await done(first);
  await done(second);
  console.log("PASS both guest tabs receive one score and one streak increment");
  for (const connected of [false, true]) {
    const page = await setup({ connected });
    const previousAnswered = await page.evaluate(
      `JSON.parse(localStorage.getItem('queue-arcade:stats:v2')||'{"answered":0}').answered`,
    );
    await correct(page);
    await change(page, `window.__gameplay.number += 2`);
    await page.waitFor(`document.querySelector('[data-testid="score-grid"] strong')?.textContent === '200'`);
    assert.deepEqual(await score(page), [200, 1]);
    assert.ok(await page.evaluate(`window.__gameplay.queries.some(query => query.includes(':round:1'))`));
    assert.ok(
      await page.evaluate(
        `Boolean(document.querySelector('[data-testid="score-grid"]').parentElement.querySelector('[title*="Round 1"]'))`,
      ),
    );
    await change(page, "void 0");
    assert.deepEqual(await score(page), [200, 1]);
    if (connected)
      assert.equal(
        await page.evaluate(`JSON.parse(localStorage.getItem('queue-arcade:stats:v2')).answered`),
        previousAnswered,
      );
    await done(page);
    console.log(`PASS missed reveal recovers once for ${connected ? "connected" : "guest"} session`);
  }
  const late = await setup({ holdCommit: true });
  await correct(late);
  await change(late, "window.__gameplay.number = 2");
  await late.evaluate("window.__gameplay.releaseVote()");
  await late.waitFor(`document.querySelector('[data-testid="score-grid"] strong')?.textContent === '200'`);
  assert.deepEqual(await score(late), [200, 1]);
  await change(late, "window.__gameplay.number = 3");
  assert.deepEqual(await score(late), [200, 1]);
  await done(late);
  console.log("PASS vote committed after round transition recovers in the same current round");
  const revised = await setup();
  const previousBest = await revised.evaluate(
    `JSON.parse(localStorage.getItem('queue-arcade:stats:v2') || '{}').bestScore || 0`,
  );
  await correct(revised);
  await revised.evaluate("window.__gameplay.factor = 2");
  await reveal(revised);
  assert.deepEqual(await score(revised), [400, 1]);
  await change(revised, "window.__gameplay.factor = 1");
  assert.deepEqual(await score(revised), [200, 1]);
  await revised.waitFor(
    `JSON.parse(localStorage.getItem('queue-arcade:stats:v2')).bestScore === ${Math.max(previousBest, 200)}`,
  );
  await done(revised);
  console.log("PASS changed crowd award corrects score without counting the answer again");
  const conflict = await setup({ connected: true, authoritativeCorrect: true, holdResponse: true });
  await conflict.evaluate(
    `document.querySelectorAll('[data-testid="arcade-answer"]')[${(fixtures.trivia.reveal.reveal.correctIndex + 1) % 4}].click()`,
  );
  await conflict.waitFor("window.__gameplay.voteCalls === 1");
  await reveal(conflict);
  assert.deepEqual(await score(conflict), [200, 1]);
  await conflict.evaluate("window.__gameplay.releaseVote()");
  await delay(100);
  assert.deepEqual(await score(conflict), [200, 1]);
  await done(conflict);
  console.log("PASS accepted account answer replaces a conflicting local choice before POST returns");
  const navigation = await setup({ holdRoom: true, skipReady: true });
  await navigation.evaluate(`document.querySelector('[data-testid="private-room-open"]').click()`);
  await navigation.waitFor(`location.pathname === '/party'`);
  await navigation.evaluate("window.__gameplay.releaseRoom()");
  await delay(300);
  assert.equal(await navigation.evaluate("location.pathname"), "/party");
  assert.equal(await navigation.evaluate(`document.querySelector('main')?.dataset.phase`), "lobby");
  await done(navigation);
  console.log("PASS leaving pending public entry cancels its result");
  const profile = await setup({ connected: true });
  await profile.evaluate(
    `window.__gameplay.profileFailure = true; document.querySelector('[data-testid="site-home"]').click()`,
  );
  await profile.waitFor(`document.querySelector('main')?.dataset.phase === 'lobby'`);
  await delay(100);
  assert.equal(
    await profile.evaluate(
      `document.querySelector('[data-testid="profile-action"]')?.textContent.includes('Fixture player')`,
    ),
    true,
  );
  await done(profile);
  console.log("PASS transient profile failure preserves the known account");
  const denied = await setup({ blockIndexedDB: true });
  const persistentBefore = await denied.evaluate(`localStorage.getItem('queue-arcade:stats:v2')`);
  await correct(denied);
  await reveal(denied);
  assert.deepEqual(await score(denied), [200, 1]);
  assert.equal(await denied.evaluate(`localStorage.getItem('queue-arcade:stats:v2')`), persistentBefore);
  assert.ok(await denied.evaluate(`sessionStorage.getItem('queue-arcade:pending-votes:v2').includes(':round:1')`));
  await done(denied);
  console.log("PASS denied IndexedDB keeps play usable and does not overwrite shared lifetime data");
  const classic = await setup();
  for (const [key, modifier] of [
    ["a", 2],
    ["c", 2],
    ["d", 2],
    ["1", 1],
    ["a", 4],
  ])
    await keyboard(classic, key, modifier);
  assert.equal(await classic.evaluate("window.__gameplay.voteCalls"), 0);
  await keyboard(classic, "a");
  await classic.waitFor("window.__gameplay.voteCalls === 1");
  await done(classic);
  console.log("PASS browser commands do not submit classic answers");
  for (const kind of ["year", "hero"]) {
    const page = await setup({ kind });
    if (kind === "hero") {
      // The hero grid attaches its typing shortcut after it mounts. Wait for the
      // grid, then confirm the filter received every letter before moving on.
      await page.waitFor(`document.querySelectorAll('[data-testid="hero-picker-hero"]').length > 100`);
      for (const letter of "abaddon") await keyboard(page, letter);
      await page.waitFor(`document.querySelector('[data-testid="hero-search"]')?.dataset.query === "abaddon"`);
    }
    const mute = '[aria-label="Mute game sounds"], [aria-label="Enable game sounds"]';
    const original = await page.evaluate(`document.querySelector('${mute}').getAttribute('aria-pressed')`);
    await page.evaluate(`document.querySelector('${mute}').focus()`);
    await press(page, "Enter");
    await delay(80);
    assert.notEqual(await page.evaluate(`document.querySelector('${mute}').getAttribute('aria-pressed')`), original);
    assert.equal(await page.evaluate("window.__gameplay.voteCalls"), 0);
    await press(page, " ", "Space", 32);
    await delay(80);
    assert.equal(await page.evaluate(`document.querySelector('${mute}').getAttribute('aria-pressed')`), original);
    assert.equal(await page.evaluate("window.__gameplay.voteCalls"), 0);
    await page.evaluate("document.activeElement.blur()");
    await press(page, "Enter");
    await page.waitFor("window.__gameplay.voteCalls === 1");
    await done(page);
    console.log(`PASS focused mute keeps native keyboard behavior in ${kind}`);
  }
} finally {
  await browser.close();
}
