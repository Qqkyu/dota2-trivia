#!/usr/bin/env node

// Render all answer formats, both phases, and party controls at phone through 4K sizes.
// Mock only the public API snapshots; the actual Next pages, CSS and controls render.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { soundBrowser, delay, click } from "./lib/feedback-browser.mjs";
import { publicQuestionForRound } from "../src/lib/public-question.mjs";

const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const evidence = process.env.RESPONSIVE_SCREENSHOTS;
// Visual reviews need real artwork; ordinary layout checks keep all API traffic blocked.
const loadArtwork = Boolean(evidence) && process.env.RESPONSIVE_ARTWORK === "1";
const viewports = [
  [320, 568],
  [360, 640],
  [390, 844],
  [568, 320],
  [768, 1024],
  [1280, 640],
  [1920, 1080],
  [2560, 1440],
  [3440, 1440],
  [3840, 2160],
  [960, 540],
];
const selectedViewports = process.env.RESPONSIVE_VIEWPORTS
  ? viewports.filter(([width, height]) => process.env.RESPONSIVE_VIEWPORTS.split(",").includes(`${width}x${height}`))
  : viewports;
assert.ok(selectedViewports.length, "No responsive viewports selected");
const definitions = [
  ...[
    "mana-cost",
    "cooldown",
    "ability-damage",
    "hero-move-speed",
    "hero-stat-duel",
    "item-cost",
    "item-price-duel",
    "recipe-component",
    "recipe-upgrade",
  ].map((kind) => ["trivia", "questions.generated", kind]),
  ["shopkeeper", "shopkeeper-questions", "shopkeeper-build-result"],
  ["shopkeeper", "shopkeeper-questions", "shopkeeper-real-recipe"],
  ["shopkeeper", "shopkeeper-questions", "shopkeeper-shared-part"],
  ["shopkeeper", "shopkeeper-questions", "shopkeeper-upgrade-path"],
  ["spell-link", "questions.generated", "spell-owner"],
  ["fogged-vision", "questions.generated", "fogged-hero"],
  ["echo-hunt", "questions.generated", "hero-voice"],
  ["quote-hunt", "questions.generated", "hero-quote"],
  ["aghanim-lab", "aghanim-questions", "aghanim-upgrade"],
  ["soundcheck", "soundcheck-questions", "soundcheck-ability", "single"],
  ["soundcheck", "soundcheck-questions", "soundcheck-ability", "sequence"],
  ["soundcheck", "soundcheck-questions", "soundcheck-item", "single"],
  ["soundcheck", "soundcheck-questions", "soundcheck-item", "sequence"],
  ...[
    "value-order-item",
    "value-order-cooldown",
    "value-order-mana",
    "value-order-damage",
    "value-order-move-speed",
    "value-order-attack-range",
  ].map((kind) => ["order-up", "value-order-questions", kind]),
  ["flashback", "flashback-questions", "flashback-year"],
  ["flashback", "flashback-questions", "flashback-choice"],
  ["flashback", "flashback-questions", "flashback-order"],
];
const selectedDefinitions = process.env.RESPONSIVE_CASES
  ? definitions.filter(([, , kind, format]) =>
      process.env.RESPONSIVE_CASES.split(",").includes(kind + (format ? `-${format}` : "")),
    )
  : definitions;
