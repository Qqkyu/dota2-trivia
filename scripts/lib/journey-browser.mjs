import { readFile } from "node:fs/promises";
import { publicQuestionForRound } from "../../src/lib/public-question.mjs";
import { soundBrowser, delay } from "./feedback-browser.mjs";

const read = async (name) => JSON.parse(await readFile(new URL(`../../src/data/${name}.json`, import.meta.url)));
const [generated, shop, flash, order, aghanim, sound] = await Promise.all([
  read("questions.generated"),
  read("shopkeeper-questions"),
  read("flashback-questions"),
  read("value-order-questions"),
  read("aghanim-questions"),
  read("soundcheck-questions"),
]);
const examples = {
  classic: [generated.find((q) => q.kind === "mana-cost"), "trivia"],
  hero: [generated.find((q) => q.kind === "spell-owner"), "spell-link"],
  fog: [generated.find((q) => q.kind === "fogged-hero"), "fogged-vision"],
  echo: [generated.find((q) => q.kind === "hero-voice"), "echo-hunt"],
  quote: [generated.find((q) => q.kind === "hero-quote"), "quote-hunt"],
  aghanim: [aghanim[0], "aghanim-lab"],
  shop: [shop.find((q) => q.kind === "shopkeeper-build-result"), "shopkeeper"],
  recipe: [shop.find((q) => q.kind === "shopkeeper-real-recipe"), "shopkeeper"],
  freerecipe: [shop.find((q) => q.kind === "shopkeeper-real-recipe" && q.shopkeeper.recipeCost === 0), "shopkeeper"],
  shared: [shop.find((q) => q.kind === "shopkeeper-shared-part"), "shopkeeper"],
  upgrade: [shop.find((q) => q.kind === "shopkeeper-upgrade-path"), "shopkeeper"],
  year: [flash.find((q) => q.kind === "flashback-year"), "flashback"],
  flashchoice: [
    flash.filter((q) => q.kind === "flashback-choice").sort((a, b) => b.explanation.length - a.explanation.length)[0],
    "flashback",
  ],
  flashorder: [flash.find((q) => q.kind === "flashback-order"), "flashback"],
  order: [order[0], "order-up"],
  damageorder: [
    order.find((q) => q.id === "value-order:damage:07") ?? order.find((q) => q.kind === "value-order-damage"),
    "order-up",
  ],
  soundability: [sound.find((q) => q.kind === "soundcheck-ability"), "soundcheck"],
  sounditem: [sound.find((q) => q.kind === "soundcheck-item" && !q.id.includes("force_staff")), "soundcheck"],
};
export const journeyFixtures = Object.fromEntries(
  Object.entries(examples).map(([key, [question, game]]) => [
    key,
    Object.fromEntries(
      ["answering", "reveal", "laterClue"].map((phase) => [
        phase,
        publicQuestionForRound(
          question,
          {
            id: "fixture",
            game,
            phase: phase === "laterClue" ? "answering" : phase,
            answerDuration: 15000,
            answerDeadline: Date.now() + (phase === "laterClue" ? 5000 : 15000),
          },
          Date.now(),
        ),
      ]),
    ),
  ]),
);

