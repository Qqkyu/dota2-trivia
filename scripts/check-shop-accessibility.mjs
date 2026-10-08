#!/usr/bin/env node
import assert from "node:assert/strict";
import { journeyBrowser, fillInput, nativeKey } from "./lib/journey-browser.mjs";
import { delay } from "./lib/feedback-browser.mjs";
const browser = await journeyBrowser(process.env.APP_URL ?? "http://127.0.0.1:3330");
try {
  const page = await browser.setup({ kind: "recipe" });
  await fillInput(page, '[data-testid="shopkeeper-search-field"]', "gloves");
  await page.evaluate(`document.querySelector('[data-testid="shopkeeper-store-item"]').focus()`);
  await nativeKey(page, "Enter");
  await delay(200);
  assert.equal(await page.evaluate("document.activeElement?.dataset.testid"), "shopkeeper-search-field");
  assert.match(
    (await page.evaluate(`document.querySelector('[data-testid="shopkeeper-selection-status"]')?.textContent`)) ?? "",
    /Added Gloves of Haste\. 1 of 2 components selected\./,
  );
  await fillInput(page, '[data-testid="shopkeeper-search-field"]', "gloves");
  await nativeKey(page, "Tab");
  // Recipe remove controls precede filtered items in the tab order.
  for (
    let attempt = 0;
    attempt < 5 && !(await page.evaluate(`document.activeElement?.matches('[data-testid="shopkeeper-store-item"]')`));
    attempt++
  )
    await nativeKey(page, "Tab");
  assert.equal(await page.evaluate("document.activeElement?.dataset.testid"), "shopkeeper-store-item");
  await nativeKey(page, "Enter");
  await delay(200);
  assert.equal(await page.evaluate("document.activeElement?.dataset.testid"), "shopkeeper-recipe-build");
  assert.match(
    (await page.evaluate(`document.querySelector('[data-testid="shopkeeper-selection-status"]')?.textContent`)) ?? "",
    /2 of 2 components selected\./,
  );
  await nativeKey(page, "Enter");
  await page.waitFor("window.__journey.submissions.length===1");
  console.log("PASS recipe selection speech, search focus recovery, build focus, keyboard submission");
} finally {
  await browser.close();
}