assert.ok(selectedDefinitions.length, "No responsive fixtures selected");
const now = Date.now();
const fixtures = await Promise.all(
  selectedDefinitions.map(async ([game, file, sourceKind, format]) => {
    const kind = sourceKind + (format ? `-${format}` : "");
    const data = JSON.parse(await readFile(new URL(`../src/data/${file}.json`, import.meta.url)));
    const copyLength = (question) =>
      process.env.RESPONSIVE_LONGEST === "explanation"
        ? (question.explanation?.length ?? 0)
        : [
            question.prompt,
            question.detail,
            question.hint,
            question.aghanim?.effect,
            ...(question.answers ?? []),
          ].reduce((sum, text) => sum + (text?.length ?? 0), 0);
    const raw = data
      .filter((question) => question.kind === sourceKind && (!format || question.soundcheck?.format === format))
      .sort((a, b) => copyLength(b) - copyLength(a))[0];
    assert.ok(raw, `Missing ${kind}`);
    const question = (phase) => {
      const publicQuestion = publicQuestionForRound(
        raw,
        {
          id: `responsive-${kind}`,
          game,
          phase,
          answerDeadline: phase === "reveal" ? now - 100 : now + 15000,
          answerDuration: 15000,
        },
        now,
      );
      if (publicQuestion.image?.src?.startsWith("/api/round-image")) publicQuestion.image.src = raw.image.src;
      return publicQuestion;
    };
    return { game, kind, sourceQuestionId: raw.id, answering: question("answering"), reveal: question("reveal") };
  }),
);
if (evidence) await mkdir(evidence, { recursive: true });
const browser = await soundBrowser();
const failures = [];
const results = [];
let checks = 0;
async function check(name, run) {
  try {
    await run();
    checks++;
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
async function inspect(page, label, width) {
  await delay(80);
  if (loadArtwork) {
    await page.evaluate(`Promise.all([...document.images].map(image => image.complete ? Promise.resolve() : new Promise(resolve => {
      image.addEventListener('load', resolve, {once:true});
      image.addEventListener('error', resolve, {once:true});
      setTimeout(resolve, 5000);
    })))`);
  }
  const geometry = await page.evaluate(`(() => {
    const rect = element => { const r = element.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom }; };
    const targets = [...document.querySelectorAll('[data-testid="hero-picker"] button, [data-testid="shopkeeper-store"] button')].filter(element => !element.disabled && element.getClientRects().length).map(element => ({ name:element.getAttribute('aria-label') || element.textContent, ...rect(element) }));
    const prompt = document.querySelector('[data-testid="round-prompt"]');
    const clippedText = prompt ? [...prompt.querySelectorAll('h2, p, blockquote, [class*="questionCopy"] small, [class*="clueList"] span')].filter(element => {
      if (!element.getClientRects().length) return false;
      if (element.scrollHeight > element.clientHeight + 2 && !['auto','scroll','visible'].includes(getComputedStyle(element).overflowY)) return true;
      const r = element.getBoundingClientRect();
      for (let parent=element.parentElement; parent && prompt.contains(parent); parent=parent.parentElement) {
        const outer=parent.getBoundingClientRect();
        if (getComputedStyle(parent).overflowY==='hidden' && (r.top<outer.top-2 || r.bottom>outer.bottom+2)) return true;
      }
      return false;
    }).map(element => element.textContent) : [];
    const clippedOrderLabels = [...document.querySelectorAll('[data-testid="value-order-sequence"] strong, [data-testid="value-order-sequence"] em')].filter(element => {
      const r=element.getBoundingClientRect(), outer=element.parentElement.getBoundingClientRect();
      return r.width < 40 || r.right>outer.right || r.bottom>outer.bottom || element.scrollHeight>element.clientHeight+2;
    }).map(element => element.textContent);
    const explanation = document.querySelector('[data-testid="reveal-explanation"]');
    const clippedExplanation = explanation && explanation.scrollHeight > explanation.clientHeight + 2;
    return { clippedOrderLabels, hasExplanation:!!explanation, clippedExplanation, phase:document.querySelector("main")?.dataset.phase, width:innerWidth, availableWidth:document.documentElement.clientWidth, scrollWidth:document.documentElement.scrollWidth, targets, clippedText };
  })()`);
  results.push({ label, ...geometry });
  if (evidence) {
    const shot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(`${evidence}/${label}.png`, Buffer.from(shot.data, "base64"));
    for (const [selector, suffix] of [
      [
        '[data-testid="hero-picker"], [data-testid="shopkeeper-store"], [data-testid="answer-grid"], [data-testid="value-order-board"], [data-testid="flashback-year-board"], [data-testid="flashback-order-board"]',
        "controls",
      ],
      ['[data-testid="reveal-panel"]', "result"],
    ]) {
      const offscreen = await page.evaluate(
        `(() => { const node=document.querySelector(${JSON.stringify(selector)}); if(!node) return false; const r=node.getBoundingClientRect(); return r.bottom>innerHeight || r.top<0; })()`,
      );
      if (!offscreen) continue;
      await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:"center"})`);
      const detail = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await writeFile(`${evidence}/${label}-${suffix}.png`, Buffer.from(detail.data, "base64"));
    }
    await page.evaluate("window.scrollTo(0,0)");
  }
  await check(`${label} fits width`, () =>
    assert.ok(
      geometry.scrollWidth <= Math.min(width, geometry.availableWidth) + 1,
      `${geometry.scrollWidth}px document; ${geometry.availableWidth}px available in ${width}px viewport`,
    ),
  );
  await check(`${label} keeps prompt text visible`, () => assert.deepEqual(geometry.clippedText, []));
  if (geometry.hasExplanation) {
    await check(`${label} shows the full explanation`, () => assert.equal(geometry.clippedExplanation, false));
    await check(`${label} explanation lines remain reachable`, async () => {
      const issues = await page.evaluate(`(async () => {
        const explanation = document.querySelector('[data-testid="reveal-explanation"]');
        const range = document.createRange();
        range.selectNodeContents(explanation);
        const lines = () => [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
        const issues = [];
        const initial = {left:scrollX,top:scrollY};
        const header = document.querySelector('[data-testid="round-timer"]')?.parentElement;
        const fixedHeader = header?.closest('[class*="roundHeader"]');
        const offset = fixedHeader && getComputedStyle(fixedHeader).position === 'sticky' ? fixedHeader.getBoundingClientRect().height + 8 : 8;
        try {
          for (const edge of ['first','last']) {
            let rects = lines();
            const target = edge === 'first' ? rects[0] : rects.at(-1);
            if (!target) { issues.push('Explanation has no text lines'); break; }
            window.scrollTo({top:scrollY + target.top - offset,behavior:'instant'});
            await new Promise(resolve => requestAnimationFrame(resolve));
            rects = lines();
            const visible = edge === 'first' ? rects[0] : rects.at(-1);
            const x = visible.left + visible.width / 2, y = visible.top + visible.height / 2;
            if (visible.top < 0 || visible.bottom > innerHeight + 1 || !explanation.contains(document.elementFromPoint(x,y))) issues.push(edge + ' explanation line is hidden after scrolling');
          }
        } finally { window.scrollTo({...initial,behavior:'instant'}); }
        return issues;
      })()`);
      assert.deepEqual(issues, []);
    });
  }
  if (geometry.clippedOrderLabels.length || label.includes("value-order"))
    await check(`${label} keeps ordering labels readable`, () => assert.deepEqual(geometry.clippedOrderLabels, []));
  if (geometry.targets.length) {
    const minimum = width <= 960 ? 44 : 24;
    const tooSmall = geometry.targets.filter((target) => target.width < minimum - 1 || target.height < minimum - 1);
    await check(`${label} answer targets`, () =>
      assert.deepEqual(
        tooSmall.slice(0, 3),
        [],
        `Targets smaller than ${minimum}px: ${JSON.stringify(tooSmall.slice(0, 3))}`,
      ),
    );
  }
  if (width <= 680 && geometry.phase === "answering" && geometry.targets.length) {
    await check(`${label} keeps the timer visible at the answers`, async () => {
      await page.evaluate(
        `document.querySelector('[data-testid="hero-picker"], [data-testid="shopkeeper-store"]').scrollIntoView({block:"center"})`,
      );
      const timer = await page.evaluate(
        `(() => { const r=document.querySelector('[data-testid="round-timer"]').getBoundingClientRect(); return {top:r.top,bottom:r.bottom,height:innerHeight}; })()`,
      );
      assert.ok(
        timer.top >= 0 && timer.bottom <= timer.height,
        `Round timer is outside the viewport: ${JSON.stringify(timer)}`,
      );
      await page.evaluate("window.scrollTo(0,0)");
    });
  }
}
async function reachable(page, selector, label) {
  const clipped = await page.evaluate(
    `(() => { const node = document.querySelector(${JSON.stringify(selector)}); const rect = node.getBoundingClientRect(); for(let parent=node.parentElement; parent; parent=parent.parentElement){ if(getComputedStyle(parent).overflowY !== 'hidden') continue; const outer=parent.getBoundingClientRect(); if(rect.bottom>outer.bottom+1 || rect.top<outer.top-1) return true; } return false; })()`,
  );
  assert.equal(clipped, false, `${label} is inside a clipped container`);
  await page.evaluate(
    `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:"center", inline:"nearest"})`,
  );
  await delay(40);
  const status = await page.evaluate(
    `(() => { const node=document.querySelector(${JSON.stringify(selector)}); const rect=node.getBoundingClientRect(); const x=rect.left+rect.width/2,y=rect.top+rect.height/2; return {height:rect.height,visible:y>=0 && y<innerHeight && x>=0 && x<innerWidth && node.contains(document.elementFromPoint(x,y))}; })()`,
  );
  assert.ok(status.visible, `${label} stays clipped after scrolling`);
  assert.ok(status.height >= 36, `${label} is ${status.height}px high`);
}
try {
  const { page } = await browser.newPage();
  if (loadArtwork) await page.send("Network.setBlockedURLs", { urls: [] });
  // A crashed or stalled renderer must fail the check instead of leaving CI open.
  for (const method of ["send", "evaluate", "waitFor"]) {
    const original = page[method].bind(page);
    page[method] = (...args) =>
      new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`Browser ${method} timed out: ${String(args[0]).slice(0, 160)}`)),
          45000,
        );
        original(...args)
          .then(resolve, reject)
          .finally(() => clearTimeout(timeout));
      });
  }
  if (process.env.RESPONSIVE_SESSION)
    await page.send("Network.setCookie", {
      name: "queue_arcade_session",
      value: process.env.RESPONSIVE_SESSION,
      url: appUrl,
    });
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
    const fixtures=${JSON.stringify(fixtures)};
    const state=window.__responsive={index:0,phase:'answering',gate:true,waiting:true,players:100};
    const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
    const original=window.fetch.bind(window);
    const party=()=>({waiting:state.waiting,countdownMs:0,nameTaken:false,privateRoom:{code:'RESPUI',games:['trivia'],formats:[],startedAt:state.waiting?null:Date.now()-1000,isHost:true,players:Array.from({length:state.players},(_,index)=>({name:'Long_player_name_'+String(index).padStart(3,'0'),host:index===0,self:index===0,score:index,away:false})),messages:Array.from({length:40},(_,index)=>({id:'m'+index,name:'Long_player_name_100',text:'A longer message that wraps on a small phone screen '+index,at:Date.now()}))},presence:{activePlayers:state.players}});
    window.fetch=async(input,init={})=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      if(url.pathname==='/api/me')return json({authenticated:false});
      if(url.pathname==='/api/private-rooms')return json(party());
      if(url.pathname==='/api/private-rooms/start'){state.waiting=false;state.gate=false;return json(party());}
      if(url.pathname==='/api/rounds'){
        const fixture=fixtures[state.index],now=Date.now(),gate=state.gate;state.gate=false;
        const phase=gate?'reveal':state.phase;
        const round={id:gate?'responsive-gate':'responsive-'+fixture.kind,number:state.index+1,game:fixture.game,phase,startedAt:now-1000,answerDeadline:phase==='reveal'?now-100:now+60000,revealDeadline:gate?now+50:now+65000,answerDuration:15000};
        return json({serverNow:now,room:{id:'responsive-room',gameId:'dota2',contentVersion:'responsive',mode:'mixed',filter:'Mixed'},round,questionRevision:round.id+':'+phase,question:gate?null:fixture[phase],presence:{activePlayers:100},crowd:{counts:[0,0,0,0],total:0,keyCounts:[],scoreSummary:null},playerVote:null,playerReport:null,previousResults:[]});
      }
       if(${loadArtwork} && (url.pathname.startsWith('/api/art/') || url.pathname==='/api/round-image'))return original(input,init);
       if(url.pathname.startsWith('/api/'))return json({ok:true});
      return original(input,init);
    };
  })();`,
  });
  for (const [width, height] of selectedViewports) {
    const size = `${width}x${height}`;
    await page.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: size === "960x540" ? 2 : 1,
      mobile: false,
    });
    for (const path of ["/", "/party", "/profile", "/privacy", "/calibration", "/ops"]) {
      await page.send("Page.navigate", { url: appUrl + path });
      await page.waitFor(`document.readyState === 'complete' && !!document.querySelector('main')`);
      await inspect(page, `${size}-${path.slice(1) || "home"}`, width);
      if (path === "/" && width <= 390)
        await check(`${size} Play is visible without scrolling`, async () => {
          const bottom = await page.evaluate(
            `document.querySelector('[data-testid="start-arcade"]').getBoundingClientRect().bottom`,
          );
          assert.ok(bottom <= height, `Play ends at ${bottom}px, below the ${height}px viewport`);
        });
      if (path === "/calibration" && width === 320)
        await check("Phone calibration pages can be changed above the results", async () => {
          await page.waitFor(
            `Object.keys(document.querySelector('[data-testid="calibration-top-next-page"]') || {}).some(key => key.startsWith('__reactProps') && typeof document.querySelector('[data-testid="calibration-top-next-page"]')[key]?.onClick === 'function')`,
          );
          const firstQuestion = await page.evaluate(
            `document.querySelector('[data-testid="calibration-row"]').textContent`,
          );
          await click(page, '[data-testid="calibration-top-next-page"]');
          await page.waitFor(
            `document.querySelector('[aria-label="Calibration pages above results"]').textContent.includes('Page 2')`,
          );
          assert.notEqual(
            await page.evaluate(`document.querySelector('[data-testid="calibration-row"]').textContent`),
            firstQuestion,
          );
          await click(page, '[data-testid="calibration-top-previous-page"]');
          await page.waitFor(
            `document.querySelector('[aria-label="Calibration pages above results"]').textContent.includes('Page 1')`,
          );
        });
      if (path === "/party") {
        await page.waitFor(`!!document.querySelector('[data-testid="private-room-choose-create"]')`);
        await click(page, '[data-testid="private-room-choose-create"]');
        await page.waitFor(`!!document.querySelector('[data-testid="private-room-create"]')`);
        await inspect(page, `${size}-party-create`, width);
        await check(`${size} Create reachable`, () => reachable(page, '[data-testid="private-room-create"]', "Create"));
      }
    }
    await page.send("Page.navigate", { url: appUrl + "/play?room=RESPUI" });
    await page.waitFor(`!!document.querySelector('[data-testid="private-room-start"]')`);
    await inspect(page, `${size}-party100`, width);
    for (const control of [
      "private-room-start",
      "private-room-chat-input",
      "private-room-chat-send",
      "private-room-chat-toggle",
    ]) {
      await check(`${size} ${control} reachable`, () => reachable(page, `[data-testid="${control}"]`, control));
    }
    await click(page, '[data-testid="private-room-start"]');
    await page.waitFor(`!!document.querySelector('[data-testid="private-room-play-dock"]')`);
    await inspect(page, `${size}-party-play100`, width);
    for (const control of ["private-room-chat-input", "private-room-chat-send", "private-room-chat-toggle"]) {
      await check(`${size} active ${control} reachable`, () => reachable(page, `[data-testid="${control}"]`, control));
    }
    await page.send("Page.navigate", { url: appUrl + "/play" });
    await page.waitFor(`document.querySelector('main')?.dataset.phase==='answering'`);
    for (let index = 0; index < fixtures.length; index++) {
      for (const phase of ["answering", "reveal"]) {
        await page.evaluate(
          `Object.assign(window.__responsive,{index:${index},phase:${JSON.stringify(phase)}});window.scrollTo(0,0);window.dispatchEvent(new Event("focus"))`,
        );
        await page.waitFor(
          `document.querySelector('main')?.dataset.roundId === ${JSON.stringify(`responsive-${fixtures[index].kind}`)} && document.querySelector('main')?.dataset.phase === ${JSON.stringify(phase)}`,
        );
        await inspect(page, `${size}-${fixtures[index].kind}-${phase}`, width);
      }
    }
    console.log(`Checked ${size}${size === "960x540" ? " (1920x1080 at 200% reflow)" : ""}`);
  }
} catch (error) {
  failures.push(`Browser matrix stopped: ${error.message}`);
  console.error(error);
} finally {
  await browser.close();
}
if (evidence)
  await writeFile(
    `${evidence}/results.json`,
    JSON.stringify(
      {
        checks,
        failures,
        fixtures: fixtures.map(({ kind, sourceQuestionId }) => ({ kind, sourceQuestionId })),
        results,
      },
      null,
      2,
    ),
  );
assert.equal(failures.length, 0, `${failures.length} responsive failures:\n${failures.join("\n")}`);
console.log(`Responsive UI: ${checks} checks passed.`);