export async function journeyBrowser(appUrl) {
  const browser = await soundBrowser();
  async function setup(options = {}) {
    const { page } = await browser.newPage();
    if (options.mobile) {
      await page.send("Emulation.setDeviceMetricsOverride", {
        width: options.width ?? 390,
        height: options.height ?? 844,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    }
    if (options.real) {
      await page.send("Network.setBlockedURLs", { urls: [] });
      if (options.cookie)
        await page.send("Network.setCookie", { name: "queue_arcade_session", value: options.cookie, url: appUrl });
      await page.send("Page.navigate", { url: appUrl + (options.path || "/") });
      await page.waitFor(`document.readyState==='complete' && !!document.querySelector('main')`, 20000);
      return page;
    }
    await page.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
      const fixtures = ${JSON.stringify(journeyFixtures)};
      const options = ${JSON.stringify(options)};
      const state = window.__journey = {kind:options.kind || 'classic', authenticated:options.connected || false, holdProfile:options.holdProfile||false, omitIdentity:options.omitIdentity||false, number:0, phase:'answering', votes:new Map(), submissions:[], reports:[], calls:[], roundFailures:0, voteFailures:0, blockRounds:false, waiting:true, isHost:true, name:'Journey player', messages:[], heldParty:options.holdParty || null,heldPartyBody:options.holdPartyBody || null};
      const roomId = 'dota2:journey-fixture:public';
      const idFor = number => roomId + ':round:' + number;
      const response = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
      const party = () => ({waiting:state.waiting,countdownMs:0,privateRoom:{code:'JOURNEY',games:['trivia'],formats:[],startedAt:state.waiting?null:1000,isHost:state.isHost,players:[{name:state.name,host:state.isHost,self:true,away:false,score:0},{name:'Second player',host:!state.isHost,self:false,away:false,score:0}],messages:state.messages},presence:{activePlayers:2}});
      const identityFor = guest => state.authenticated ? {kind:'account',id:'journey-account'} : {kind:'guest',id:guest};
      const sameIdentity = (a,b) => a?.kind===b?.kind && a?.id===b?.id;
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init = {}) => {
        const url = new URL(typeof input === 'string' ? input : input.url,location.href);
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
        state.calls.push({path:url.pathname,method:init.method || 'GET',body});
        if (url.pathname === '/api/me') {const payload=state.authenticated ? {authenticated:true,profile:{user:{id:'journey-account',steamId:'76561198000000011',displayName:'Journey account',avatarUrl:null,profileUrl:'',createdAt:0},stats:{answered:0,correct:0,accuracy:0,currentStreak:0,bestStreak:0,bestTenCorrect:null,firstStageCorrect:0,progressiveCorrect:0,progressiveAnswered:0,formats:[],recentRounds:[]}}} : {authenticated:false}; if(state.holdProfile){state.holdProfile=false;await new Promise(resolve=>state.releaseProfile=resolve);} return response(payload);}
        if (url.pathname === '/api/rounds') {
          if(state.blockRounds) throw new TypeError('Failed to fetch');
          if(state.roundFailures-- > 0) return response({error:'Temporary failure'},503);
          const boot = state.number===0;
          const number = state.number;
          if(boot) state.number=1;
          const phase = boot?'reveal':state.phase;
          const now=Date.now(),id=idFor(number),question={...fixtures[state.kind][phase==='answering'&&state.laterClue?'laterClue':phase],id};
          const identity=identityFor(url.searchParams.get('playerId'));
          const stored=state.votes.get(id+'|'+identity.kind+':'+identity.id);
          const counts=[0,0,0,0];
          if(stored && stored.vote.answerIndex>=0) counts[stored.vote.answerIndex]=1;
          const previousResults=[...state.votes.entries()].filter(([,result])=>result.roundId!==id&&sameIdentity(result.identity,identity)).map(([,result])=>({roundId:result.roundId,correct:result.correct,points:result.correct?200:0,game:fixtures[result.kind].answering.game,category:fixtures[result.kind].answering.category}));
          const payload={playerIdentity:state.omitIdentity?null:identity,serverNow:now,room:{id:roomId,gameId:'dota2',contentVersion:'fixture',mode:'mixed',filter:'Mixed'},round:{id,number,game:question.game,phase,startedAt:now,answerDeadline:now+15000,revealDeadline:now+(boot?80:22000),answerDuration:15000},questionRevision:id+':'+state.kind+':'+phase+':'+question.clueStage,question,presence:{activePlayers:2},crowd:{counts:phase==='reveal'?counts:[0,0,0,0],total:stored?1:0,keyCounts:phase==='reveal'&&stored?.vote.answerKey?[{answerKey:stored.vote.answerKey,count:1}]:[],scoreSummary:phase==='reveal'?{correctCount:stored?.correct?1:0,average:stored?.correct?200:0,best:stored?.correct?200:0,playerPoints:stored?.correct?200:0}:null},playerVote:stored?.vote??null,playerReport:null,previousResults};
          if(state.holdRound) {state.holdRound=false; return new Promise(resolve=>state.releaseRound=()=>resolve(response(payload)));}
          return response(payload);
        }
        if(url.pathname === '/api/votes') {
          state.submissions.push(body);
          const identity=identityFor(body.voterId);
          if(state.voteFailures-- > 0) return response({error:'Temporary failure'},503);
          const answer=fixtures[state.kind].reveal.reveal;
          const correct=body.answerKey?body.answerKey===answer.correctAnswerKey:body.answerIndex===answer.correctIndex;
          const vote={answerIndex:body.answerIndex,...(body.answerKey?{answerKey:body.answerKey}:{}),submittedAt:Date.now()};
          state.votes.set(body.roundId+'|'+identity.kind+':'+identity.id,{roundId:body.roundId,vote,correct,kind:state.kind,identity});
          if(state.holdVote) {state.holdVote=false; await new Promise(resolve=>state.releaseVote=resolve);}
          if(state.failHeldVote){state.failHeldVote=false;throw new TypeError('Failed to fetch');}
          return response({playerIdentity:state.omitIdentity?null:identity,accepted:true,playerVote:vote,counts:[0,0,0,0],total:1,keyCounts:[],scoreSummary:null});
        }
        if(url.pathname === '/api/reports') {state.reports.push(body); return response({accepted:true,reason:body.reason});}
        if(url.pathname === '/api/private-rooms') {
          if(url.searchParams.has('peek')) return response({error:'Unknown private room'},404);
          if(body.action==='rename') state.name=body.name;
          const payload=party();
          if(state.heldPartyBody && ((!body.action&&state.heldPartyBody==='create') || body.action===state.heldPartyBody)) {state.heldPartyBody=null; return new Response(new ReadableStream({start(){}}),{headers:{'Content-Type':'application/json'}});}
          if(state.heldParty && ((!body.action&&state.heldParty==='create') || body.action===state.heldParty)) {state.heldParty=null; return new Promise(resolve=>state.releaseParty=()=>resolve(response(payload)));}
          return response(payload);
        }
        if(url.pathname === '/api/private-rooms/start') {state.waiting=false; return response(party());}
        if(url.pathname === '/api/private-rooms/messages') {state.messages.push({id:String(state.messages.length+1),name:state.name,text:body.text,at:Date.now()});return response(party());}
        if(url.pathname.startsWith('/api/')) return response({ok:true,activePlayers:2});
        return originalFetch(input,init);
      };
    })();`,
    });
    await page.send("Page.navigate", { url: appUrl + (options.path || "/play") });
    await page.waitFor(`document.querySelector('main')?.dataset.clientReady === 'true'`, 20000);
    if (!options.path) await page.waitFor(`document.querySelector('main')?.dataset.phase === 'answering'`, 20000);
    return page;
  }
  return { ...browser, setup };
}

export async function fillInput(page, selector, value) {
  await page.evaluate(
    `(() => {const input=document.querySelector(${JSON.stringify(selector)}); if(!input) throw new Error('Missing input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
}

export async function nativeKey(page, key, modifiers = 0) {
  const code =
    key === " "
      ? "Space"
      : key.length === 1
        ? key >= "0" && key <= "9"
          ? "Digit" + key
          : "Key" + key.toUpperCase()
        : key;
  const windowsVirtualKeyCode =
    { Enter: 13, Tab: 9, Escape: 27, Backspace: 8, ArrowLeft: 37, ArrowRight: 39, " ": 32 }[key] ??
    key.toUpperCase().charCodeAt(0);
  const params = { key, code, windowsVirtualKeyCode, modifiers };
  await page.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    ...params,
    ...(key === "Enter" ? { text: "\r" } : key.length === 1 && !modifiers ? { text: key } : {}),
  });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", ...params });
}

export async function tap(page, selector, index = 0) {
  const point = await page.evaluate(
    `(() => {const node=document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if(!node || node.disabled) throw new Error('Missing enabled touch control: '+${JSON.stringify(selector)}); node.scrollIntoView({block:'center'}); const box=node.getBoundingClientRect();return{x:box.x+box.width/2,y:box.y+box.height/2};})()`,
  );
  await page.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...point, id: 1, radiusX: 1, radiusY: 1, force: 1 }],
  });
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await delay(30);
}

