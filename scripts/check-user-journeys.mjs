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
import { LOCALE_COOKIE } from "../src/i18n/locales.mjs";
import { clueStageAt, scoreBreakdown } from "../src/lib/scoring.mjs";
import { recipeItemsFromAnswerKey } from "../src/lib/item-picker.mjs";

const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const evidence =
  process.env.JOURNEY_EVIDENCE_DIR ??
  (process.env.JOURNEY_CASE?.includes("council candidate6")
    ? "/tmp/dota2-trivia-council-polish/benchmark/candidate-6-flow-tests"
    : process.env.JOURNEY_CASE?.includes("council candidate5")
      ? "/tmp/dota2-trivia-council-polish/benchmark/candidate-5-flow-tests"
      : "/tmp/queue-arcade-deep-review/evidence");
await mkdir(evidence, { recursive: true });
const browser = await journeyBrowser(appUrl);
const results = [];
async function check(name, options, run) {
  if (process.env.JOURNEY_CASE && !name.includes(process.env.JOURNEY_CASE)) return;
  let page;
  try {
    if (options.locale)
      await browser.page.send("Network.setCookie", { name: LOCALE_COOKIE, value: options.locale, url: appUrl });
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
    if (options.locale) await browser.page.send("Network.setCookie", { name: LOCALE_COOKIE, value: "en", url: appUrl });
    await writeFile(`${evidence}/user-journeys.json`, JSON.stringify(results, null, 2) + "\n");
  }
}
const votes = (page) => page.evaluate("window.__journey.submissions.length");
async function finishRound(page) {
  await changeRound(page, `window.__journey.phase='reveal'`);
  await page.waitFor(`document.querySelector('main')?.dataset.phase==='reveal'`);
}
async function answerByTouch(page, kind, expectedVotes = 1) {
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
  await page.waitFor(`window.__journey.submissions.length===${expectedVotes}`);
}
async function councilViewport(page, width, height) {
  await page.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 680,
  });
  await page.evaluate("document.fonts.ready.then(() => true)");
  await page.evaluate("window.scrollTo(0,0)");
  await delay(100);
}
async function councilLayout(page, selectors) {
  return page.evaluate(`(() => {
    const elements=Object.fromEntries(${JSON.stringify(selectors)}.map(selector=>[selector,
      [...document.querySelectorAll(selector)].map(node=>{
        const box=node.getBoundingClientRect(),style=getComputedStyle(node);
        return {top:box.top,bottom:box.bottom,left:box.left,right:box.right,width:box.width,height:box.height,
          visible:box.width>0&&box.height>0&&style.visibility!=='hidden'&&style.display!=='none',
          text:node.textContent.trim(),disabled:node.matches(':disabled'),
          clientWidth:node.clientWidth,scrollWidth:node.scrollWidth};
      })]));
    return {width:innerWidth,height:innerHeight,scrollX,scrollY,scrollWidth:document.scrollingElement.scrollWidth,elements};
  })()`);
}
function councilFits(layout, selector, { viewport = false, count = 1 } = {}) {
  const boxes = layout.elements[selector];
  assert.equal(boxes.length, count, `Expected ${count} ${selector}`);
  for (const box of boxes) {
    assert.ok(box.visible, `${selector} is hidden: ${JSON.stringify(box)}`);
    assert.ok(
      box.left >= -1 && box.right <= layout.width + 1,
      `${selector} overflows horizontally: ${JSON.stringify(box)}`,
    );
    if (viewport)
      assert.ok(
        box.top >= 0 && box.bottom <= layout.height,
        `${selector} is below the viewport: ${JSON.stringify(box)}`,
      );
  }
}
function councilStable(before, after, selectors) {
  for (const selector of selectors) {
    assert.equal(after.elements[selector].length, before.elements[selector].length, `${selector} count changed`);
    for (let index = 0; index < before.elements[selector].length; index += 1) {
      for (const edge of ["top", "left", "width", "height"])
        assert.ok(
          Math.abs(after.elements[selector][index][edge] - before.elements[selector][index][edge]) <= 1,
          `${selector} ${edge} moved: ${JSON.stringify({ before: before.elements[selector][index], after: after.elements[selector][index] })}`,
        );
    }
  }
}
async function councilEvidence(page, name, detail) {
  const stem = `${evidence}/${name.replace(/[^a-z0-9]+/gi, "-")}`;
  await writeFile(stem + ".json", JSON.stringify(detail, null, 2) + "\n");
  const screenshot = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile(stem + ".png", Buffer.from(screenshot.data, "base64"));
}
async function councilEntryWait(page) {
  // Keep the helper's initial public question. Only extend its 80ms reveal window.
  await page.evaluate(`(() => {
    const fixtureFetch=window.fetch.bind(window),entry=window.__entryWaitFixture={hold:true,snapshot:null};
    window.fetch=async (input,init)=>{
      const response=await fixtureFetch(input,init);
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      if(url.pathname!=='/api/rounds'||!entry.hold) return response;
      if(!entry.snapshot) {
        const snapshot=await response.json(),now=snapshot.serverNow;
        if(snapshot.round.phase!=='reveal') throw new Error('Fixture did not start in reveal');
        entry.snapshot={...snapshot,round:{...snapshot.round,startedAt:now-15000,answerDeadline:now-1,revealDeadline:now+30000}};
      }
      return new Response(JSON.stringify({...entry.snapshot,serverNow:Date.now()}),
        {status:200,headers:{'Content-Type':'application/json'}});
    };
  })()`);
  await click(page, '[data-testid="start-arcade"]');
  await page.waitFor(`!!document.querySelector('[data-testid="entry-wait-tips"]')`, 5000);
}
async function councilHeroState(page) {
  return page.evaluate(`(() => {
    const picker=document.querySelector('[data-testid="hero-picker"]');
    return {height:picker.getBoundingClientRect().height,
      status:picker.querySelector('[data-testid="hero-picker-status"]').textContent.trim(),
      enabled:picker.querySelectorAll('button:enabled,input:enabled').length,
      hasSearch:!!picker.querySelector('[data-testid="hero-search-input"]'),
      cards:[...picker.querySelectorAll('[data-testid="hero-picker-hero"]')].map(node=>({
        key:node.dataset.heroKey,label:node.getAttribute('aria-label'),state:node.dataset.state,
        name:node.querySelector(':scope > strong')?.textContent??null,
        nameWidth:node.querySelector(':scope > strong')?.getBoundingClientRect().width??0,
        share:node.querySelector(':scope > i')?.textContent??null,disabled:node.matches(':disabled')}))};
  })()`);
}
async function councilPracticeState(page) {
  return page.evaluate(`(() => {
    const stage=document.querySelector('[data-testid="entry-wait-stage"]'),violations=[];
    const rect=node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
    const fits=(r,b,x=true,y=true)=>(!x||(r.left>=b.left-1&&r.right<=b.right+1))&&(!y||(r.top>=b.top-1&&r.bottom<=b.bottom+1));
    const cards=[...document.querySelectorAll('[data-panel="keys"][data-active="true"] [data-testid="practice-answer"]')].map((button,index)=>{
      const box=rect(button),texts=[];
      const check=(r,parent,label)=>{
        if(!fits(r,box)) violations.push('Choice '+(index+1)+' '+label+' exceeds its button');
        for(let node=parent;node&&stage.contains(node);node=node.parentElement) {
          const style=getComputedStyle(node),x=/(hidden|clip|auto|scroll)/.test(style.overflowX),y=/(hidden|clip|auto|scroll)/.test(style.overflowY);
          if((x||y)&&!fits(r,rect(node),x,y)) violations.push('Choice '+(index+1)+' '+label+' clipped by '+(node.dataset.testid||node.dataset.panel||node.className));
          if(node===stage) break;
        }
      };
      check(box,button.parentElement,'button');
      const walker=document.createTreeWalker(button,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()) {
        const text=walker.currentNode;if(!text.textContent.trim()) continue;
        const range=document.createRange();range.selectNodeContents(text);
        for(const r of range.getClientRects()) {if(!r.width||!r.height) continue;const bounds={top:r.top,bottom:r.bottom,left:r.left,right:r.right};
          texts.push({text:text.textContent.trim(),...bounds});check(bounds,text.parentElement,'text '+text.textContent.trim());}
      }
      return {box,text:button.textContent.trim(),pressed:button.getAttribute('aria-pressed'),disabled:button.disabled,texts};
    });
    return {stage:rect(stage),cards,violations:[...new Set(violations)]};
  })()`);
}
async function councilReadable(page, selector) {
  return page.evaluate(`(() => {
    const rect=node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
    const fits=(r,b,x=true,y=true)=>(!x||(r.left>=b.left-1&&r.right<=b.right+1))&&(!y||(r.top>=b.top-1&&r.bottom<=b.bottom+1));
    return [...document.querySelectorAll(${JSON.stringify(selector)})].map((node,index)=>{
      const box=rect(node),texts=[],violations=[],walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()) {
        const text=walker.currentNode;if(!text.textContent.trim()) continue;
        const range=document.createRange();range.selectNodeContents(text);
        for(const r of range.getClientRects()) {
          if(!r.width||!r.height) continue;
          const bounds={top:r.top,bottom:r.bottom,left:r.left,right:r.right},label=text.textContent.trim();
          texts.push({text:label,...bounds});
          if(!fits(bounds,box)) violations.push(label+' exceeds its container');
          for(let parent=text.parentElement;parent&&node.contains(parent);parent=parent.parentElement) {
            const style=getComputedStyle(parent),x=/(hidden|clip|auto|scroll)/.test(style.overflowX),y=/(hidden|clip|auto|scroll)/.test(style.overflowY);
            if((x||y)&&!fits(bounds,rect(parent),x,y)) violations.push(label+' is clipped');
            if(style.visibility==='hidden'||Number(style.opacity)===0) violations.push(label+' is hidden');
          }
        }
      }
      for(const [i,a] of texts.entries()) for(const b of texts.slice(i+1))
        if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)
          violations.push(a.text+' overlaps '+b.text);
      return {index,box,text:node.textContent.trim(),texts,violations:[...new Set(violations)]};
    });
  })()`);
}
function councilAssertReadable(entries, count) {
  assert.equal(entries.length, count);
  for (const entry of entries) {
    assert.ok(entry.box.width > 0 && entry.box.height > 0 && entry.texts.length > 0, "Text must be rendered");
    assert.deepEqual(entry.violations, [], `Unreadable text: ${JSON.stringify(entry)}`);
  }
}
async function councilRosterState(page) {
  return page.evaluate(`(() => {
    const list=document.querySelector('[data-testid="private-room-players-scroll"]'),box=list.getBoundingClientRect();
    const last=list.querySelector('li:last-child'),end=last.getBoundingClientRect();
    const cue=document.querySelector('[data-testid="private-room-more-players"]');
    return {role:list.getAttribute('role'),label:list.getAttribute('aria-label'),tabIndex:list.tabIndex,
      focused:document.activeElement===list,scrollTop:list.scrollTop,scrollHeight:list.scrollHeight,clientHeight:list.clientHeight,
      moreBelow:list.scrollHeight-list.scrollTop>list.clientHeight+1,
      cueCount:document.querySelectorAll('[data-testid="private-room-more-players"]').length,cue:cue?.textContent.trim()??null,
      rows:list.querySelectorAll('li').length,last:last.querySelector('strong')?.textContent.trim(),
      lastVisible:end.top>=box.top-1&&end.bottom<=box.bottom+1};
  })()`);
}
const councilShopNames = {
  assault: "Assault Cuirass",
  basher: "Skull Basher",
  sange: "Sange",
  soul_booster: "Soul Booster",
  veil_of_discord: "Veil of Discord",
  branches: "Iron Branch",
  blink: "Blink Dagger",
  chainmail: "Chainmail",
  broadsword: "Broadsword",
  boots: "Boots of Speed",
};
function councilShopLabel(key) {
  const keys = recipeItemsFromAnswerKey(key) ?? [key];
  return [...new Set(keys)]
    .map((item) => {
      assert.ok(councilShopNames[item], `Missing expected name for ${item}`);
      const count = keys.filter((entry) => entry === item).length;
      return councilShopNames[item] + (count > 1 ? ` ×${count}` : "");
    })
    .join(", ");
}
try {
  // Rotate the extra formats between locales. Existing cases cover the full input matrix.
  for (const [kind, locale] of [
    ["classic", "en"],
    ["classic", "ru"],
    ["hero", "en"],
    ["hero", "ru"],
    ["shop", "en"],
    ["shop", "ru"],
    ["recipe", "ru"],
    ["quote", "en"],
    ["aghanim", "ru"],
    ["year", "ru"],
    ["flashchoice", "en"],
    ["flashorder", "en"],
    ["flashorder", "ru"],
    ["order", "en"],
    ["order", "ru"],
  ]) {
    const name = `council candidate6 guidance before controls ${kind} ${locale}`;
    await check(name, { kind, locale, mobile: true, width: 390, height: 844 }, async (page) => {
      const helper = '[data-testid="answer-helper"]';
      const hero = ["hero", "quote", "aghanim"].includes(kind);
      const shop = ["shop", "recipe"].includes(kind);
      const order = kind === "order";
      const boardId = hero
        ? "hero-picker"
        : shop
          ? "shopkeeper-store"
          : order
            ? "value-order-board"
            : kind === "flashorder"
              ? "flashback-order-board"
              : kind === "year"
                ? "flashback-year-board"
                : "answer-grid";
      const board = `[data-testid="${boardId}"]`;
      const target = order ? '[data-testid="value-order-card"]' : board;
      const controls = [
        helper,
        "fieldset",
        board,
        `${board} input`,
        shop ? '[data-testid="shopkeeper-groups"]' : `${board} button`,
      ];
      const answer = journeyFixtures[kind].reveal.reveal;
      // Fill the builder before measuring. Adding components is not a lock transition.
      if (kind === "recipe") {
        for (const key of recipeItemsFromAnswerKey(answer.correctAnswerKey)) {
          await fillInput(page, '[data-testid="shopkeeper-search-field"]', key);
          await tap(page, `[data-testid="shopkeeper-store-item"][data-item-key="${key}"]`);
        }
        await fillInput(page, '[data-testid="shopkeeper-search-field"]', "");
        controls.push('[data-testid="shopkeeper-recipe-builder"]', '[data-testid="shopkeeper-recipe-build"]');
        assert.equal(await votes(page), 0);
      }
      const measure = async (width, locked = false) => {
        await councilViewport(page, width, width === 1280 ? 720 : 844);
        // Compare the same native catalogue position, not a tap's scrollIntoView result.
        if (hero) await page.evaluate(`document.querySelector('[data-testid="hero-picker-board"]').scrollTop=0`);
        // Resizing can still be inside the board's existing 140ms transition.
        if (order)
          await page.evaluate(
            `Promise.allSettled(document.querySelector('${board}').getAnimations({subtree:true}).map(animation=>animation.finished))`,
          );
        const layout = await councilLayout(page, controls);
        const state = await page.evaluate(`(() => {
          const helper=document.querySelector('${helper}'),target=document.querySelector('${target}'),fieldset=document.querySelector('fieldset'),style=getComputedStyle(helper);
          const before=node=>!!(helper.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING);
          return {text:helper.innerText.trim(),ariaHidden:helper.getAttribute('aria-hidden'),visibility:style.visibility,
            beforeTarget:before(target),beforeFieldset:before(fieldset),insideBoard:document.querySelector('${board}').contains(helper),
            borders:[style.borderTopWidth,style.borderRightWidth,style.borderBottomWidth,style.borderLeftWidth],
            background:style.backgroundColor,image:style.backgroundImage};
        })()`);
        assert.ok(layout.scrollWidth <= width + 1, `Guidance must fit at ${width}px`);
        assert.equal(layout.elements[helper].length, 1, "Render only one input caption");
        assert.equal(state.beforeTarget, true, "Guidance must precede the board or Order Up cards in the DOM");
        assert.equal(state.beforeFieldset, !order, "Only Order Up keeps its existing in-board hint");
        assert.equal(state.insideBoard, order);
        const caption = layout.elements[helper][0];
        assert.ok(caption.bottom <= layout.elements[target === board ? board : `${board} button`][0].top + 1);
        if (!order) {
          assert.ok(caption.height > 0 && caption.height < 45, "Use a compact caption, not a tall footer");
          assert.deepEqual(state.borders, ["0px", "0px", "0px", "0px"], "The caption must not have a frame");
          assert.equal(state.background, "rgba(0, 0, 0, 0)");
          assert.equal(state.image, "none");
        }
        if (locked && !order) {
          assert.equal(state.visibility, "hidden");
          assert.equal(state.ariaHidden, "true");
        } else {
          councilFits(layout, helper);
          assert.notEqual(state.ariaHidden, "true");
          councilAssertReadable(await councilReadable(page, helper), 1);
          if (width < 680 && ["classic", "flashchoice"].includes(kind))
            assert.equal(state.text, locale === "ru" ? "Выбери ответ" : "Choose an answer");
          if (hero || kind === "shop") {
            assert.match(state.text, locale === "ru" ? /^Выбери / : /^Choose /);
            assert.match(state.text, /Enter/);
          }
          if (order || kind === "flashorder")
            assert.equal(
              state.text,
              locale === "ru"
                ? "Выбери четыре по порядку. Четвёртый отправит ответ."
                : "Choose four in order. The fourth locks it.",
            );
          if (width >= 680 && ["classic", "flashchoice"].includes(kind)) assert.match(state.text, /A–D.*1–4/);
        }
        councilFits(layout, board);
        return { layout, state };
      };
      const before = {};
      for (const width of [390, 1280]) before[width] = await measure(width);
      if (["classic", "hero", "shop", "recipe", "order", "flashorder"].includes(kind)) await measure(320);
      if (hero) {
        const roundId = await page.evaluate("document.querySelector('main').dataset.roundId");
        await changeRound(page, "window.__journey.laterClue=true");
        await page.waitFor(
          kind === "hero"
            ? `!!document.querySelector('[data-testid="spell-ability-artwork"]')`
            : kind === "quote"
              ? `document.querySelectorAll('[data-testid^="quote-hint-"][data-state="revealed"]').length===2`
              : `document.querySelector('[data-testid="round-prompt"]')?.dataset.aghanimStage==='3'`,
          5000,
        );
        for (const width of [390, 1280]) {
          const unlocked = await measure(width);
          councilStable(before[width].layout, unlocked.layout, controls);
        }
        assert.equal(await page.evaluate("document.querySelector('main').dataset.roundId"), roundId);
        assert.equal(await votes(page), 0, "Unlocking clues must not submit");
      }
      await councilViewport(page, locale === "en" ? 1280 : 390, locale === "en" ? 720 : 844);
      await page.evaluate("document.activeElement?.blur()");
      if (locale === "en" && ["classic", "flashchoice"].includes(kind)) {
        await nativeKey(page, "abcd"[answer.correctIndex]);
      } else if (locale === "en" && (order || kind === "flashorder")) {
        const cards =
          journeyFixtures[kind].answering.valueOrder?.cards ?? journeyFixtures[kind].answering.flashback.cards;
        for (const key of answer.correctAnswerKey.slice("order-v1:".length).split(","))
          await nativeKey(page, String(cards.findIndex((card) => card.key === key) + 1));
      } else if (locale === "en" && (hero || shop)) {
        await click(page, `[data-${hero ? "hero" : "item"}-key="${answer.correctAnswerKey}"]`);
      } else if (kind === "recipe") await tap(page, '[data-testid="shopkeeper-recipe-build"]');
      else await answerByTouch(page, kind);
      await page.waitFor("window.__journey.submissions.length===1", 3000);
      if (!order) await page.waitFor(`document.querySelector('${helper}')?.getAttribute('aria-hidden')==='true'`, 3000);
      assert.equal(
        await page.evaluate(`window.__journey.submissions[0].${answer.correctAnswerKey ? "answerKey" : "answerIndex"}`),
        answer.correctAnswerKey ?? answer.correctIndex,
      );
      for (const width of [390, 1280]) {
        const locked = await measure(width, true);
        await councilEvidence(page, name + " " + width, { before: before[width], locked });
        councilStable(before[width].layout, locked.layout, controls);
      }
      await nativeKey(page, "1");
      assert.equal(await votes(page), 1, "Locked controls must not resubmit");
      await finishRound(page);
      assert.equal(
        await page.evaluate(`document.querySelectorAll('${helper}').length`),
        0,
        "Reveal removes input guidance",
      );
      // Reveal and different next-round prompts may compact or move the board.
    });
  }

  for (const locale of ["en", "ru"]) {
    for (const [width, height] of [
      [390, 844],
      [1280, 560],
    ]) {
      const name = `council candidate6 roster cue in heading ${locale} ${width}`;
      await check(name, { path: "/party", locale, mobile: width < 680, width, height }, async (page) => {
        await councilViewport(page, width, height);
        await page.evaluate(`(() => {
          const fixtureFetch=window.fetch.bind(window);window.__candidate6Players=6;
          window.fetch=async(input,init)=>{
            const response=await fixtureFetch(input,init),url=new URL(typeof input==='string'?input:input.url,location.href);
            if(url.pathname!=='/api/private-rooms'||!response.ok) return response;
            const payload=await response.json();
            payload.privateRoom.players=[...payload.privateRoom.players,...Array.from({length:6},(_,index)=>({
              name:${JSON.stringify(locale === "ru" ? "Игрок " : "Player ")}+String(index+3).padStart(2,'0'),host:false,self:false,away:false,score:0}))].slice(0,window.__candidate6Players);
            payload.presence.activePlayers=payload.privateRoom.players.length;
            return new Response(JSON.stringify(payload),{status:response.status,headers:response.headers});
          };
        })()`);
        await click(page, '[data-testid="private-room-choose-join"]');
        await fillInput(page, '[data-testid="private-room-join-code"]', "JOURNEY");
        await click(page, '[data-testid="private-room-join"]');
        await page.waitFor(`document.querySelectorAll('[data-testid="private-room-players"] li').length===6`, 5000);
        const region = '[data-testid="private-room-players-scroll"]';
        const label = '[data-testid="private-room-players-label"]';
        const cue = '[data-testid="private-room-more-players"]';
        const selectors = [
          region,
          label,
          '[data-testid="private-room-player-count"]',
          '[data-testid="private-room-start"]',
          '[data-testid="private-room-chat-toggle"]',
          '[data-testid="private-room-chat-input"]',
          '[data-testid="private-room-chat-send"]',
        ];
        if (
          await page.evaluate(
            `document.querySelector('[data-testid="private-room-chat-toggle"]').getAttribute('aria-pressed')!=='true'`,
          )
        )
          await click(page, '[data-testid="private-room-chat-toggle"]');
        for (const testWidth of width === 390 ? [390, 320] : [1280]) {
          await councilViewport(page, testWidth, testWidth < 680 ? 844 : height);
          let before;
          for (const count of [6, 8]) {
            await changeRound(page, `window.__candidate6Players=${count}`);
            await page.waitFor(
              `document.querySelectorAll('[data-testid="private-room-players"] li').length===${count}`,
              5000,
            );
            await page.evaluate(`document.querySelector('${region}').scrollTop=0`);
            await page.waitFor(
              `(() => {const list=document.querySelector('${region}');return document.querySelectorAll('${cue}').length===(list.scrollHeight>list.clientHeight+1?1:0);})()`,
              3000,
            );
            const roster = await councilRosterState(page);
            const layout = await councilLayout(page, [...selectors, cue]);
            const heading = await page.evaluate(`(() => {
              const label=document.querySelector('${label}'),cue=document.querySelector('${cue}'),list=document.querySelector('${region}'),listBox=list.getBoundingClientRect();
              const names=[...list.querySelectorAll('strong,[data-testid="private-room-name"]')].filter(node=>{const r=node.getBoundingClientRect();return r.top>=listBox.top&&r.bottom<=listBox.bottom;});
              const style=cue&&getComputedStyle(cue),cueBox=cue?.getBoundingClientRect(),texts=[],overlaps=[],walker=document.createTreeWalker(label,NodeFilter.SHOW_TEXT);
              while(walker.nextNode()) {
                const text=walker.currentNode;if(!text.textContent.trim()||cue?.contains(text)) continue;
                texts.push(text.textContent.trim());const range=document.createRange();range.selectNodeContents(text);
                for(const r of range.getClientRects()) if(cueBox&&Math.min(r.right,cueBox.right)-Math.max(r.left,cueBox.left)>1&&Math.min(r.bottom,cueBox.bottom)-Math.max(r.top,cueBox.top)>1) overlaps.push(text.textContent.trim());
              }
              return {tag:label.tagName,inside:!!cue&&label.contains(cue),count:label.querySelector('[data-testid="private-room-player-count"]').textContent.trim(),
                position:style?.position,whiteSpace:style?.whiteSpace,background:style?.backgroundColor,image:style?.backgroundImage,
                texts,overlaps,names:names.length,occluded:names.filter(node=>{const r=node.getBoundingClientRect();return !node.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}).map(node=>node.textContent||node.value)};
            })()`);
            await councilEvidence(page, name + " " + testWidth + " " + count, { roster, layout, heading });
            assert.equal(heading.tag, "P", "Keep the existing Players heading");
            assert.equal(heading.count, `${count}/100`);
            assert.ok(heading.texts.includes(locale === "ru" ? "Игроки" : "Players"));
            assert.deepEqual(heading.overlaps, [], "The cue box must not cover the Players or player-count text");
            assert.ok(heading.names > 0);
            assert.deepEqual(heading.occluded, [], "The cue must not cover player names");
            assert.equal(roster.cueCount, roster.moreBelow ? 1 : 0);
            assert.equal(roster.moreBelow, testWidth < 680 ? count === 8 : true);
            assert.ok(layout.scrollWidth <= testWidth + 1, "The roster heading must fit horizontally");
            councilAssertReadable(await councilReadable(page, label), 1);
            // The existing 320px Russian code/copy header stacks. Keep its native page scroll.
            for (const selector of selectors) councilFits(layout, selector, { viewport: testWidth === 390 });
            if (testWidth < 680) assert.ok(Math.abs(layout.elements[region][0].height - 300) <= 1);
            else assert.ok(layout.elements[region][0].height <= 220);
            if (!before) before = layout;
            councilStable(before, layout, selectors);
            if (roster.moreBelow) {
              assert.equal(roster.cue, locale === "ru" ? "Ещё игроки ниже" : "More players below");
              assert.equal(heading.inside, true, "The cue belongs inside the player-list heading");
              assert.equal(heading.position, "absolute");
              assert.equal(heading.whiteSpace, "nowrap");
              assert.equal(heading.background, "rgba(0, 0, 0, 0)");
              assert.equal(heading.image, "none");
              councilFits(layout, cue);
              assert.ok(
                layout.elements[cue][0].bottom <= layout.elements[region][0].top,
                "The cue must stay above every roster row",
              );
              assert.ok(
                layout.elements[cue][0].scrollWidth <= layout.elements[cue][0].clientWidth + 1,
                "The cue must not clip at 320px",
              );
              const box = layout.elements[region][0];
              await page.send("Input.dispatchMouseEvent", {
                type: "mouseWheel",
                x: box.left + box.width / 2,
                y: box.top + box.height / 2,
                deltaX: 0,
                deltaY: roster.scrollHeight,
              });
              await page.waitFor(
                `(() => {const list=document.querySelector('${region}');return list.scrollHeight-list.scrollTop<=list.clientHeight+1&&!document.querySelector('${cue}');})()`,
                3000,
              );
              const bottom = await councilRosterState(page);
              const after = await councilLayout(page, selectors);
              assert.ok(bottom.scrollTop > 0, "Native wheel input must scroll the list");
              assert.equal(bottom.lastVisible, true);
              assert.equal(bottom.cueCount, 0, "Remove the cue at the bottom");
              assert.equal(after.scrollY, layout.scrollY, "Roster scrolling must not scroll the page");
              councilStable(layout, after, selectors);
              await councilEvidence(page, name + " " + testWidth + " " + count + " bottom", { bottom, after });
            }
          }
        }
        assert.equal(await votes(page), 0);
      });
    }
  }

  // Rotate locales across outcomes instead of repeating the complete matrix in both languages.
  // Fixture question facts remain English under RU controls; these cases do not test translated facts.
  for (const kind of ["shop", "recipe", "freerecipe"]) {
    for (const context of ["public", "party"]) {
      for (const [index, outcome] of ["correct", "wrong", "missed"].entries()) {
        const locale = (index + Number(context === "party")) % 2 ? "ru" : "en";
        const name = `council candidate5 compact Shopkeeper ${kind} ${context} ${outcome} ${locale}`;
        await check(
          name,
          {
            kind,
            locale,
            mobile: true,
            width: 390,
            height: 844,
            ...(context === "party" ? { path: "/play?room=JOURNEY" } : {}),
          },
          async (page) => {
            await councilViewport(page, 390, 844);
            assert.equal(await page.evaluate("document.documentElement.lang"), locale);
            if (context === "party") {
              await page.evaluate("window.__journey.waiting=false");
              await page.waitFor(
                `!!document.querySelector('[data-testid="private-room-play-dock"]') && document.querySelector('main')?.dataset.phase==='answering'`,
                20000,
              );
            }
            const recipe = kind !== "shop";
            const correct = journeyFixtures[kind].reveal.reveal.correctAnswerKey;
            // A wrong two-Iron-Branch build is a duplicate-component fixture, not a new scoring rule.
            const wrong = recipe ? "recipe-v1:branches+branches" : "branches";
            const selected = outcome === "missed" ? null : outcome === "correct" ? correct : wrong;
            const keys = recipe
              ? [
                  correct,
                  wrong,
                  "recipe-v1:blink+chainmail",
                  "recipe-v1:broadsword+chainmail",
                  "recipe-v1:boots+branches",
                  "recipe-v1:branches+chainmail",
                ]
              : [correct, wrong, "blink", "chainmail", "broadsword", "boots"];
            const counts = [4, 3, 2, 1, 1, 1];
            const zeroKey = recipe ? "recipe-v1:blink+branches" : "sange";
            await page.evaluate(`(() => {
              const fixtureFetch=window.fetch.bind(window),keys=${JSON.stringify(keys)},counts=${JSON.stringify(counts)};
              window.fetch=async(input,init)=>{
                const response=await fixtureFetch(input,init),url=new URL(typeof input==='string'?input:input.url,location.href);
                if(url.pathname!=='/api/rounds'||window.__journey.phase!=='reveal') return response;
                const payload=await response.json();
                payload.crowd={...payload.crowd,total:12,keyCounts:[...keys.map((answerKey,index)=>({answerKey,count:counts[index]})),{answerKey:${JSON.stringify(zeroKey)},count:0}]};
                return new Response(JSON.stringify(payload),{status:response.status,headers:response.headers});
              };
            })()`);
            const store = '[data-testid="shopkeeper-store"]';
            const search = '[data-testid="shopkeeper-search-field"]';
            const catalogue = '[data-testid="shopkeeper-groups"]';
            const item = '[data-testid="shopkeeper-store-item"]';
            const summary = '[data-testid="shopkeeper-open-reveal"]';
            const shares = '[data-testid="shopkeeper-party-picks"]';
            const rows = `${shares} [data-testid="crowd-split-row"]`;
            const result = '[data-testid="round-result-summary"]';
            const timer = '[role="timer"]';
            const split = '[data-testid="crowd-card"]';
            const panel = '[data-testid="reveal-panel"]';
            const controls = [
              store,
              search,
              catalogue,
              item,
              '[data-testid="shopkeeper-tab-basics"]',
              '[data-testid="shopkeeper-tab-upgrades"]',
            ];
            if (recipe)
              controls.push(
                '[data-testid="shopkeeper-recipe-builder"]',
                '[data-testid="shopkeeper-recipe-build"]',
                '[data-testid="shopkeeper-recipe-slot"]',
              );
            await councilViewport(page, 320, 568);
            const narrowAnswering = await councilLayout(page, controls);
            assert.ok(narrowAnswering.scrollWidth <= 321, "Answering must fit at 320px");
            councilFits(narrowAnswering, store);
            if (recipe) councilFits(narrowAnswering, '[data-testid="shopkeeper-recipe-build"]');
            await councilViewport(page, 390, 844);
            const initial = await councilLayout(page, controls);
            if (selected && recipe) {
              for (const key of recipeItemsFromAnswerKey(selected)) {
                await fillInput(page, search, key);
                await tap(page, `${item}[data-item-key="${key}"]`);
              }
              assert.equal(await votes(page), 0, "Adding recipe components must not submit");
            } else if (selected === wrong) {
              await tap(page, '[data-testid="shopkeeper-tab-basics"]');
            }
            await page.evaluate("document.activeElement?.blur();window.scrollTo(0,0)");
            const before = await councilLayout(page, controls);
            const catalogueScroll = await page.evaluate(`document.querySelector('${catalogue}').scrollTop`);
            assert.equal(await page.evaluate(`document.querySelector('${store}').dataset.phase`), "answering");
            assert.equal(await page.evaluate(`document.querySelectorAll('${summary},${shares}').length`), 0);
            if (selected) {
              if (recipe) {
                await page.evaluate(`document.querySelector('[data-testid="shopkeeper-recipe-build"]').focus()`);
                await nativeKey(page, "Enter");
              } else await tap(page, `${item}[data-item-key="${selected}"]`);
              await page.waitFor(`document.querySelector('${store}')?.dataset.locked==='true'`, 3000);
              assert.equal(await votes(page), 1);
              assert.equal(await page.evaluate("window.__journey.submissions[0].answerKey"), selected);
              assert.equal(
                await page.evaluate(
                  `document.querySelectorAll('${store} button:enabled:not([data-testid^="shopkeeper-tab-"]),${store} input:enabled').length`,
                ),
                0,
              );
              await nativeKey(page, "Enter");
              assert.equal(await votes(page), 1, "Locked controls must not resubmit");
            }
            await page.evaluate(
              `document.activeElement?.blur();document.querySelector('${catalogue}').scrollTop=${catalogueScroll};window.scrollTo(0,0)`,
            );
            const locked = await councilLayout(page, controls);
            councilStable(before, locked, controls);
            if (outcome === "missed") {
              // Use a native hover after scrolling settles, not a synthetic focus event.
              await page.evaluate(`document.querySelector('${item}').scrollIntoView({block:'nearest'})`);
              await delay(100);
              const hover = await page.evaluate(
                `(() => {const box=document.querySelector('${item}').getBoundingClientRect();return {x:box.left+box.width/2,y:box.top+box.height/2};})()`,
              );
              await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...hover });
              await page.waitFor(`!!document.querySelector('[data-testid="shopkeeper-item-tooltip"]')`, 3000);
            }
            await finishRound(page);
            await page.evaluate("window.scrollTo(0,0)");
            const selectors = [store, summary, result, timer, panel, split, shares, rows];
            const reveal = await councilLayout(page, selectors);
            const state = await page.evaluate(`(() => {
              const store=document.querySelector('${store}'),summary=store.querySelector('${summary}'),shares=store.querySelector('${shares}');
              const split=document.querySelector('${split}'),stage=document.querySelector('[data-testid="round-prompt"]').parentElement;
              return {phase:store.dataset.phase,summaryInside:!!summary,enabled:store.querySelectorAll('button:enabled,input:enabled').length,
                catalogue:store.querySelectorAll('${search},${catalogue},${item},[data-testid^="shopkeeper-tab-"],[data-testid="shopkeeper-search"],[data-testid="shopkeeper-recipe-builder"]').length,
                tooltips:document.querySelectorAll('[data-testid="shopkeeper-item-tooltip"],[role="tooltip"]').length,
                picks:[...summary.querySelectorAll(':scope > span')].map(node=>({text:node.textContent.trim(),names:[...node.querySelectorAll('strong')].map(name=>name.textContent.trim()),multiplicities:[...node.querySelectorAll('b')].map(count=>count.textContent),included:node.querySelectorAll('[data-testid="shopkeeper-recipe-included"]').length,scrolls:[...node.querySelectorAll('img')].filter(image=>image.getAttribute('src').includes('/recipe.png')).length})),
                rows:[...store.querySelectorAll('${rows}')].map(row=>({label:row.querySelector('strong')?.textContent,title:row.querySelector('strong')?.title,aria:row.getAttribute('aria-label'),role:row.getAttribute('role'),count:row.dataset.count,percentage:row.dataset.percentage,selected:row.dataset.selected,correct:row.dataset.correct,share:row.querySelector('small')?.textContent,controls:row.querySelectorAll('button,input').length})),
                summaryBeforeShares:!shares||!!(summary.compareDocumentPosition(shares)&Node.DOCUMENT_POSITION_FOLLOWING),
                splits:document.querySelectorAll('[data-testid="crowd-split"]').length,
                crowd:[...document.querySelectorAll('[data-testid="round-crowd-summary"],[data-testid="crowd-summary"]')].map(node=>({text:node.textContent,total:node.dataset.total})),
                roomCards:document.querySelectorAll('[data-testid="room-card"]').length,
                splitFollows:!!split&&stage.nextElementSibling===split.parentElement,
                timers:document.querySelectorAll('${timer}').length,timerLabel:document.querySelector('${timer}').getAttribute('aria-label'),
                scored:document.querySelector('${panel} [data-award]')?.dataset.award};
            })()`);
            const readable = await councilReadable(page, `${summary} > span`);
            await councilEvidence(page, name, { before, locked, reveal, state, readable });
            assert.equal(state.phase, "reveal");
            assert.equal(state.summaryInside, true);
            assert.equal(state.catalogue, 0, "Reveal must unmount the toolbar, builder and catalogue");
            assert.equal(state.enabled, 0);
            assert.equal(state.tooltips, 0, "Reveal must clear even a missed pick's tooltip");
            assert.equal(state.scored, outcome === "correct" ? "scored" : "none");
            assert.equal(state.picks.length, 2, "Keep separate submitted and correct summaries");
            for (const [pickIndex, key] of [selected, correct].entries()) {
              const pick = state.picks[pickIndex];
              const components = key ? (recipeItemsFromAnswerKey(key) ?? [key]) : [];
              assert.deepEqual(
                pick.names,
                key
                  ? [...new Set(components)].map((key) => councilShopNames[key])
                  : [locale === "ru" ? (recipe ? "Нет сборки" : "Не выбрано") : recipe ? "No build" : "No pick"],
              );
              assert.deepEqual(
                pick.multiplicities,
                [...new Set(components)].flatMap((key) => {
                  const count = components.filter((entry) => entry === key).length;
                  return count > 1 ? [`×${count}`] : [];
                }),
              );
              assert.equal(pick.included, recipe && kind === "recipe" && pickIndex === 1 ? 1 : 0);
              assert.equal(pick.scrolls, pick.included, "Keep the included recipe scroll only where applicable");
            }
            councilAssertReadable(readable, 2);
            for (const selector of [store, summary, result, timer]) councilFits(reveal, selector);
            for (const selector of [summary, result, timer]) councilFits(reveal, selector, { viewport: true });
            assert.equal(state.timers, 1, "Keep the existing next-round timer");
            assert.match(state.timerLabel, locale === "ru" ? /До следующего раунда/ : /until the next round/);
            assert.equal(state.summaryBeforeShares, true);
            if (context === "public") {
              assert.equal(reveal.elements[shares].length, 0);
              assert.equal(state.splits, 1, "Public reveal has only its one Room split");
              assert.deepEqual(state.crowd, [], "Public counts belong only in Room split");
              assert.equal(state.roomCards, 0);
              assert.equal(state.splitFollows, true, "Room split must follow the reveal stage");
              councilFits(reveal, split);
              assert.ok(reveal.elements[split][0].top >= reveal.elements[panel][0].bottom - 1);
              assert.ok(
                reveal.elements[split][0].top + 40 <= 844,
                "Room split heading must start in the phone viewport",
              );
              assert.doesNotMatch(reveal.elements[store][0].text, /\d+%/);
            } else {
              councilFits(reveal, shares);
              assert.equal(state.splits, 0, "Party share rows must not add another Room split");
              assert.equal(state.crowd.length, 1, "Keep the existing party crowd summary");
              assert.equal(state.crowd[0].total, "12");
              assert.ok(state.crowd[0].text.trim().length > 0);
              assert.equal(state.rows.length, keys.length, "Show every positive voted choice, not only the top four");
              assert.deepEqual(state.rows.map((row) => row.label).sort(), keys.map(councilShopLabel).sort());
              for (const [rowIndex, key] of keys.entries()) {
                const label = councilShopLabel(key),
                  row = state.rows.find((row) => row.label === label);
                assert.equal(row.title, label, "Recipe labels must keep the full composition");
                assert.ok(row.aria.includes(label));
                assert.equal(row.role, "group");
                assert.equal(row.count, String(counts[rowIndex]));
                assert.equal(row.percentage, String(Math.round((counts[rowIndex] / 12) * 100)));
                assert.equal(row.share, `${row.percentage}%`);
                assert.equal(row.selected, String(key === selected));
                assert.equal(row.correct, String(key === correct));
                assert.equal(row.controls, 0, "Party shares are static, not item controls");
              }
            }
            await councilViewport(page, 320, 568);
            const narrow = await councilLayout(page, selectors);
            assert.ok(narrow.scrollWidth <= 321, "Shopkeeper reveal must fit at 320px");
            for (const selector of [store, summary, result, timer]) councilFits(narrow, selector);
            if (context === "party") {
              councilFits(narrow, rows, { count: keys.length });
            }
            councilAssertReadable(await councilReadable(page, `${summary} > span`), 2);
            await councilEvidence(page, name + " 320", { narrow });
            assert.equal(await votes(page), selected ? 1 : 0);
            // The catalogue must mount again with unchanged answering geometry in the following round.
            await councilViewport(page, 390, 844);
            await changeRound(page, "window.__journey.number+=1;window.__journey.phase='answering'");
            await page.waitFor(
              `document.querySelector('main')?.dataset.phase==='answering' && !!document.querySelector('${search}')`,
              5000,
            );
            assert.equal(await page.evaluate(`document.querySelector('${search}').value`), "");
            assert.equal(await page.evaluate(`document.querySelectorAll('${summary},${shares}').length`), 0);
            assert.ok(await page.evaluate(`document.querySelectorAll('${item}:enabled').length>0`));
            await page.evaluate("window.scrollTo(0,0)");
            const nextLayout = await councilLayout(page, controls);
            // A new prompt may have a different height. The catalogue itself must keep its dimensions.
            for (const selector of controls) {
              assert.equal(nextLayout.elements[selector].length, initial.elements[selector].length);
              for (const [index, box] of nextLayout.elements[selector].entries()) {
                for (const dimension of ["width", "height"])
                  assert.ok(
                    Math.abs(box[dimension] - initial.elements[selector][index][dimension]) <= 1,
                    `Next-round ${selector} ${dimension} changed`,
                  );
              }
            }
          },
        );
      }
    }
  }

  for (const locale of ["en", "ru"]) {
    for (const kind of ["hero", "shop"]) {
      const name = `council candidate5 bilingual native search ${locale} ${kind}`;
      await check(name, { kind, locale, mobile: true, width: 390, height: 844 }, async (page) => {
        await councilViewport(page, 390, 844);
        const hero = kind === "hero";
        const search = hero ? '[data-testid="hero-search-input"]' : '[data-testid="shopkeeper-search-field"]';
        const match = hero
          ? '[data-testid="hero-picker-hero"][data-search-match="true"]'
          : '[data-testid="shopkeeper-store-item"]';
        const key = hero ? "npc_dota_hero_abaddon" : "blink";
        const field = await page.evaluate(
          `(() => {const node=document.querySelector('${search}');return {placeholder:node.placeholder,label:node.getAttribute('aria-label'),title:node.title};})()`,
        );
        assert.equal(
          field.placeholder,
          locale === "ru" ? (hero ? "Поиск героев" : "Поиск предметов") : hero ? "Search heroes" : "Search Items",
        );
        if (locale === "ru") {
          assert.match(`${field.label} ${field.title}`, /русск/i);
          assert.match(`${field.label} ${field.title}`, /английск/i);
        }
        for (const [index, query] of (hero ? ["Abaddon", "Абаддон"] : ["Blink Dagger", "блинк даггер"]).entries()) {
          await fillInput(page, search, query);
          await page.waitFor(`document.querySelectorAll('${match}').length===1`, 3000);
          assert.equal(
            await page.evaluate(`document.querySelector('${match}').dataset.${hero ? "heroKey" : "itemKey"}`),
            key,
          );
          assert.equal(await votes(page), index);
          await page.evaluate(`document.querySelector('${search}').focus()`);
          await nativeKey(page, "Enter");
          await page.waitFor(`window.__journey.submissions.length===${index + 1}`, 3000);
          assert.equal(await page.evaluate(`window.__journey.submissions[${index}].answerKey`), key);
          if (index === 0) {
            await changeRound(page, "window.__journey.number+=1");
            await page.waitFor(
              `document.querySelector('main')?.dataset.roundId.endsWith(':round:2') && !document.querySelector('${search}').disabled`,
              5000,
            );
          }
        }
        await councilEvidence(page, name, { field });
      });
    }
    const name = `council candidate5 waiting search field chip ${locale}`;
    await check(name, { path: "/", locale, mobile: true, width: 390, height: 844 }, async (page) => {
      await councilViewport(page, 390, 844);
      await councilEntryWait(page);
      const tip = '[data-testid="entry-wait-tip"]';
      const count = await page.evaluate(
        "Number(document.querySelector('[data-testid=entry-wait-tips]').dataset.tipCount)",
      );
      for (let step = 0; step < count; step += 1) {
        if (await page.evaluate(`document.querySelector('${tip}').dataset.tip==='shop'`)) break;
        await nativeKey(page, "ArrowRight");
      }
      await page.waitFor(
        `!!document.querySelector('[data-panel="shop"][data-active="true"] [data-testid="shopkeeper-search-field"]')`,
        3000,
      );
      const chip = `${tip} p em`;
      const expected = locale === "ru" ? "Поиск предметов" : "Search Items";
      const readable = await councilReadable(page, chip);
      const layout = await councilLayout(page, [
        chip,
        '[data-panel="shop"][data-active="true"] [data-testid="shopkeeper-search-field"]',
      ]);
      const lines = await page.evaluate(
        `(() => {const range=document.createRange();range.selectNodeContents(document.querySelector('${chip}'));return [...range.getClientRects()].filter(rect=>rect.width>0&&rect.height>0).length;})()`,
      );
      await councilEvidence(page, name, { readable, layout, lines });
      councilAssertReadable(readable, 1);
      councilFits(layout, chip);
      assert.equal(readable[0].text, expected);
      assert.equal(lines, 1, "The field-name chip must not wrap at 390px");
      assert.equal(
        await page.evaluate(`document.querySelector('[data-panel="shop"][data-active="true"] input').placeholder`),
        expected,
      );
      assert.equal(await votes(page), 0);
    });
  }

  for (const locale of ["en", "ru"]) {
    for (const [width, height] of [
      [390, 844],
      [1280, 720],
    ]) {
      const name = `council candidate4 EntryWait unknown clock and recovery ${locale} ${width}`;
      await check(name, { path: "/", locale, mobile: width < 680, width, height }, async (page) => {
        await councilViewport(page, width, height);
        await councilEntryWait(page);
        // EntryWait's shared reveal holder replaces responses; inject 503s outside that holder.
        await page.evaluate(`(() => {
          const fixtureFetch=window.fetch.bind(window);
          window.fetch=(input,init)=>{
            const url=new URL(typeof input==='string'?input:input.url,location.href);
            if(url.pathname==='/api/rounds'&&window.__journey.roundFailures>0) {
              window.__journey.roundFailures-=1;
              return Promise.resolve(new Response(JSON.stringify({error:'Temporary failure'}),{status:503,headers:{'Content-Type':'application/json'}}));
            }
            return fixtureFetch(input,init);
          };
        })()`);
        const timer = '[data-testid="entry-wait-timer"]';
        const hint = '[data-testid="entry-wait-hint"]';
        const status = '[data-testid="round-entry-wait"] [role="status"]';
        const lessons = '[data-testid="entry-wait-tips"]';
        const selectors = [timer, hint, status, lessons];
        const before = await councilLayout(page, selectors);
        assert.match(before.elements[timer][0].text, /^00:\d{2}$/);
        assert.equal(before.elements[hint][0].text, locale === "ru" ? "До следующего раунда" : "Until the next round");
        await page.waitFor(
          `document.querySelector('${timer}').textContent.trim()!==${JSON.stringify(before.elements[timer][0].text)}`,
          2500,
        );
        // Exercise HTTP failures on phones and rejected fetches on desktop.
        await changeRound(
          page,
          width < 680 ? "window.__journey.roundFailures=100" : "window.__journey.blockRounds=true",
        );
        await page.waitFor(`document.querySelector('${status}')?.textContent.trim().length>0`, 10000);
        const offline = await councilLayout(page, selectors);
        await councilEvidence(page, name + " offline", { before, offline });
        assert.equal(offline.elements[timer][0].text, "--:--");
        assert.equal(
          offline.elements[hint][0].text,
          locale === "ru" ? "Ждём восстановления связи" : "Waiting to reconnect",
        );
        assert.equal(await page.evaluate(`document.querySelector('${timer}').getAttribute('aria-hidden')`), "true");
        for (const selector of [timer, hint]) councilFits(offline, selector, { viewport: true });
        const count = await page.evaluate(`Number(document.querySelector('${lessons}').dataset.tipCount)`);
        assert.ok(count > 0 && count <= 10);
        for (let step = 0; step < count; step += 1) {
          if (await page.evaluate(`document.querySelector('[data-testid="entry-wait-tip"]').dataset.tip==='keys'`))
            break;
          await nativeKey(page, "ArrowRight");
        }
        await page.waitFor(`!!document.querySelector('[data-panel="keys"][data-active="true"]')`, 3000);
        await tap(page, '[data-panel="keys"][data-active="true"] [data-testid="practice-answer"]', 3);
        const practice = await councilPracticeState(page);
        assert.equal(practice.cards[3].pressed, "true");
        assert.deepEqual(practice.violations, []);
        assert.equal(await votes(page), 0);
        await changeRound(
          page,
          "window.__journey.roundFailures=0;window.__journey.blockRounds=false;window.__entryWaitFixture.snapshot.round.revealDeadline=Date.now()+12000",
        );
        await page.waitFor(
          `document.querySelector('${status}')?.textContent.trim()==='' && /^00:0?\\d{1,2}$/.test(document.querySelector('${timer}')?.textContent.trim())`,
          10000,
        );
        await page.evaluate("window.scrollTo(0,0)");
        const recovered = await councilLayout(page, selectors);
        await councilEvidence(page, name + " recovered", { before, offline, practice, recovered });
        const seconds = Number(recovered.elements[timer][0].text.slice(3));
        assert.ok(seconds > 0 && seconds <= 12, "A fresh server response must restore server timing");
        assert.equal(recovered.elements[hint][0].text, before.elements[hint][0].text);
        assert.notEqual(await page.evaluate(`document.querySelector('${timer}').getAttribute('aria-hidden')`), "true");
        await changeRound(page, "window.__entryWaitFixture.hold=false");
        await page.waitFor(`document.querySelector('main')?.dataset.phase==='answering'`, 5000);
        assert.equal(await page.evaluate(`!!document.querySelector('[data-testid="round-entry-wait"]')`), false);
        assert.equal(await votes(page), 0);
      });

      for (const kind of ["classic", "hero", "shop"]) {
        const helperName = `council candidate4 one live answer status ${locale} ${width} ${kind}`;
        await check(helperName, { kind, locale, mobile: width < 680, width, height }, async (page) => {
          await councilViewport(page, width, height);
          const helper = '[data-testid="answer-helper"]';
          const feedback = '[data-testid="round-feedback"]';
          const controls =
            kind === "classic"
              ? ['[data-testid="answer-grid"]', '[data-testid="arcade-answer"]']
              : kind === "hero"
                ? [
                    '[data-testid="hero-picker"]',
                    '[data-testid="hero-search-input"]',
                    '[data-testid="hero-picker-status"]',
                    '[data-testid="hero-picker-board"]',
                  ]
                : [
                    '[data-testid="shopkeeper-store"]',
                    '[data-testid="shopkeeper-search-field"]',
                    '[data-testid="shopkeeper-groups"]',
                    '[data-testid="shopkeeper-store-item"]',
                  ];
          const selectors = [helper, feedback, "fieldset", ...controls];
          const state = () =>
            page.evaluate(`(() => {
            const helper=document.querySelector('${helper}');
            const visible=node=>{const style=getComputedStyle(node),box=node.getBoundingClientRect();return style.visibility!=='hidden'&&style.display!=='none'&&box.width>0&&box.height>0;};
            return {text:helper.textContent.trim(),visibleText:helper.innerText.trim(),ariaHidden:helper.getAttribute('aria-hidden'),visibility:getComputedStyle(helper).visibility,
              gold:[...document.querySelectorAll('span')].filter(node=>node.children.length===0&&visible(node)&&/^(Answer worth \\d+ gold now|Ответ сейчас стоит \\d+ золота)$/.test(node.textContent.trim())).length,
              locks:[...document.querySelectorAll('span')].filter(node=>node.children.length===0&&visible(node)&&node.textContent.trim()===${JSON.stringify(locale === "ru" ? "Ответ принят" : "Answer locked")}).length};
          })()`);
          const before = await councilLayout(page, selectors);
          const initial = await state();
          assert.equal(initial.gold, 1, "Live gold worth belongs only in the round header");
          assert.match(
            before.elements[feedback][0].text,
            locale === "ru" ? /^Ответ сейчас стоит \d+ золота$/ : /^Answer worth \d+ gold now$/,
          );
          assert.doesNotMatch(initial.text, /gold|золот/i);
          if (kind === "classic") {
            if (width < 680) assert.equal(initial.visibleText, locale === "ru" ? "Выбери ответ" : "Choose an answer");
            else assert.match(initial.visibleText, /A–D.*1–4/);
          }
          if (kind === "classic" && width >= 680) {
            await page.evaluate("document.activeElement?.blur()");
            await nativeKey(page, String(journeyFixtures.classic.reveal.reveal.correctIndex + 1));
            await page.waitFor("window.__journey.submissions.length===1", 3000);
          } else await answerByTouch(page, kind);
          await page.waitFor(`document.querySelector('${helper}').getAttribute('aria-hidden')==='true'`, 3000);
          await page.evaluate("window.scrollTo(0,0)");
          const locked = await councilLayout(page, selectors);
          const selected = await state();
          const selection = await page.evaluate(`(() => {
            const hero=document.querySelector('[data-testid="hero-picker-status"]'),item=document.querySelector('[data-testid="shopkeeper-store-item"][aria-pressed="true"]');
            return {hero:hero?.textContent.trim(),itemLabel:item?.getAttribute('aria-label'),itemState:item?.dataset.state,
              choice:[...document.querySelectorAll('[data-testid="arcade-answer"][aria-pressed="true"]')].map(node=>node.getAttribute('aria-pressed')),
              enabled:document.querySelectorAll('fieldset button:enabled,fieldset input:enabled').length};
          })()`);
          await councilEvidence(page, helperName, { before, locked, initial, selected, selection });
          assert.equal(selected.visibility, "hidden");
          assert.equal(selected.ariaHidden, "true");
          assert.equal(selected.locks, 1, "Only the header should repeat the generic lock status");
          assert.equal(locked.elements[feedback][0].text, locale === "ru" ? "Ответ принят" : "Answer locked");
          assert.equal(selected.gold, 0);
          assert.doesNotMatch(selected.text, /gold|золот/i);
          assert.ok(locked.elements[helper][0].height > 0, "Hidden helper must reserve its layout slot");
          councilStable(before, locked, selectors);
          if (kind === "classic") assert.deepEqual(selection.choice, ["true"]);
          if (kind === "hero") {
            assert.match(selection.hero, locale === "ru" ? /^Ответ принят: .+/ : /^Locked: .+/);
            assert.ok(selection.hero.includes("Abaddon"));
          }
          if (kind === "shop") {
            assert.match(selection.itemLabel, /Assault Cuirass/);
            assert.equal(selection.itemState, "selected");
          }
          await nativeKey(page, "1");
          assert.equal(await votes(page), 1, "Locked controls must not submit a second answer");
        });
      }
    }

    for (const [kind, multiplier] of [
      ["classic", 1],
      ["classic", 2],
      ["hero", 1],
      ["hero", 2],
    ]) {
      const name = `council candidate4 included speed contribution ${locale} ${kind} x${multiplier}`;
      await check(name, { kind, locale, mobile: true, width: 390, height: 844 }, async (page) => {
        await councilViewport(page, 390, 844);
        const remaining = kind === "hero" ? 5000 : 7500;
        const breakdown = scoreBreakdown(journeyFixtures[kind].answering, remaining, 15000);
        const points = breakdown.rawPoints * multiplier;
        // Freeze the fixture clock, not the scoring function. Accepted submittedAt then gives exact time left.
        await page.evaluate(`(() => {
          const now=Date.now(),fixtureFetch=window.fetch.bind(window);Date.now=()=>now;
          window.__candidate4Score={snapshots:[],now};
          window.fetch=async(input,init)=>{
            const response=await fixtureFetch(input,init),url=new URL(typeof input==='string'?input:input.url,location.href);
            if(url.pathname!=='/api/rounds') return response;
            const payload=await response.json();
            payload.round={...payload.round,startedAt:now-(15000-${remaining}),answerDeadline:now+${remaining},revealDeadline:now+22000};
            if(payload.round.phase==='reveal') {
              payload.crowd.total=4;payload.crowd.counts=[0,0,0,0];payload.crowd.counts[${journeyFixtures[kind].reveal.reveal.correctIndex}]=${multiplier === 2 ? 1 : 3};
              payload.crowd.scoreSummary={correctCount:${multiplier === 2 ? 1 : 3},average:${points},best:${points},playerPoints:${points}};
            }
            window.__candidate4Score.snapshots.push({round:payload.round,playerVote:payload.playerVote,scoreSummary:payload.crowd.scoreSummary});
            return new Response(JSON.stringify(payload),{status:response.status,headers:response.headers});
          };
        })()`);
        await changeRound(page, "window.__journey.number+=1;window.__journey.laterClue=true");
        await page.waitFor(`document.querySelector('main')?.dataset.roundId.endsWith(':round:2')`, 5000);
        await answerByTouch(page, kind);
        await finishRound(page);
        const award = await page.evaluate(`(() => {
          const node=document.querySelector('[data-testid="reveal-panel"] [data-award]');
          return {speed:node.querySelector('small')?.textContent,points:node.querySelector('strong').textContent,
            balance:document.querySelector('[data-testid="score-grid"] strong').textContent,
            bonus:!!document.querySelector('[data-testid="round-crowd-bonus"]'),fixture:window.__candidate4Score};
        })()`);
        await councilEvidence(page, name, { breakdown, multiplier, points, award });
        const speed = breakdown.speedBonus * multiplier;
        const penalty = breakdown.cluePenalty * multiplier;
        assert.equal(
          award.speed,
          (locale === "ru" ? `В том числе +${speed} за скорость` : `Includes +${speed} speed`) +
            (penalty ? (locale === "ru" ? ` · −${penalty} за подсказки` : ` · −${penalty} clues`) : ""),
        );
        assert.equal(award.points, `+${points}`);
        assert.equal(award.balance, String(points));
        assert.equal(award.bonus, multiplier === 2);
        const final = award.fixture.snapshots.at(-1);
        assert.equal(final.round.answerDeadline - final.playerVote.submittedAt, remaining);
        assert.equal(final.scoreSummary.playerPoints, points);
        assert.equal(await votes(page), 1);
      });
    }
    for (const outcome of ["wrong", "missed"]) {
      const name = `council candidate4 no blank speed line ${locale} ${outcome}`;
      await check(name, { kind: "classic", locale, mobile: true, width: 390, height: 844 }, async (page) => {
        await councilViewport(page, 390, 844);
        if (outcome === "wrong") {
          await tap(
            page,
            '[data-testid="arcade-answer"]',
            (journeyFixtures.classic.reveal.reveal.correctIndex + 1) % 4,
          );
          await page.waitFor("window.__journey.submissions.length===1", 3000);
        }
        await finishRound(page);
        const award = await page.evaluate(
          `(() => {const node=document.querySelector('[data-testid="reveal-panel"] [data-award]');return {lines:node.querySelectorAll('small').length,points:node.querySelector('strong').textContent};})()`,
        );
        await councilEvidence(page, name, award);
        assert.deepEqual(award, { lines: 0, points: "+0" });
        assert.equal(await votes(page), outcome === "wrong" ? 1 : 0);
      });
    }

    for (const context of ["public", "party"]) {
      const name = `council candidate4 shorter Classic reveal choices ${locale} ${context}`;
      await check(
        name,
        {
          kind: "classic",
          locale,
          mobile: true,
          width: 390,
          height: 844,
          ...(context === "party" ? { path: "/play?room=JOURNEY" } : {}),
        },
        async (page) => {
          await councilViewport(page, 390, 844);
          if (context === "party") {
            await page.evaluate("window.__journey.waiting=false");
            await page.waitFor(
              `!!document.querySelector('[data-testid="private-room-play-dock"]') && document.querySelector('main')?.dataset.phase==='answering'`,
              20000,
            );
          }
          const answer = '[data-testid="arcade-answer"]';
          const correct = journeyFixtures.classic.reveal.reveal.correctIndex;
          const selected = (correct + 1) % 4;
          await tap(page, answer, selected);
          await page.waitFor("window.__journey.submissions.length===1", 3000);
          await page.evaluate("window.scrollTo(0,0)");
          const locked = await councilLayout(page, [answer]);
          await finishRound(page);
          await page.evaluate("window.scrollTo(0,0)");
          const icons = `${answer} svg.lucide-check,${answer} svg.lucide-x`;
          const reveal = await councilLayout(page, [answer, icons]);
          const readable = await councilReadable(page, answer);
          const choices = await page.evaluate(
            `Array.from(document.querySelectorAll('${answer}'),node=>({selected:node.dataset.selected,correct:node.dataset.correct,pressed:node.getAttribute('aria-pressed'),marker:node.querySelector('small')?.textContent,share:node.querySelector('strong')?.textContent,disabled:node.disabled}))`,
          );
          await councilEvidence(page, name, { locked, reveal, readable, choices });
          councilAssertReadable(readable, 4);
          councilFits(reveal, answer, { count: 4, viewport: true });
          councilFits(reveal, icons, { count: 2, viewport: true });
          for (const [index, choice] of choices.entries()) {
            assert.ok(
              readable[index].texts.some((entry) => entry.text === journeyFixtures.classic.reveal.answers[index]),
            );
            if (context === "public") {
              assert.ok(
                reveal.elements[answer][index].height < locked.elements[answer][index].height,
                "Public reveal choices must be shorter than answering choices",
              );
            }
            assert.equal(choice.selected, String(index === selected));
            assert.equal(choice.correct, String(index === correct));
            assert.equal(choice.pressed, String(index === selected));
            assert.equal(choice.disabled, true);
            if (context === "party") assert.equal(choice.share, index === selected ? "100%" : "0%");
          }
          assert.equal(choices[selected].marker, locale === "ru" ? "Твой ответ" : "Your answer");
        },
      );
    }

    for (const [width, height] of [
      [390, 844],
      [1280, 560],
    ]) {
      const name = `council candidate4 party margins and roster capacity ${locale} ${width}`;
      await check(name, { path: "/party", locale, mobile: width < 680, width, height }, async (page) => {
        await councilViewport(page, width, height);
        const margins = [];
        const measureMargin = async (selector, step) => {
          const layout = await councilLayout(page, [selector]);
          margins.push({ step, layout });
          if (width < 680) {
            const box = layout.elements[selector][0];
            assert.ok(
              Math.abs(box.left - 16) <= 1 && Math.abs(width - box.right - 16) <= 1,
              `${step} must use 16px page margins`,
            );
          }
        };
        await measureMargin('[data-testid="private-room-setup"]', "choose");
        await click(page, '[data-testid="private-room-choose-create"]');
        await measureMargin('[data-testid="private-room-setup"]', "create");
        if (width < 680) {
          const tray = await page.evaluate(
            `(() => {const r=document.querySelector('[data-testid="private-room-create"]').parentElement.getBoundingClientRect();return {left:r.left,right:r.right};})()`,
          );
          assert.ok(Math.abs(tray.left - 16) <= 1 && Math.abs(width - tray.right - 16) <= 1);
        }
        await click(page, '[data-testid="private-room-leave"]');
        await click(page, '[data-testid="private-room-choose-join"]');
        await measureMargin('[data-testid="private-room-setup"]', "join");
        await page.evaluate(`(() => {
          const fixtureFetch=window.fetch.bind(window);window.__candidate4Players=2;
          window.fetch=async(input,init)=>{
            const response=await fixtureFetch(input,init),url=new URL(typeof input==='string'?input:input.url,location.href);
            if(url.pathname!=='/api/private-rooms'||!response.ok) return response;
            const payload=await response.json();
            payload.privateRoom.players=[...payload.privateRoom.players,...Array.from({length:6},(_,index)=>({name:'Player '+(index+3),host:false,self:false,away:false,score:0}))].slice(0,window.__candidate4Players);
            payload.presence.activePlayers=payload.privateRoom.players.length;
            return new Response(JSON.stringify(payload),{status:response.status,headers:response.headers});
          };
        })()`);
        await fillInput(page, '[data-testid="private-room-join-code"]', "JOURNEY");
        await click(page, '[data-testid="private-room-join"]');
        await page.waitFor(`document.querySelectorAll('[data-testid="private-room-players"] li').length===2`, 5000);
        await page.evaluate("document.activeElement?.blur();window.scrollTo(0,0)");
        await measureMargin('[data-testid="private-room-wait"]', "lobby");
        const region = '[data-testid="private-room-players-scroll"]';
        const controls = [
          '[data-testid="private-room-start"]',
          '[data-testid="private-room-chat-toggle"]',
          '[data-testid="private-room-chat-input"]',
          '[data-testid="private-room-chat-send"]',
        ];
        const before = await councilLayout(page, [region, ...controls]);
        const states = [];
        for (const count of [2, 6, 8]) {
          await changeRound(page, `window.__candidate4Players=${count}`);
          await page.waitFor(
            `document.querySelectorAll('[data-testid="private-room-players"] li').length===${count}`,
            5000,
          );
          await page.waitFor(
            `(() => {const list=document.querySelector('${region}');return document.querySelectorAll('[data-testid="private-room-more-players"]').length===(list.scrollHeight-list.scrollTop>list.clientHeight+1?1:0);})()`,
            3000,
          );
          const roster = await councilRosterState(page);
          const layout = await councilLayout(page, [region, ...controls]);
          states.push({ count, roster, layout });
          await councilEvidence(page, name + " " + count, { margins, before, states });
          councilStable(before, layout, [region, ...controls]);
          for (const selector of controls) councilFits(layout, selector, { viewport: width < 680 });
          assert.equal(roster.cueCount, roster.moreBelow ? 1 : 0);
          if (width < 680) {
            assert.ok(
              Math.abs(layout.elements[region][0].height - 300) <= 1,
              "844px phone must use the available 300px roster height",
            );
            assert.equal(roster.moreBelow, count === 8);
            assert.equal(roster.lastVisible, count !== 8);
          } else assert.ok(layout.elements[region][0].height <= 220, "Short desktop roster must remain bounded");
          if (roster.moreBelow) assert.equal(roster.cue, locale === "ru" ? "Ещё игроки ниже" : "More players below");
        }
        assert.equal(await votes(page), 0);
      });
    }
  }
  for (const [width, height] of [
    [390, 844],
    [1280, 720],
  ]) {
    const name = `council candidate4 Russian Room split labels wrap ${width}`;
    await check(name, { kind: "classic", locale: "ru", mobile: width < 680, width, height }, async (page) => {
      await councilViewport(page, width, height);
      await answerByTouch(page, "classic");
      await finishRound(page);
      const summary = '[data-testid="crowd-score-summary"]';
      const readable = await councilReadable(page, `${summary} small`);
      const layout = await councilLayout(page, [`${summary} strong`]);
      const labels = await page.evaluate(
        `Array.from(document.querySelectorAll('${summary} small'),node=>({text:node.textContent.trim(),whiteSpace:getComputedStyle(node).whiteSpace,textOverflow:getComputedStyle(node).textOverflow,lineHeight:parseFloat(getComputedStyle(node).lineHeight)}))`,
      );
      await councilEvidence(page, name, { readable, layout, labels });
      councilAssertReadable(readable, 3);
      assert.deepEqual(
        labels.map((entry) => entry.text),
        ["Ты", "Среднее верных", "Лучший"],
      );
      for (const label of labels) {
        assert.notEqual(label.whiteSpace, "nowrap");
        assert.notEqual(label.textOverflow, "ellipsis");
      }
      if (width === 1280)
        assert.ok(
          readable[1].box.height > labels[1].lineHeight * 1.5,
          "Narrow desktop score column must wrap its Russian label",
        );
      const values = layout.elements[`${summary} strong`];
      assert.deepEqual(
        values.map((entry) => entry.text),
        ["+200", "+200", "+200"],
      );
      assert.ok(
        Math.max(...values.map((entry) => entry.top)) - Math.min(...values.map((entry) => entry.top)) <= 1,
        "Score values must share one baseline",
      );
    });
  }
  for (const locale of ["en", "ru"]) {
    for (const width of [320, 390]) {
      const height = width === 320 ? 568 : 844;
      for (const context of ["public", "party"]) {
        for (const outcome of context === "public" ? ["correct", "wrong", "missed"] : ["wrong"]) {
          const name = `council candidate3 Classic compact reveal ${locale} ${width} ${context} ${outcome}`;
          await check(
            name,
            {
              kind: "classic",
              locale,
              mobile: true,
              width,
              height,
              ...(context === "party" ? { path: "/play?room=JOURNEY" } : {}),
            },
            async (page) => {
              await councilViewport(page, width, height);
              assert.equal(await page.evaluate("document.documentElement.lang"), locale);
              await page.evaluate(`(() => {
                  if(${JSON.stringify(context)}==='party') window.__journey.waiting=false;
                  const fixtureFetch=window.fetch.bind(window);
                  window.fetch=async(input,init)=>{
                    const response=await fixtureFetch(input,init),url=new URL(typeof input==='string'?input:input.url,location.href);
                    if(url.pathname!=='/api/rounds'||window.__journey.phase!=='reveal') return response;
                    const payload=await response.json(),counts=[0,0,0,0];
                    counts[${journeyFixtures.classic.reveal.reveal.correctIndex}]=120;
                    payload.crowd={...payload.crowd,counts,total:120};
                    return new Response(JSON.stringify(payload),{status:response.status,headers:response.headers});
                  };
                })()`);
              if (context === "party") {
                await page.waitFor(
                  `!!document.querySelector('[data-testid="private-room-play-dock"]') && document.querySelector('main')?.dataset.phase==='answering'`,
                  20000,
                );
              }
              await page.evaluate("window.scrollTo(0,0)");
              const prompt = '[data-testid="round-prompt"]';
              const art = '[data-testid="question-artwork"]';
              const grid = '[data-testid="answer-grid"]';
              const answer = '[data-testid="arcade-answer"]';
              const timer = '[role="timer"]';
              const result = '[data-testid="round-result-summary"]';
              const split = '[data-testid="crowd-card"]';
              const panel = '[data-testid="reveal-panel"]';
              const controls = [prompt, art, grid, answer, timer, "fieldset"];
              const selectors = [...controls, result, split, panel];
              const before = await councilLayout(page, selectors);
              const correct = journeyFixtures.classic.reveal.reveal.correctIndex;
              const selected = outcome === "correct" ? correct : (correct + 1) % 4;
              if (outcome !== "missed") {
                await tap(page, answer, selected);
                await page.waitFor("window.__journey.submissions.length===1", 3000);
                await page.waitFor(`document.querySelectorAll('${answer}:disabled').length===4`, 3000);
              }
              await page.evaluate("window.scrollTo(0,0)");
              const locked = await councilLayout(page, selectors);
              const lockedReadable = await councilReadable(page, answer);
              await finishRound(page);
              await page.evaluate("window.scrollTo(0,0)");
              const reveal = await councilLayout(page, selectors);
              const readable = await councilReadable(page, answer);
              const lesson = await councilReadable(page, `${result},[data-testid="reveal-explanation"]`);
              const structure = await page.evaluate(`(() => {
                const stage=document.querySelector('${prompt}').parentElement,split=document.querySelector('${split}');
                const visibleCount=selector=>[...document.querySelectorAll(selector)].filter(node=>node.getBoundingClientRect().width>0&&node.getBoundingClientRect().height>0).length;
                return {timers:document.querySelectorAll('[role="timer"]').length,timerLabel:document.querySelector('${timer}').getAttribute('aria-label'),
                  answers:[...document.querySelectorAll('${answer}')].map(button=>({pressed:button.getAttribute('aria-pressed'),correct:button.dataset.correct,
                    selected:button.dataset.selected,disabled:button.disabled,marker:button.querySelector('small')?.textContent??null,
                    share:button.querySelector('strong')?.textContent??null})),
                  splits:visibleCount('[data-testid="crowd-split"]'),
                  summaries:visibleCount('[data-testid="round-crowd-summary"],[data-testid="crowd-summary"]'),
                  presenceCards:visibleCount('[data-testid="room-card"]'),
                  splitFollows:!!split&&stage.nextElementSibling===split.parentElement&&[...split.parentElement.children].every(node=>
                    node===split||node.getBoundingClientRect().top>=split.getBoundingClientRect().bottom-1)};
              })()`);
              await councilEvidence(page, name, {
                before,
                locked,
                reveal,
                lockedReadable,
                readable,
                lesson,
                structure,
              });
              councilStable(before, locked, controls);
              assert.ok(reveal.scrollWidth <= width + 1, "Classic reveal must fit the phone width");
              for (const selector of [prompt, art, grid, timer, result]) councilFits(reveal, selector);
              councilFits(reveal, answer, { count: 4 });
              councilAssertReadable(lockedReadable, 4);
              councilAssertReadable(readable, 4);
              councilAssertReadable(lesson, 2);
              for (const [index, entry] of readable.entries()) {
                assert.ok(entry.texts.some((text) => text.text === journeyFixtures.classic.reveal.answers[index]));
                assert.equal(structure.answers[index].disabled, true);
                assert.equal(structure.answers[index].correct, String(index === correct));
                assert.equal(structure.answers[index].selected, String(outcome !== "missed" && index === selected));
              }
              assert.equal(
                structure.answers.filter((entry) => entry.pressed === "true").length,
                outcome === "missed" ? 0 : 1,
              );
              if (outcome !== "missed")
                assert.equal(structure.answers[selected].marker, locale === "ru" ? "Твой ответ" : "Your answer");
              assert.equal(structure.timers, 1, "Reveal must retain one existing timer");
              assert.match(structure.timerLabel, locale === "ru" ? /До следующего раунда/ : /until the next round/);
              assert.match(reveal.elements[result][0].text, outcome === "correct" ? /\+200/ : /\+0/);
              const cards = reveal.elements[answer];
              assert.ok(
                Math.abs(cards[0].top - cards[1].top) <= 1 && cards[0].right <= cards[1].left + 1,
                "Reveal must use two columns",
              );
              assert.ok(
                Math.abs(cards[2].top - cards[3].top) <= 1 && cards[2].top >= cards[0].bottom - 1,
                "Reveal must keep a second row",
              );
              assert.ok(
                reveal.elements[prompt][0].height < locked.elements[prompt][0].height,
                "Reveal prompt must be compact",
              );
              assert.ok(
                reveal.elements[art][0].width <= 64 && reveal.elements[art][0].height <= 64,
                "Reveal art must be compact",
              );
              if (width === 390) {
                for (const selector of [timer, result, prompt, grid, panel])
                  councilFits(reveal, selector, { viewport: true });
                councilFits(reveal, answer, { viewport: true, count: 4 });
              }
              if (context === "public") {
                assert.equal(structure.splits, 1);
                assert.equal(structure.summaries, 0, "Public crowd counts belong only in Room split");
                assert.equal(structure.presenceCards, 0);
                assert.equal(structure.splitFollows, true, "Room split must immediately follow the reveal stage");
                assert.ok(reveal.elements[split][0].top >= reveal.elements[panel][0].bottom - 1);
                if (width === 390)
                  assert.ok(
                    reveal.elements[split][0].top + 40 <= height,
                    "Room split heading must start in the phone viewport",
                  );
              } else {
                assert.equal(structure.splits, 0, "Party choices carry the percentages without a duplicate split");
                assert.equal(structure.summaries, 1, "Party must retain its one crowd summary");
                assert.deepEqual(
                  structure.answers.map((entry) => entry.share),
                  [0, 1, 2, 3].map((index) => (index === correct ? "100%" : "0%")),
                );
              }
              assert.equal(await votes(page), outcome === "missed" ? 0 : 1);
              await changeRound(page, "window.__journey.number+=1;window.__journey.phase='answering'");
              await page.waitFor(`document.querySelector('main')?.dataset.phase==='answering'`, 5000);
              await page.evaluate("window.scrollTo(0,0)");
              const next = await councilLayout(page, controls);
              await councilEvidence(page, name + " next answering", { before, next });
              councilStable(before, next, controls);
              assert.equal(
                await page.evaluate(`document.querySelectorAll('${answer}:enabled').length`),
                4,
                "Reveal styles must not affect the next answering controls",
              );
            },
          );
        }
      }

      const quoteName = `council candidate3 Quote Hunt unlock labels ${locale} ${width}`;
      await check(quoteName, { kind: "quote", locale, mobile: true, width, height }, async (page) => {
        await councilViewport(page, width, height);
        assert.equal(await page.evaluate("document.documentElement.lang"), locale);
        // The shared helper supplies stage 1 and the final stage, not an intermediate-stage fixture.
        assert.equal(journeyFixtures.quote.answering.clueStage, 1);
        assert.equal(journeyFixtures.quote.laterClue.clueStage, 3);
        await page.evaluate(`(() => {
          const fixtureFetch=window.fetch.bind(window);window.__candidate3Duration=null;
          window.fetch=async(input,init)=>{
            const response=await fixtureFetch(input,init),url=new URL(typeof input==='string'?input:input.url,location.href);
            if(url.pathname==='/api/rounds') window.__candidate3Duration=(await response.clone().json()).round.answerDuration;
            return response;
          };
        })()`);
        await changeRound(page, "window.__journey.laterClue=false");
        await page.waitFor("window.__candidate3Duration!==null", 5000);
        const duration = await page.evaluate("window.__candidate3Duration");
        const thresholds = [Math.round((duration * 2) / 3000), Math.round(duration / 3000)];
        assert.equal(clueStageAt(thresholds[0] * 1000, duration), 2);
        assert.equal(clueStageAt(thresholds[0] * 1000 + 1, duration), 1);
        assert.equal(clueStageAt(thresholds[1] * 1000, duration), 3);
        assert.equal(clueStageAt(thresholds[1] * 1000 + 1, duration), 2);
        const controls = [
          '[data-testid="hero-search-input"]',
          '[data-testid="hero-picker-status"]',
          '[data-testid="hero-picker-board"]',
        ];
        const clues = ['[data-testid="quote-hint-1"]', '[data-testid="quote-hint-2"]'];
        await fillInput(page, controls[0], "a");
        await page.evaluate(`document.querySelector('${controls[0]}').focus({preventScroll:true})`);
        const before = await councilLayout(page, [...controls, ...clues]);
        const roster = await councilHeroState(page);
        const locked = await councilReadable(page, clues.join(","));
        assert.equal(
          await page.evaluate(`document.querySelectorAll('[data-testid^="quote-hint-"][data-state="locked"]').length`),
          2,
        );
        const roundId = await page.evaluate("document.querySelector('main').dataset.roundId");
        await councilEvidence(page, quoteName + " locked", { before, locked, duration, thresholds });
        await changeRound(page, "window.__journey.laterClue=true");
        await page.waitFor(
          `document.querySelectorAll('[data-testid^="quote-hint-"][data-state="revealed"]').length===2`,
          5000,
        );
        const after = await councilLayout(page, [...controls, ...clues]);
        const revealed = await councilReadable(page, clues.join(","));
        await councilEvidence(page, quoteName + " final", { before, after, locked, revealed, duration, thresholds });
        councilAssertReadable(locked, 2);
        councilAssertReadable(revealed, 2);
        for (const [index, seconds] of thresholds.entries()) {
          const label = locale === "ru" ? `Подсказка на ${seconds} сек.` : `Clue at ${seconds}s`;
          assert.ok(
            locked[index].texts.some((text) => text.text === label),
            `Locked clue needs the real threshold: ${label}`,
          );
          assert.ok(revealed[index].text.includes(journeyFixtures.quote.laterClue.quoteHints[index]));
        }
        councilStable(before, after, controls);
        assert.equal(after.scrollY, before.scrollY);
        assert.equal(await page.evaluate("document.querySelector('main').dataset.roundId"), roundId);
        assert.equal(await page.evaluate("document.querySelector('main').dataset.phase"), "answering");
        assert.equal(await page.evaluate(`document.querySelector('${controls[0]}').value`), "a");
        assert.equal(await page.evaluate("document.activeElement?.dataset.testid"), "hero-search-input");
        const finalRoster = await councilHeroState(page);
        assert.deepEqual(
          finalRoster.cards.map((card) => card.key),
          roster.cards.map((card) => card.key),
        );
        assert.equal(finalRoster.enabled, roster.enabled);
        for (const layout of [before, after]) {
          assert.ok(layout.scrollWidth <= width + 1);
          for (const selector of [...controls, ...clues]) councilFits(layout, selector);
        }
        assert.equal(await votes(page), 0);
      });
    }

    for (const [width, height] of [
      [390, 844],
      [1280, 560],
    ]) {
      const name = `council candidate3 waiting roster keyboard scroll ${locale} ${width}`;
      await check(name, { path: "/party", locale, mobile: width < 680, width, height }, async (page) => {
        await councilViewport(page, width, height);
        assert.equal(await page.evaluate("document.documentElement.lang"), locale);
        await page.evaluate(`(() => {
          const fixtureFetch=window.fetch.bind(window);window.__candidate3Players=8;
          window.fetch=async(input,init)=>{
            const response=await fixtureFetch(input,init),url=new URL(typeof input==='string'?input:input.url,location.href);
            if(url.pathname!=='/api/private-rooms'||!response.ok) return response;
            const payload=await response.json();
            if(payload.privateRoom) {
              payload.privateRoom.players=[...payload.privateRoom.players,...Array.from({length:6},(_,index)=>({
                name:${JSON.stringify(locale === "ru" ? "Игрок " : "Player ")}+String(index+3).padStart(2,'0'),
                host:false,self:false,away:false,score:0}))].slice(0,window.__candidate3Players);
              payload.presence={...payload.presence,activePlayers:payload.privateRoom.players.length};
            }
            return new Response(JSON.stringify(payload),{status:response.status,headers:response.headers});
          };
        })()`);
        await click(page, '[data-testid="private-room-choose-join"]');
        await fillInput(page, '[data-testid="private-room-join-code"]', "JOURNEY");
        await click(page, '[data-testid="private-room-join"]');
        await page.waitFor(`document.querySelectorAll('[data-testid="private-room-players"] li').length===8`, 5000);
        const region = '[data-testid="private-room-players-scroll"]';
        const controls = [
          '[data-testid="private-room-start"]',
          '[data-testid="private-room-chat-toggle"]',
          '[data-testid="private-room-chat-input"]',
          '[data-testid="private-room-chat-send"]',
        ];
        if (await page.evaluate(`document.querySelector('${controls[1]}').getAttribute('aria-pressed')!=='true'`))
          await click(page, controls[1]);
        await page.waitFor(`!!document.querySelector('${controls[2]}')`, 3000);
        await page.evaluate(
          `document.querySelector('[data-testid="private-room-wait"] header button').focus({preventScroll:true})`,
        );
        await nativeKey(page, "Tab");
        await page.evaluate("window.scrollTo(0,0)");
        await delay(100);
        const before = await councilLayout(page, [...controls, region]);
        const top = await councilRosterState(page);
        const states = [{ step: "top", ...top }];
        await councilEvidence(page, name + " top", { before, states });
        assert.equal(top.role, "region");
        assert.equal(top.label, locale === "ru" ? "Игроки" : "Players");
        assert.equal(top.tabIndex, 0);
        assert.equal(top.focused, true, "Tab must enter the native roster scroll region");
        assert.equal(top.moreBelow, true, "Eight-player fixture must overflow the bounded roster");
        const validateCue = (state) => {
          assert.equal(
            state.cueCount,
            state.moreBelow ? 1 : 0,
            `Cue must match actual remaining rows: ${JSON.stringify(state)}`,
          );
          if (state.moreBelow) assert.equal(state.cue, locale === "ru" ? "Ещё игроки ниже" : "More players below");
        };
        validateCue(top);
        for (const [key, windowsVirtualKeyCode] of [
          ["PageDown", 34],
          ["End", 35],
          ["Home", 36],
        ]) {
          // The shared nativeKey helper has no navigation-key codes for scrolling.
          for (const type of ["keyDown", "keyUp"])
            await page.send("Input.dispatchKeyEvent", { type, key, code: key, windowsVirtualKeyCode });
          await delay(250);
          const state = await councilRosterState(page);
          const layout = await councilLayout(page, [...controls, region]);
          states.push({ step: key, ...state });
          await councilEvidence(page, name + " " + key, { before, layout, states });
          validateCue(state);
          councilStable(before, layout, [...controls, region]);
          assert.equal(layout.scrollY, before.scrollY, "Roster keys must not scroll the page");
          assert.equal(state.focused, true);
          if (key === "PageDown") assert.ok(state.scrollTop > top.scrollTop, "Native PageDown must scroll the roster");
          if (key === "End") {
            assert.equal(state.moreBelow, false);
            assert.equal(state.lastVisible, true, "Keyboard scrolling must reveal the final full player row");
            assert.equal(state.last, locale === "ru" ? "Игрок 08" : "Player 08");
          }
          if (key === "Home") {
            assert.equal(state.scrollTop, 0);
            assert.equal(state.moreBelow, true);
          }
        }
        await changeRound(page, "window.__candidate3Players=2");
        await page.waitFor(`document.querySelectorAll('[data-testid="private-room-players"] li').length===2`, 5000);
        await delay(100);
        const short = await councilRosterState(page);
        const after = await councilLayout(page, [...controls, region]);
        states.push({ step: "two players", ...short });
        await councilEvidence(page, name + " no overflow", { before, after, states });
        validateCue(short);
        assert.equal(short.moreBelow, false, "A fitting two-player roster must not claim hidden players");
        councilStable(before, after, [...controls, region]);
        for (const selector of [...controls, region]) councilFits(after, selector);
        assert.equal(await votes(page), 0);
      });
    }

    const orderName = `council candidate3 wrong Order Up shows both orders ${locale}`;
    await check(orderName, { kind: "order", locale, mobile: true, width: 390, height: 844 }, async (page) => {
      await councilViewport(page, 390, 844);
      const question = journeyFixtures.order.reveal;
      const correct = question.reveal.correctAnswerKey.slice("order-v1:".length).split(",");
      const submitted = [...correct].reverse();
      assert.notDeepEqual(submitted, correct);
      for (const key of submitted)
        await tap(
          page,
          '[data-testid="value-order-card"]',
          question.valueOrder.cards.findIndex((card) => card.key === key),
        );
      await page.waitFor("window.__journey.submissions.length===1", 3000);
      assert.equal(await page.evaluate("window.__journey.submissions[0].answerKey"), "order-v1:" + submitted.join(","));
      await finishRound(page);
      await page.evaluate("window.scrollTo(0,0)");
      const sequences =
        await page.evaluate(`Array.from(document.querySelectorAll('[data-testid="value-order-sequence"]'),node=>({
        label:node.querySelector('small').textContent,names:[...node.querySelectorAll('strong')].map(item=>item.textContent),
        positions:[...node.querySelectorAll('i')].map(item=>item.textContent),values:[...node.querySelectorAll('em')].map(item=>item.textContent)}))`);
      const readable = await councilReadable(page, '[data-testid="value-order-sequence"]');
      const layout = await councilLayout(page, ['[data-testid="value-order-sequence"]']);
      await councilEvidence(page, orderName, { correct, submitted, sequences, readable, layout });
      assert.equal(sequences.length, 2, "A wrong order must show the correct and submitted sequences");
      assert.deepEqual(
        sequences.map((sequence) => sequence.label),
        locale === "ru" ? ["Верный порядок", "Твой порядок"] : ["Correct order", "Your order"],
      );
      const names = new Map(question.valueOrder.cards.map((card) => [card.key, card.name]));
      assert.deepEqual(
        sequences[0].names,
        correct.map((key) => names.get(key)),
      );
      assert.deepEqual(
        sequences[1].names,
        submitted.map((key) => names.get(key)),
      );
      assert.deepEqual(
        sequences[0].values,
        correct.map((key) => question.reveal.orderValues.find((entry) => entry.key === key).label),
      );
      assert.deepEqual(sequences[1].values, [], "Only the correct sequence shows the answer values");
      for (const sequence of sequences) assert.deepEqual(sequence.positions, ["1", "2", "3", "4"]);
      councilAssertReadable(readable, 2);
      councilFits(layout, '[data-testid="value-order-sequence"]', { count: 2 });
      assert.ok(layout.scrollWidth <= 391);
      assert.equal(await votes(page), 1);
      await page.evaluate(
        `document.querySelectorAll('[data-testid="value-order-sequence"]')[1].scrollIntoView({block:'end'})`,
      );
      await councilEvidence(page, orderName + " submitted", { correct, submitted, sequences, readable });
    });
  }
  // These checks use the helper's unchanged English question fixtures in both UI languages.
  // laterClue is the final clue stage; the helper does not supply a middle-stage snapshot.
  for (const locale of ["en", "ru"]) {
    for (const width of [320, 390, 1280]) {
      const height = width === 320 ? 568 : width === 390 ? 844 : 640;
      for (const kind of ["hero", "aghanim"]) {
        for (const outcome of ["correct", "wrong"]) {
          const name = `council candidate2 compact hero reveal ${locale} ${width} ${kind} ${outcome}`;
          await check(name, { kind, locale, mobile: width < 680, width, height }, async (page) => {
            await councilViewport(page, width, height);
            const controls = [
              '[data-testid="hero-picker"]',
              '[data-testid="hero-search-input"]',
              '[data-testid="hero-picker-status"]',
              '[data-testid="hero-picker-board"]',
            ];
            const first = await councilLayout(page, controls);
            const roster = await councilHeroState(page);
            assert.ok(roster.cards.length > 100, "Answering must retain the full roster");
            await changeRound(page, "window.__journey.laterClue=true");
            await page.waitFor(
              kind === "hero"
                ? `!!document.querySelector('[data-testid="spell-ability-artwork"]')`
                : `document.querySelector('[data-testid="round-prompt"]')?.dataset.aghanimStage==='3'`,
              5000,
            );
            const answering = await councilLayout(page, controls);
            const correct = journeyFixtures[kind].reveal.reveal.correctAnswerKey;
            const wrong = correct === "npc_dota_hero_abaddon" ? "npc_dota_hero_antimage" : "npc_dota_hero_abaddon";
            const key = outcome === "correct" ? correct : wrong;
            const pickedName = roster.cards.find((card) => card.key === key).label;
            const correctName = roster.cards.find((card) => card.key === correct).label;
            if (width < 680) await tap(page, `[data-hero-key="${key}"]`);
            else {
              await fillInput(page, controls[1], pickedName);
              await page.evaluate(`document.querySelector('${controls[1]}').focus({preventScroll:true})`);
              await nativeKey(page, "Enter");
            }
            await page.waitFor("window.__journey.submissions.length===1", 3000);
            await page.evaluate("window.scrollTo(0,0)");
            const locked = await councilLayout(page, controls);
            const lockedState = await councilHeroState(page);
            await finishRound(page);
            const reveal = await councilHeroState(page);
            await councilEvidence(page, name, { first, answering, locked, lockedState, reveal });
            councilStable(first, answering, controls);
            councilStable(answering, locked, controls);
            assert.deepEqual(
              lockedState.cards.map((card) => card.key),
              roster.cards.map((card) => card.key),
            );
            assert.equal(lockedState.enabled, 0, "Locked roster and search must reject more answers");
            assert.match(lockedState.status, locale === "ru" ? /Ответ принят:/ : /Locked:/);
            assert.ok(lockedState.status.includes(pickedName));
            assert.equal(reveal.hasSearch, false, "Reveal must remove the inactive search field");
            assert.equal(reveal.enabled, 0, "Reveal must have no enabled answer controls");
            assert.ok(reveal.height < lockedState.height, "Reveal must be shorter than the full locked roster");
            assert.deepEqual(reveal.cards.map((card) => card.key).sort(), [...new Set([key, correct])].sort());
            for (const card of reveal.cards) {
              assert.equal(card.name, card.label, "Result cards need a visible hero name");
              assert.ok(card.nameWidth > 0, "Result card name must be rendered");
              assert.equal(card.disabled, true);
              assert.equal(card.share, null, "Public shares belong in Room split, not the result cards");
            }
            assert.equal(reveal.cards.find((card) => card.key === correct).state, "correct");
            assert.match(reveal.status, locale === "ru" ? /^Ответ:/ : /^Answer:/);
            assert.ok(reveal.status.includes(correctName));
            if (outcome === "wrong") {
              assert.equal(reveal.cards.find((card) => card.key === key).state, "wrong");
              assert.match(reveal.status, locale === "ru" ? /Твой выбор:/ : /You picked/);
              assert.ok(reveal.status.includes(pickedName));
            }
            assert.equal(await page.evaluate(`!!document.querySelector('[data-testid="keyed-reveal-media"]')`), false);
            assert.equal(await votes(page), 1);
          });
        }
      }

      const practiceName = `council candidate2 practice four choices unclipped ${locale} ${width}`;
      await check(practiceName, { path: "/", locale, mobile: width < 680, width, height }, async (page) => {
        await councilViewport(page, width, height);
        await councilEntryWait(page);
        const count = await page.evaluate(
          `Number(document.querySelector('[data-testid="entry-wait-tips"]').dataset.tipCount)`,
        );
        assert.ok(count > 0 && count <= 10, "Practice carousel must have a bounded tip count");
        const stageSizes = [];
        for (let step = 0; step < count; step += 1) {
          stageSizes.push(await councilLayout(page, ['[data-testid="entry-wait-stage"]']));
          if (await page.evaluate(`document.querySelector('[data-testid="entry-wait-tip"]').dataset.tip==='keys'`))
            break;
          await nativeKey(page, "ArrowRight");
        }
        await page.waitFor(`!!document.querySelector('[data-panel="keys"][data-active="true"]')`, 3000);
        const before = await councilPracticeState(page);
        await councilEvidence(page, practiceName + " initial", { before, stageSizes });
        await page.evaluate("document.activeElement?.blur()");
        await nativeKey(page, "4");
        await page.waitFor(
          `document.querySelectorAll('[data-testid="practice-answer"][aria-pressed="true"]').length===1`,
          3000,
        );
        const selected = await councilPracticeState(page);
        await councilEvidence(page, practiceName + " selected", { before, selected });
        for (const state of [before, selected]) {
          assert.equal(state.cards.length, 4, "Practice must render all four choices");
          assert.ok(state.cards.every((card) => card.box.width > 0 && card.box.height > 0));
          assert.deepEqual(state.violations, [], "Practice answer buttons and text must fit the fixed stage");
        }
        assert.equal(selected.cards[3].pressed, "true");
        assert.match(selected.cards[3].text, locale === "ru" ? /Выбрано/ : /Picked/);
        assert.ok(selected.cards.every((card) => card.disabled));
        for (const size of stageSizes) {
          const stage = size.elements['[data-testid="entry-wait-stage"]'][0];
          assert.equal(stage.width, before.stage.width, "Tip changes must keep the stage width");
          assert.equal(stage.height, before.stage.height, "Tip changes must keep the stage height");
        }
        assert.equal(selected.stage.height, before.stage.height);
        assert.equal(await votes(page), 0, "Practice selections must not submit a live answer");
      });

      const createName = `council candidate2 Create after ten settings ${locale} ${width}`;
      await check(createName, { path: "/party", locale, mobile: width < 680, width, height }, async (page) => {
        await councilViewport(page, width, height);
        await click(page, '[data-testid="private-room-choose-create"]');
        const code = '[data-testid="private-room-join-code"]';
        const create = '[data-testid="private-room-create"]';
        const formats = '[aria-labelledby="party-round-types"] button';
        await page.waitFor(`document.activeElement?.dataset.testid==='private-room-join-code'`, 3000);
        const order = await page.evaluate(`(() => {
          const action=document.querySelector('${create}'),buttons=[...document.querySelectorAll('${formats}')];
          return {count:buttons.length,actions:document.querySelectorAll('${create}').length,
            after:buttons.every(button=>Boolean(button.compareDocumentPosition(action)&Node.DOCUMENT_POSITION_FOLLOWING)),
            fixed:getComputedStyle(action.parentElement).position};
        })()`);
        const steps = [],
          violations = [];
        const actionVisible = async (label) => {
          const layout = await councilLayout(page, [create]);
          steps.push({ label, layout });
          const box = layout.elements[create][0];
          if (!box?.visible || box.top < 0 || box.bottom > height || box.left < 0 || box.right > width)
            violations.push(`${label}: final Create action is outside the viewport`);
          if (
            !(await page.evaluate(
              `(() => {const button=document.querySelector('${create}'),r=button.getBoundingClientRect();return button.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));})()`,
            ))
          )
            violations.push(`${label}: final Create action is covered`);
        };
        await actionVisible("initial code focus");
        for (let index = 0; index < 10; index += 1) {
          await nativeKey(page, "Tab");
          const focus = await page.evaluate(`(() => {
            const button=document.querySelectorAll('${formats}')[${index}],r=button.getBoundingClientRect(),action=document.querySelector('${create}').getBoundingClientRect();
            return {expected:document.activeElement===button,top:r.top,bottom:r.bottom,actionTop:action.top,
              hit:button.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))};
          })()`);
          steps.push({ index, focus });
          if (!focus.expected) violations.push(`Tab ${index + 1} did not focus format ${index + 1}`);
          if (focus.top < -1 || focus.bottom > focus.actionTop + 1 || !focus.hit)
            violations.push(`Format ${index + 1} is clipped or covered while focused`);
          await actionVisible(`format ${index + 1} focus`);
        }
        await nativeKey(page, "Tab");
        assert.equal(await page.evaluate("document.activeElement?.dataset.testid"), "private-room-create");
        await nativeKey(page, "Enter");
        await page.waitFor(`!!document.querySelector('[data-testid="private-room-error"]')`, 3000);
        await fillInput(page, code, "JOURNEY");
        await page.evaluate(`document.querySelector('${code}').focus()`);
        await nativeKey(page, "Enter");
        await page.waitFor(`!!document.querySelector('[data-testid="private-room-wait"]')`, 5000);
        await councilEvidence(page, createName, { order, steps, violations });
        assert.deepEqual(order, { count: 10, actions: 1, after: true, fixed: "fixed" });
        assert.deepEqual(violations, [], "Create and focused settings must remain accessible");
        assert.equal(await page.evaluate("location.search"), "?room=JOURNEY");
      });

      const partyName = `council candidate2 party keeps all voted hero shares ${locale} ${width}`;
      await check(
        partyName,
        { path: "/play?room=JOURNEY", kind: "hero", locale, mobile: width < 680, width, height },
        async (page) => {
          await councilViewport(page, width, height);
          await page.evaluate("window.__journey.waiting=false");
          await page.waitFor(
            `!!document.querySelector('[data-testid="private-room-play-dock"]') && document.querySelector('main')?.dataset.phase==='answering'`,
            20000,
          );
          const keys = ["abaddon", "antimage", "axe", "bane", "crystal_maiden", "dazzle"].map(
            (key) => "npc_dota_hero_" + key,
          );
          const counts = [4, 3, 2, 1, 1, 1];
          await page.evaluate(`(() => {
          const fixtureFetch=window.fetch.bind(window),keys=${JSON.stringify(keys)},counts=${JSON.stringify(counts)};
          window.fetch=async(input,init)=>{
            const response=await fixtureFetch(input,init),url=new URL(typeof input==='string'?input:input.url,location.href);
            if(url.pathname!=='/api/rounds'||window.__journey.phase!=='reveal') return response;
            const payload=await response.json();
            payload.crowd={...payload.crowd,total:12,keyCounts:keys.map((answerKey,index)=>({answerKey,count:counts[index]}))};
            return new Response(JSON.stringify(payload),{status:response.status,headers:response.headers});
          };
        })()`);
          await tap(page, '[data-hero-key="npc_dota_hero_antimage"]');
          await page.waitFor("window.__journey.submissions.length===1", 3000);
          await finishRound(page);
          const reveal = await councilHeroState(page);
          await councilEvidence(page, partyName, reveal);
          assert.deepEqual(
            reveal.cards.map((card) => card.key).sort(),
            [...keys].sort(),
            "Party reveal must not keep only the top four votes",
          );
          for (const [index, key] of keys.entries()) {
            const card = reveal.cards.find((entry) => entry.key === key);
            assert.equal(card.share, `${Math.round((counts[index] / 12) * 100)}%`);
            assert.equal(card.name, card.label);
            assert.ok(card.nameWidth > 0);
            assert.equal(card.disabled, true);
          }
          assert.equal(reveal.enabled, 0);
          assert.equal(reveal.cards.find((card) => card.key === keys[0]).state, "correct");
          assert.equal(reveal.cards.find((card) => card.key === keys[1]).state, "wrong");
          assert.equal(await votes(page), 1);
        },
      );

      for (const context of ["profile", "party"]) {
        const name = `council candidate2 preview clue bounds ${locale} ${width} ${context}`;
        await check(
          name,
          {
            path: context === "profile" ? "/profile?recordsPreview=long" : "/party",
            real: context === "profile",
            locale,
            mobile: width < 680,
            width,
            height,
          },
          async (page) => {
            await councilViewport(page, width, height);
            if (context === "party") await click(page, '[data-testid="private-room-choose-create"]');
            for (const game of ["spell-link", "aghanim-lab"]) {
              const selector = `[data-testid="format-preview-${game}"]`;
              await page.waitFor(`!!document.querySelector('${selector}')`, 5000);
              await page.evaluate(`document.querySelector('${selector}').scrollIntoView({block:'center'})`);
              const bounds = await page.evaluate(`(() => {
              const frame=document.querySelector('${selector}'),crop=frame.parentElement;
              const rect=node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
              return {frame:rect(frame),crop:rect(crop),cropOverflow:getComputedStyle(crop).overflow,
                rows:[...frame.querySelectorAll('strong')].filter(node=>/^0[123]$/.test(node.textContent)).map(marker=>{
                  const text=marker.nextElementSibling,box=rect(text),scale=box.height/text.offsetHeight;
                  return {marker:marker.textContent,row:rect(marker.parentElement),text:box,content:text.textContent,
                    lineHeight:parseFloat(getComputedStyle(text).lineHeight)*scale};
                })};
            })()`);
              await councilEvidence(page, name + " " + game, bounds);
              assert.equal(bounds.rows.length, 3);
              assert.match(bounds.cropOverflow, /hidden|clip/, "Decorative previews must keep their shared crop");
              // Horizontal excerpts are intentional. Text must not bleed vertically into another clue or out of the crop.
              for (const row of bounds.rows) {
                assert.ok(row.content.trim().length > 0);
                assert.ok(
                  row.text.top >= row.row.top - 1 && row.text.bottom <= row.row.bottom + 1,
                  `${game} clue ${row.marker} text exceeds its row`,
                );
                assert.ok(
                  row.row.top >= bounds.crop.top - 1 && row.row.bottom <= bounds.crop.bottom + 1,
                  `${game} clue ${row.marker} exceeds the shared preview crop`,
                );
              }
              const first = bounds.rows[0];
              assert.ok(first.text.height <= first.lineHeight * 3 + 1, `${game} primary excerpt exceeds three lines`);
              assert.ok(
                first.text.bottom <= Math.min(...bounds.rows.slice(1).map((row) => row.row.top)) + 1,
                `${game} primary excerpt overlaps locked clues`,
              );
            }
          },
        );
      }
    }
    for (const width of [320, 390, 1280]) {
      for (const kind of ["hero", "aghanim"]) {
        const name = `council polish stable clues ${locale} ${width} ${kind}`;
        await check(
          name,
          { kind, locale, mobile: width < 680, width, height: width === 320 ? 568 : 844 },
          async (page) => {
            await councilViewport(page, width, width === 1280 ? 640 : width === 320 ? 568 : 844);
            assert.equal(await page.evaluate("document.documentElement.lang"), locale);
            assert.equal(journeyFixtures[kind].answering.clueStage, 1, "Fixture must start with locked clues");
            assert.equal(journeyFixtures[kind].laterClue.clueStage, 3, "Fixture must supply the final answering clue");
            assert.equal(journeyFixtures[kind].laterClue.reveal, null, "Clue fixture must not expose the answer");
            const prefix = kind === "hero" ? "spell" : "aghanim";
            const controls = [
              '[data-testid="hero-search-input"]',
              '[data-testid="hero-picker-status"]',
              '[data-testid="hero-picker-board"]',
            ];
            const clues = [1, 2, 3].map((stage) => `[data-testid="${prefix}-clue-${stage}"]`);
            const selectors = [...controls, ...clues];
            await fillInput(page, controls[0], "a");
            await page.evaluate(`document.querySelector(${JSON.stringify(controls[0])}).focus({preventScroll:true})`);
            const before = await councilLayout(page, selectors);
            const roundId = await page.evaluate("document.querySelector('main').dataset.roundId");
            await councilEvidence(page, name + " first", before);
            await changeRound(page, "window.__journey.laterClue=true");
            await page.waitFor(
              kind === "hero"
                ? `!!document.querySelector('[data-testid="spell-ability-artwork"]')`
                : `document.querySelector('[data-testid="round-prompt"]')?.dataset.aghanimStage==='3'`,
              5000,
            );
            const after = await councilLayout(page, selectors);
            await councilEvidence(page, name + " final", { before, after });
            assert.equal(await page.evaluate("document.querySelector('main').dataset.roundId"), roundId);
            assert.equal(await page.evaluate("document.querySelector('main').dataset.phase"), "answering");
            assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(controls[0])}).value`), "a");
            assert.equal(await page.evaluate("document.activeElement?.dataset.testid"), "hero-search-input");
            assert.equal(await votes(page), 0);
            assert.equal(after.scrollY, before.scrollY, "Clue unlock must not move the page");
            assert.notEqual(
              after.elements[clues[1]][0].text,
              before.elements[clues[1]][0].text,
              "Second clue did not unlock",
            );
            assert.notEqual(
              after.elements[clues[2]][0].text,
              before.elements[clues[2]][0].text,
              "Final clue did not unlock",
            );
            councilStable(before, after, controls);
            for (const layout of [before, after]) {
              assert.ok(layout.scrollWidth <= width + 1, `Page overflows at ${width}px: ${JSON.stringify(layout)}`);
              for (const selector of selectors) councilFits(layout, selector);
              for (const selector of clues)
                assert.ok(
                  layout.elements[selector][0].scrollWidth <= layout.elements[selector][0].clientWidth + 1,
                  `${selector} content overflows its clue slot`,
                );
            }
          },
        );
      }
    }
    for (const input of ["keyboard", "touch"]) {
      const name = `council polish phone Order Up ${locale} ${input}`;
      await check(name, { kind: "order", locale, mobile: true, width: 390, height: 844 }, async (page) => {
        await councilViewport(page, 390, 844);
        assert.equal(await page.evaluate("document.documentElement.lang"), locale);
        const card = '[data-testid="value-order-card"]';
        const hint = '[data-testid="value-order-board"] [data-testid="answer-helper"]';
        const undo = '[data-testid="value-order-board"] button[aria-label]';
        const undoSelector = `${undo}:not([data-testid="value-order-card"])`;
        const before = await councilLayout(page, [card, hint, undoSelector]);
        await councilEvidence(page, name + " initial", before);
        councilFits(before, card, { viewport: true, count: 4 });
        councilFits(before, hint, { viewport: true });
        assert.match(before.elements[hint][0].text, locale === "ru" ? /Четвёртый.*отправит/ : /fourth locks/);
        const selected = () => page.evaluate(`document.querySelectorAll('${card}[data-selected="true"]').length`);
        const pick = async (index) => {
          if (input === "touch") await tap(page, card, index);
          else {
            await page.evaluate("document.activeElement?.blur()");
            await nativeKey(page, String(index + 1));
          }
          await page.waitFor(`document.querySelectorAll('${card}[data-selected="true"]').length===${index + 1}`, 3000);
        };
        await pick(0);
        await pick(1);
        assert.equal(await votes(page), 0, "A partial order must not lock");
        if (input === "touch") await tap(page, undoSelector);
        else await nativeKey(page, "Backspace");
        assert.equal(await selected(), 1, "Undo must remove only the last pick");
        assert.equal(await votes(page), 0, "Undo must not lock");
        await pick(1);
        await pick(2);
        assert.equal(await votes(page), 0, "Three picks must not lock");
        const partial = await councilLayout(page, [card, hint, undoSelector]);
        await councilEvidence(page, name + " partial", partial);
        councilFits(partial, card, { viewport: true, count: 4 });
        councilFits(partial, hint, { viewport: true });
        await pick(3);
        await page.waitFor("window.__journey.submissions.length===1", 3000);
        assert.equal(
          await page.evaluate("window.__journey.submissions[0].answerKey"),
          "order-v1:" + journeyFixtures.order.answering.valueOrder.cards.map((entry) => entry.key).join(","),
        );
        assert.equal(
          await page.evaluate(`document.querySelector('[data-testid="value-order-board"]').dataset.locked`),
          "true",
        );
        assert.equal(await page.evaluate(`document.querySelectorAll('${card}:disabled').length`), 4);
        assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(undoSelector)}).disabled`), true);
        await nativeKey(page, "Backspace");
        await nativeKey(page, "1");
        assert.equal(await selected(), 4, "Locked picks must not change");
        assert.equal(await votes(page), 1, "A locked order must submit only once");
        await page.evaluate("window.scrollTo(0,0)");
        await councilEvidence(page, name + " locked", await councilLayout(page, [card, hint, undoSelector]));
      });
    }
    for (const width of [390, 1280]) {
      for (const kind of ["classic", "hero"]) {
        const name = `council polish public reveal ${locale} ${width} ${kind}`;
        await check(name, { kind, locale, mobile: width < 680, width, height: 844 }, async (page) => {
          await councilViewport(page, width, width === 1280 ? 640 : 844);
          assert.equal(await page.evaluate("document.documentElement.lang"), locale);
          // Earn gold through a real answer before measuring enabled power-up controls.
          await answerByTouch(page, kind);
          await finishRound(page);
          await page.waitFor(`document.querySelector('[data-testid="score-grid"] strong')?.textContent==='200'`, 3000);
          await changeRound(page, "window.__journey.number+=1;window.__journey.phase='answering'");
          await page.waitFor(`document.querySelector('main')?.dataset.phase==='answering'`, 5000);
          await answerByTouch(page, kind, 2);
          await page.evaluate("window.scrollTo(0,0)");
          const controls = ['[data-testid="shop-aegis"]', '[data-testid="shop-rune"]'];
          const selectors = [
            ...controls,
            '[data-testid="score-grid"]',
            '[data-testid="crowd-card"]',
            '[data-testid="room-card"]',
            '[data-testid="crowd-score-summary"]',
          ];
          const before = await councilLayout(page, selectors);
          assert.equal(before.elements[controls[1]][0].disabled, false, "Earned gold must enable Double Damage");
          await finishRound(page);
          await page.waitFor(`document.querySelector('[data-testid="score-grid"] strong')?.textContent==='400'`, 3000);
          const after = await councilLayout(page, selectors);
          const structure = await page.evaluate(`(() => {
            const split=document.querySelector('[data-testid="crowd-card"]'),shop=document.querySelector('[data-testid="gold-shop"]');
            return {splitCount:document.querySelectorAll('[data-testid="crowd-split"]').length,
              duplicateSummary:document.querySelectorAll('[data-testid="round-crowd-summary"],[data-testid="crowd-summary"]').length,
              splitBeforeHistory:!!(split.compareDocumentPosition(split.parentElement.lastElementChild)&Node.DOCUMENT_POSITION_FOLLOWING),
              splitBeforeControls:split.getBoundingClientRect().bottom<=shop.getBoundingClientRect().top,
              correctShares:[...document.querySelectorAll('[data-testid="crowd-split-row"][data-correct="true"]')].map(node=>node.dataset.percentage),
              summaryValues:[...document.querySelectorAll('[data-testid="crowd-score-summary"] strong')].map(node=>node.textContent),
              summaryLabels:[...document.querySelectorAll('[data-testid="crowd-score-summary"] small')].map(node=>node.textContent)};
          })()`);
          await councilEvidence(page, name, { before, after, structure });
          councilFits(after, '[data-testid="crowd-card"]');
          assert.equal(
            after.elements['[data-testid="room-card"]'].length,
            0,
            "Presence card must not duplicate Room split",
          );
          assert.equal(structure.splitCount, 1, "Public reveal must contain one Room split");
          assert.equal(structure.duplicateSummary, 0, "The lesson must not repeat the public split");
          assert.equal(structure.splitBeforeHistory, true, "Room split must precede recent-round history");
          assert.deepEqual(structure.correctShares, ["100"]);
          assert.deepEqual(structure.summaryValues, ["+200", "+200", "+200"]);
          assert.equal(structure.summaryLabels.length, 3);
          if (width === 1280) {
            councilStable(before, after, controls);
            councilFits(after, '[data-testid="crowd-score-summary"]', { viewport: true });
            for (const selector of controls) councilFits(after, selector, { viewport: true });
          } else {
            assert.equal(structure.splitBeforeControls, true, "Phone reveal must show Room split before power-ups");
            // The phone split moves first; controls keep their size and position relative to the score grid.
            for (const selector of controls) {
              assert.equal(after.elements[selector][0].width, before.elements[selector][0].width);
              assert.equal(after.elements[selector][0].height, before.elements[selector][0].height);
              const score = '[data-testid="score-grid"]';
              assert.ok(
                Math.abs(
                  after.elements[selector][0].top -
                    after.elements[score][0].top -
                    (before.elements[selector][0].top - before.elements[score][0].top),
                ) <= 1,
                `${selector} moved relative to the phone score grid`,
              );
            }
          }
          // Exercise the enabled control with native input, not a DOM click.
          if (width < 680) await tap(page, controls[1]);
          else {
            await page.evaluate(`document.querySelector(${JSON.stringify(controls[1])}).focus()`);
            await nativeKey(page, "Enter");
          }
          await page.waitFor(`document.querySelector('[data-testid="shop-rune"]')?.dataset.state==='active'`, 3000);
          assert.equal(await votes(page), 2, "Buying a power-up must not submit another answer");
        });
      }
    }
    for (const width of [320, 1280]) {
      // This is RoundFeedback during reveal, not EntryWait above practice lessons.
      const name = `council polish round-feedback reconnect before reveal lesson ${locale} ${width}`;
      await check(
        name,
        { kind: "classic", locale, mobile: width < 680, width, height: width === 320 ? 568 : 844 },
        async (page) => {
          await councilViewport(page, width, width === 1280 ? 640 : 568);
          assert.equal(await page.evaluate("document.documentElement.lang"), locale);
          await answerByTouch(page, "classic");
          await finishRound(page);
          await page.evaluate("window.scrollTo(0,0)");
          const status = '[data-testid="round-connection-status"]';
          const lesson = '[data-testid="reveal-explanation"]';
          const feedback = '[data-testid="round-feedback"]';
          const before = await councilLayout(page, [feedback, lesson]);
          await changeRound(page, "window.__journey.blockRounds=true");
          await page.waitFor(`!!document.querySelector(${JSON.stringify(status)})`, 10000);
          const offline = await councilLayout(page, [feedback, status, lesson]);
          await councilEvidence(page, name + " offline", { before, offline });
          councilFits(offline, status, { viewport: true });
          assert.ok(
            offline.elements[status][0].bottom <= offline.elements[lesson][0].top,
            "Reconnect notice must precede the lesson visually",
          );
          assert.equal(
            await page.evaluate(
              `Boolean(document.querySelector(${JSON.stringify(status)}).compareDocumentPosition(document.querySelector(${JSON.stringify(lesson)})) & Node.DOCUMENT_POSITION_FOLLOWING)`,
            ),
            true,
            "Reconnect notice must precede the lesson in reading order",
          );
          assert.equal(
            await page.evaluate(`document.querySelector(${JSON.stringify(feedback)}).getAttribute('role')`),
            "status",
          );
          assert.equal(
            await page.evaluate(`document.querySelector(${JSON.stringify(feedback)}).getAttribute('aria-live')`),
            "polite",
          );
          councilStable(before, offline, [lesson]);
          await changeRound(page, "window.__journey.blockRounds=false");
          await page.waitFor(`!document.querySelector(${JSON.stringify(status)})`, 10000);
          const recovered = await councilLayout(page, [feedback, lesson]);
          await councilEvidence(page, name + " recovered", { before, offline, recovered });
          councilStable(before, recovered, [feedback, lesson]);
          assert.equal(await page.evaluate("document.querySelector('main').dataset.phase"), "reveal");
          assert.equal(await votes(page), 1, "Recovery must retain the accepted answer");
        },
      );
    }
    for (const width of [320, 390, 1280]) {
      const name = `council polish EntryWait reconnect above practice ${locale} ${width}`;
      await check(
        name,
        { path: "/", kind: "classic", locale, mobile: width < 680, width, height: width === 320 ? 568 : 844 },
        async (page) => {
          await councilViewport(page, width, width === 1280 ? 640 : width === 320 ? 568 : 844);
          assert.equal(await page.evaluate("document.documentElement.lang"), locale);
          // The helper's initial reveal lasts only 80ms. Hold that same public question
          // with valid reveal timing so EntryWait can render and recover before a fresh round.
          await page.evaluate(`(() => {
            const fixtureFetch=window.fetch.bind(window);
            const entry=window.__entryWaitFixture={hold:true,snapshot:null};
            window.fetch=async (input,init)=>{
              const response=await fixtureFetch(input,init);
              const url=new URL(typeof input==='string'?input:input.url,location.href);
              if(url.pathname!=='/api/rounds'||!entry.hold) return response;
              if(!entry.snapshot) {
                const snapshot=await response.json(),now=snapshot.serverNow;
                if(snapshot.round.phase!=='reveal') throw new Error('Fixture did not start in reveal');
                entry.snapshot={...snapshot,round:{...snapshot.round,startedAt:now-15000,answerDeadline:now-1,revealDeadline:now+30000}};
              }
              return new Response(JSON.stringify({...entry.snapshot,serverNow:Date.now()}),
                {status:200,headers:{'Content-Type':'application/json'}});
            };
          })()`);
          if (width < 680) await tap(page, '[data-testid="start-arcade"]');
          else await click(page, '[data-testid="start-arcade"]');
          const wait = '[data-testid="round-entry-wait"]';
          const status = `${wait} [role="status"]`;
          const notice = `${status} > span`;
          const lessons = '[data-testid="entry-wait-tips"]';
          const selectors = [status, notice, lessons, '[data-testid="entry-wait-hint"]'];
          await page.waitFor(`!!document.querySelector('${lessons}')`, 5000);
          await page.evaluate("window.scrollTo(0,0)");
          const before = await councilLayout(page, selectors);
          assert.equal(before.elements[status][0].text, "", "Healthy EntryWait must not show an error");
          const tip = await page.evaluate(`document.querySelector('[data-testid="entry-wait-tip"]').dataset.tip`);
          await changeRound(page, "window.__journey.blockRounds=true");
          await page.waitFor(`document.querySelector('${status}')?.textContent.trim().length>0`, 10000);
          const offline = await councilLayout(page, selectors);
          await councilEvidence(page, name + " offline", { before, offline });
          assert.equal(await page.evaluate("document.querySelector('main').dataset.phase"), "waiting");
          councilFits(offline, notice, { viewport: true });
          assert.ok(
            offline.elements[notice][0].bottom <= offline.elements[lessons][0].top,
            "EntryWait reconnect notice must be above practice lessons",
          );
          assert.equal(
            await page.evaluate(
              `Boolean(document.querySelector('${status}').compareDocumentPosition(document.querySelector('${lessons}')) & Node.DOCUMENT_POSITION_FOLLOWING)`,
            ),
            true,
            "EntryWait reconnect notice must precede practice lessons in reading order",
          );
          assert.equal(await page.evaluate(`document.querySelector('${status}').getAttribute('aria-live')`), "polite");
          await changeRound(page, "window.__journey.blockRounds=false");
          await page.waitFor(`document.querySelector('${status}')?.textContent.trim()===''`, 10000);
          const recovered = await councilLayout(page, selectors);
          await councilEvidence(page, name + " recovered", { before, offline, recovered });
          assert.equal(recovered.elements[notice].length, 0, "Recovery must remove the EntryWait error");
          councilStable(before, recovered, [status, lessons]);
          assert.equal(
            await page.evaluate(`document.querySelector('[data-testid="entry-wait-tip"]').dataset.tip`),
            tip,
          );
          assert.equal(await page.evaluate("document.querySelector('main').dataset.phase"), "waiting");
          await changeRound(page, "window.__entryWaitFixture.hold=false");
          await page.waitFor(`document.querySelector('main')?.dataset.phase==='answering'`, 5000);
          assert.equal(await page.evaluate(`!!document.querySelector('${wait}')`), false);
          assert.equal(await votes(page), 0, "EntryWait recovery must not submit practice answers");
        },
      );
    }
  }
  for (const action of ["join", "create"]) {
    await check(`council keyboard party ${action}`, { path: "/party" }, async (page) => {
      await page.send("Emulation.setDeviceMetricsOverride", {
        width: 1280,
        height: 640,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await click(page, `[data-testid="private-room-choose-${action}"]`);
      await page.waitFor(`document.activeElement?.dataset.testid==='private-room-join-code'`);
      if (action === "create") {
        const bottom = await page.evaluate(
          `document.querySelector('[data-testid="private-room-create"]').getBoundingClientRect().bottom`,
        );
        assert.ok(bottom <= 640, `Create is below the viewport at ${bottom}px`);
        assert.equal(await page.evaluate(`!!document.querySelector('#party-round-types')`), true);
      }
      await nativeKey(page, "Enter");
      await page.waitFor(`!!document.querySelector('[data-testid="private-room-error"]')`);
      await fillInput(page, '[data-testid="private-room-join-code"]', "JOURNEY");
      await nativeKey(page, "Enter");
      await page.waitFor(`!!document.querySelector('[data-testid="private-room-wait"]')`);
      assert.equal(await page.evaluate(`location.search`), "?room=JOURNEY");
    });
  }
  await check("council shop hit areas do not overlap", { kind: "shop" }, async (page) => {
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 640,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const overlaps = await page.evaluate(`(() => {
      const buttons=[...document.querySelectorAll('[data-testid="shopkeeper-store-item"]')];
      return buttons.flatMap((button,index)=>{
        const a=button.getBoundingClientRect();
        return buttons.slice(index+1).filter(other=>{
          const b=other.getBoundingClientRect();
          return Math.min(a.right,b.right)-Math.max(a.left,b.left)>0.5 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>0.5;
        }).map(other=>[button.getAttribute('aria-label'),other.getAttribute('aria-label')]);
      });
    })()`);
    assert.deepEqual(overlaps, []);
  });
  for (const width of [320, 1280]) {
    for (const [kind, outcome] of [
      ["classic", "correct"],
      ["classic", "wrong"],
      ["classic", "missed"],
      ["fog", "correct"],
      ["shop", "correct"],
      ["aghanim", "correct"],
    ]) {
      await check(
        `council visible result ${width} ${kind} ${outcome}`,
        { kind, mobile: width === 320, width, height: 568 },
        async (page) => {
          await page.send("Emulation.setDeviceMetricsOverride", {
            width,
            height: width === 320 ? 568 : 640,
            deviceScaleFactor: 1,
            mobile: width === 320,
          });
          if (outcome !== "missed") {
            const answer = journeyFixtures[kind].reveal.reveal;
            if (kind === "classic")
              await click(
                page,
                '[data-testid="arcade-answer"]',
                outcome === "correct" ? answer.correctIndex : (answer.correctIndex + 1) % 4,
              );
            else if (kind === "shop") await click(page, `[data-item-key="${answer.correctAnswerKey}"]`);
            else await click(page, `[data-hero-key="${answer.correctAnswerKey}"]`);
            await page.waitFor("window.__journey.submissions.length===1");
          }
          await page.evaluate("window.scrollTo(0,0)");
          const box = () =>
            page.evaluate(
              `(() => { const r=document.querySelector('fieldset').getBoundingClientRect();return {top:r.top}; })()`,
            );
          const before = await box();
          await finishRound(page);
          const after = await box();
          assert.ok(after.top <= before.top + 1, "Reveal compaction must not push the answer section farther down");
          const result = await page.evaluate(`(() => {
          const node=document.querySelector('[data-testid="round-result-summary"]'), r=node.getBoundingClientRect();
          return {text:node.textContent,top:r.top,bottom:r.bottom,height:innerHeight,timer:document.querySelector('[role="timer"]').getAttribute('aria-label'),crowdRepeated:!!document.querySelector('[data-testid="round-crowd-summary"],[data-testid="crowd-summary"]')};
        })()`);
          assert.match(result.text, outcome === "correct" ? /\+200 gold/ : /\+0 gold/);
          assert.ok(result.top >= 0 && result.bottom <= result.height, JSON.stringify(result));
          assert.match(result.timer, /until the next round/);
          assert.equal(result.crowdRepeated, false, "Public split belongs only in the Room split card");
        },
      );
    }
  }
  await check(
    "council stale deadline disables answers and shows connection status",
    { kind: "classic", mobile: true, width: 320, height: 568 },
    async (page) => {
      await changeRound(page, "window.__journey.blockRounds=true");
      await page.waitFor(`!!document.querySelector('[data-testid="round-connection-status"]')`, 10000);
      const top = await page.evaluate(
        `document.querySelector('[data-testid="round-connection-status"]').getBoundingClientRect().top`,
      );
      assert.ok(top >= 0 && top < 568);
      await page.waitFor(`document.querySelector('fieldset')?.disabled===true`, 20000);
      assert.equal(
        await page.evaluate(`document.querySelector('[data-testid="arcade-answer"]').matches(':disabled')`),
        true,
      );
      await changeRound(page, "window.__journey.blockRounds=false;window.__journey.phase='reveal'");
      await page.waitFor(`document.querySelector('main')?.dataset.phase==='reveal'`);
      assert.equal(await page.evaluate(`!!document.querySelector('[data-testid="round-connection-status"]')`), false);
    },
  );
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
