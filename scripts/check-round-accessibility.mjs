#!/usr/bin/env node
// Exercise live round transitions in the real page with local API fixtures.
import assert from "node:assert/strict";
import { journeyBrowser, changeRound, nativeKey } from "./lib/journey-browser.mjs";
import { delay } from "./lib/feedback-browser.mjs";

const browser = await journeyBrowser(process.env.APP_URL ?? "http://127.0.0.1:3330");
try {
  const page = await browser.setup({ kind: "classic" });
  const announcement = `[data-testid="round-announcement"]`;
  const initial = await page.evaluate(`document.querySelector('${announcement}')?.textContent`);
  assert.match(initial ?? "", /Round 1\..*How much mana does Acid Spray cost\?/);
  await page.evaluate(
    `window.__roundAnnouncements=[];new MutationObserver(()=>window.__roundAnnouncements.push(document.querySelector('${announcement}').textContent)).observe(document.querySelector('${announcement}'),{childList:true,subtree:true,characterData:true});document.querySelector('[data-testid="arcade-answer"]').focus()`,
  );
  await nativeKey(page, "Enter");
  await page.waitFor("window.__journey.submissions.length===1");
  await changeRound(page, "window.__journey.phase='reveal'");
  await page.waitFor("document.querySelector('main').dataset.phase==='reveal'");
  await changeRound(page, "window.__journey.number+=1;window.__journey.kind='year';window.__journey.phase='answering'");
  await page.waitFor("document.querySelector('main').dataset.phase==='answering'");
  await delay(300);
  assert.match(
    await page.evaluate(`document.querySelector('${announcement}').textContent`),
    /Round 2\..*What year did Dota 2 officially release\?/,
  );
  assert.equal(await page.evaluate("document.activeElement?.dataset.testid"), "round-heading");
  await page.evaluate("window.dispatchEvent(new Event('focus'))");
  await delay(700);
  assert.equal(
    await page.evaluate("window.__roundAnnouncements.filter(Boolean).length"),
    1,
    "Announce each round once, without timer or poll repeats",
  );
  await nativeKey(page, "Tab");
  assert.equal(await page.evaluate("document.activeElement?.dataset.testid"), "flashback-year-slider");
  // A control outside the round stays focused when another round starts.
  await page.evaluate("document.querySelector('[data-testid=game-volume]').focus()");
  await changeRound(page, "window.__journey.number+=1");
  await delay(300);
  assert.equal(await page.evaluate("document.activeElement?.dataset.testid"), "game-volume");
  console.log("PASS round announcement, one update, lost answer focus recovery, next Tab, external focus retention");
} finally {
  await browser.close();
}