export async function changeRound(page, expression) {
  await page.evaluate(`${expression};window.dispatchEvent(new Event('focus'));`);
  await delay(100);
}

export async function touchRange(page, selector, target) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const slider = await page.evaluate(
      `(() => {const node=document.querySelector(${JSON.stringify(selector)});node.scrollIntoView({block:'center'});const bounds=node.getBoundingClientRect();return{left:bounds.left,width:bounds.width,y:bounds.top+bounds.height/2,min:Number(node.min),max:Number(node.max),value:Number(node.value)};})()`,
    );
    if (slider.value === target) {
      // Chromium's native range suppresses compatibility clicks briefly after a drag,
      // including on a plain HTML page. Let that gesture end before the next tap.
      await delay(350);
      return;
    }
    const x = (value) => slider.left + 8 + ((slider.width - 16) * (value - slider.min)) / (slider.max - slider.min);
    await page.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: x(slider.value), y: slider.y, id: 1, radiusX: 1, radiusY: 1, force: 1 }],
    });
    for (let step = 1; step <= 6; step += 1) {
      await delay(25);
      await page.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: x(slider.value + ((target - slider.value) * step) / 6),
            y: slider.y,
            id: 1,
            radiusX: 1,
            radiusY: 1,
            force: 1,
          },
        ],
      });
    }
    await delay(60);
    await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await delay(50);
  }
  const actual = await page.evaluate(`Number(document.querySelector(${JSON.stringify(selector)}).value)`);
  if (actual !== target) throw new Error(`Touch range selected ${actual}, expected ${target}`);
  await delay(350);
}
