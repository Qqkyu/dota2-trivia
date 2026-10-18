#!/usr/bin/env node

// Render snapshot for refactors. Captures the DOM tree, attributes, text, boxes,
// and computed styles of every arcade view over fixture rounds, then compares two
// captures. A pure refactor must produce an empty diff.
//
//   APP_URL=http://127.0.0.1:3400 node scripts/check-render-snapshot.mjs --write /tmp/snap-before
//   APP_URL=http://127.0.0.1:3400 node scripts/check-render-snapshot.mjs --compare /tmp/snap-before
//
// SNAPSHOT_KINDS and SNAPSHOT_VIEWPORTS filter scenarios (comma separated).
// Timer digits, inline timer transforms, and animations are masked because they
// depend on wall-clock time. Everything else must match exactly.

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { changeRound, journeyBrowser, journeyFixtures } from "./lib/journey-browser.mjs";
import { delay } from "./lib/feedback-browser.mjs";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const writeDir = option("--write");
const compareDir = option("--compare");
if (!writeDir && !compareDir) {
  console.error("Usage: check-render-snapshot.mjs --write <dir> | --compare <dir> [--write <dir>]");
  process.exit(2);
}
const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const kinds = process.env.SNAPSHOT_KINDS?.split(",") ?? Object.keys(journeyFixtures);
const viewports = (process.env.SNAPSHOT_VIEWPORTS?.split(",") ?? ["desktop", "mobile"]).map((name) => ({
  name,
  width: name === "mobile" ? 390 : 1280,
  height: name === "mobile" ? 844 : 900,
  mobile: name === "mobile",
}));

// Boxes already capture layout, so shorthands whose computed text flips between
// "auto" and resolved pixels (margin, inset) are left out.
const STYLE_PROPS = [
  "display",
  "position",
  "width",
  "height",
  "min-width",
  "max-width",
  "min-height",
  "max-height",
  "aspect-ratio",
  "padding",
  "border",
  "border-radius",
  "outline",
  "gap",
  "flex",
  "flex-direction",
  "flex-wrap",
  "align-items",
  "justify-content",
  "align-self",
  "order",
  "grid-template-columns",
  "grid-template-rows",
  "grid-column",
  "grid-row",
  "place-items",
  "font",
  "letter-spacing",
  "text-transform",
  "text-align",
  "text-decoration",
  "white-space",
  "color",
  "background-color",
  "background-image",
  "opacity",
  "transform",
  "box-shadow",
  "text-shadow",
  "filter",
  "backdrop-filter",
  "mix-blend-mode",
  "mask-image",
  "clip-path",
  "visibility",
  "overflow",
  "z-index",
  "object-fit",
  "cursor",
  "pointer-events",
];

const CAPTURE = `(() => {
  const PROPS = ${JSON.stringify(STYLE_PROPS)};
  const WIDTH_PROPS = new Set(["width", "min-width", "max-width", "flex"]);
  const NOISY_ATTRS = new Set(["data-testid", "data-round-id", "data-room-id", "style", "class", "src", "srcset", "href", "id", "for", "aria-describedby", "aria-controls"]);
  const mask = (text) => text.replace(/\\s+/g, " ").replace(/\\d+/g, "#").trim().slice(0, 120);
  const out = [];
  const record = (el, path, parent) => {
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const attrs = {};
    for (const attr of el.attributes) {
      if (NOISY_ATTRS.has(attr.name)) continue;
      attrs[attr.name] = mask(attr.value);
    }
    const rawText = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ");
    const styles = PROPS.map((prop) => {
      if (prop === "transform" && el.style.transform) return "inline";
      return cs.getPropertyValue(prop);
    });
    out.push({
      p: path,
      parent,
      t: el.tagName.toLowerCase(),
      id: el.dataset.testid ?? null,
      a: attrs,
      x: mask(rawText),
      b: [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)],
      s: styles,
      // Digits (timers, gold, seconds left) change width with wall-clock time, so
      // such elements and their flex siblings keep styles but not widths or boxes.
      dynamic: /\\d/.test(rawText) || Boolean(el.style.transform),
    });
    const children = Array.from(el.children);
    const groups = new Map();
    children.forEach((child, index) => {
      const key = child.tagName + "|" + (child.dataset.testid ?? "") + "|" + (child.getAttribute("role") ?? "");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(index);
    });
    const keep = new Set();
    for (const indexes of groups.values()) {
      if (indexes.length <= 8) indexes.forEach((i) => keep.add(i));
      else [...indexes.slice(0, 4), ...indexes.slice(-2)].forEach((i) => keep.add(i));
    }
    children.forEach((child, index) => {
      if (keep.has(index)) record(child, path + "/" + index + child.tagName.toLowerCase(), path);
    });
  };
  const main = document.querySelector("main");
  if (!main) return { error: "no main" };
  record(main, "main", null);
  const dynamicParents = new Set(out.filter((node) => node.dynamic).map((node) => node.parent));
  const nodes = out.map((node) => {
    const unstable = node.dynamic || dynamicParents.has(node.parent);
    return {
      p: node.p,
      t: node.t,
      id: node.id,
      a: node.a,
      x: node.x,
      b: unstable ? null : node.b,
      s: node.s.map((value, index) => (unstable && WIDTH_PROPS.has(PROPS[index]) ? "~" : value)).join("|"),
    };
  });
  return { phase: main.dataset.phase ?? null, nodes };
})()`;

const FREEZE_STYLE = `(() => {
  const style = document.createElement("style");
  style.id = "render-snapshot-freeze";
  style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}";
  document.head.appendChild(style);
})()`;

const LOCK_PICK = `(async () => {
  const enabled = (selector) => Array.from(document.querySelectorAll(selector)).filter((el) => !el.disabled);
  const answers = enabled('[data-testid="arcade-answer"]');
  if (answers.length) { answers[0].click(); return "choice"; }
  const heroes = enabled('[data-testid="hero-picker-hero"]');
  if (heroes.length) { heroes[0].click(); return "hero"; }
  const builder = document.querySelector('[data-testid="shopkeeper-recipe-builder"]');
  if (builder) {
    const size = Number(builder.dataset.recipeSize);
    for (let i = 0; i < size; i += 1) {
      const items = enabled('[data-testid="shopkeeper-store-item"]');
      if (!items.length) break;
      items[Math.min(i, items.length - 1)].click();
      await new Promise((r) => setTimeout(r, 40));
    }
    document.querySelector('[data-testid="shopkeeper-recipe-build"]')?.click();
    return "recipe";
  }
  const items = enabled('[data-testid="shopkeeper-store-item"]');
  if (items.length) { items[0].click(); return "item"; }
  for (const selector of ['[data-testid="value-order-card"]', '[data-testid="flashback-order-card"]']) {
    const cards = enabled(selector);
    if (cards.length >= 4) {
      for (const card of cards.slice(0, 4)) { card.click(); await new Promise((r) => setTimeout(r, 40)); }
      return "order";
    }
  }
  const lock = document.querySelector('[data-testid="flashback-year-lock"]');
  if (lock && !lock.disabled) { lock.click(); return "year"; }
  return "none";
})()`;

async function settle(page) {
  await page.evaluate("document.fonts.ready.then(() => true)");
  await page.waitFor("Array.from(document.images).every((image) => image.complete)", 8_000).catch(() => undefined);
  await delay(250);
}

async function capture(page) {
  await page.evaluate(FREEZE_STYLE);
  await settle(page);
  return page.evaluate(CAPTURE);
}

async function roundCall(page, previousCalls) {
  await page.waitFor(
    `window.__journey.calls.filter((call) => call.path === '/api/rounds').length > ${previousCalls}`,
    5_000,
  );
  await delay(300);
}

function roundCalls(page) {
  return page.evaluate("window.__journey.calls.filter((call) => call.path === '/api/rounds').length");
}

const scenarios = [];
for (const viewport of viewports) {
  scenarios.push({ name: `lobby-${viewport.name}`, viewport, path: "/" });
  scenarios.push({ name: `party-${viewport.name}`, viewport, path: "/party" });
  for (const kind of kinds) scenarios.push({ name: `${kind}-${viewport.name}`, viewport, kind });
}

const browser = await journeyBrowser(appUrl);
const results = {};
try {
  for (const scenario of scenarios) {
    const page = await browser.setup({
      ...(scenario.path ? { path: scenario.path } : { kind: scenario.kind }),
      mobile: scenario.viewport.mobile,
      width: scenario.viewport.width,
      height: scenario.viewport.height,
    });
    if (!scenario.viewport.mobile) {
      await page.send("Emulation.setDeviceMetricsOverride", {
        width: scenario.viewport.width,
        height: scenario.viewport.height,
        deviceScaleFactor: 1,
        mobile: false,
      });
    }
    if (scenario.path) {
      results[`${scenario.name}`] = await capture(page);
    } else {
      results[`${scenario.name}-answering`] = await capture(page);
      let calls = await roundCalls(page);
      await changeRound(page, "window.__journey.laterClue = true");
      await roundCall(page, calls);
      results[`${scenario.name}-laterclue`] = await capture(page);
      const picked = await page.evaluate(LOCK_PICK);
      if (picked !== "none") {
        await page.waitFor("window.__journey.submissions.length >= 1", 5_000).catch(() => undefined);
        await delay(300);
      }
      results[`${scenario.name}-locked`] = await capture(page);
      calls = await roundCalls(page);
      await changeRound(page, "window.__journey.phase = 'reveal'");
      await page.waitFor("document.querySelector('main')?.dataset.phase === 'reveal'", 5_000);
      await roundCall(page, calls).catch(() => undefined);
      results[`${scenario.name}-reveal`] = await capture(page);
    }
    await page.send("Page.navigate", { url: "about:blank" });
    console.log(`captured ${scenario.name}`);
  }
} finally {
  await browser.close();
}

if (writeDir) {
  await mkdir(writeDir, { recursive: true });
  for (const [name, result] of Object.entries(results)) {
    await writeFile(join(writeDir, `${name}.json`), JSON.stringify(result));
  }
  console.log(`wrote ${Object.keys(results).length} snapshots to ${writeDir}`);
}

if (compareDir) {
  const baselineNames = (await readdir(compareDir)).filter((file) => file.endsWith(".json"));
  const differences = [];
  const seen = new Set();
  for (const file of baselineNames) {
    const name = file.slice(0, -5);
    seen.add(name);
    const current = results[name];
    if (!current) {
      differences.push(`${name}: missing in current run`);
      continue;
    }
    const baseline = JSON.parse(await readFile(join(compareDir, file), "utf8"));
    const byPath = new Map(current.nodes.map((node) => [node.p, node]));
    for (const node of baseline.nodes) {
      const other = byPath.get(node.p);
      if (!other) {
        differences.push(`${name}: ${node.p} <${node.t}${node.id ? ` ${node.id}` : ""}> removed`);
        continue;
      }
      byPath.delete(node.p);
      const label = `${name}: ${node.p} <${node.t}${node.id ? ` ${node.id}` : ""}>`;
      if (node.t !== other.t) differences.push(`${label} tag ${node.t} -> ${other.t}`);
      if (node.id !== other.id) differences.push(`${label} testid ${node.id} -> ${other.id}`);
      if (node.x !== other.x) differences.push(`${label} text "${node.x}" -> "${other.x}"`);
      if (JSON.stringify(node.a) !== JSON.stringify(other.a))
        differences.push(`${label} attrs ${JSON.stringify(node.a)} -> ${JSON.stringify(other.a)}`);
      if (String(node.b) !== String(other.b)) differences.push(`${label} box ${String(node.b)} -> ${String(other.b)}`);
      if (node.s !== other.s) {
        const before = node.s.split("|");
        const after = other.s.split("|");
        const changed = STYLE_PROPS.filter((_, index) => before[index] !== after[index]).map(
          (prop) => `${prop}: ${before[STYLE_PROPS.indexOf(prop)]} -> ${after[STYLE_PROPS.indexOf(prop)]}`,
        );
        differences.push(`${label} styles ${changed.join("; ")}`);
      }
    }
    for (const node of byPath.values()) {
      differences.push(`${name}: ${node.p} <${node.t}${node.id ? ` ${node.id}` : ""}> added`);
    }
  }
  for (const name of Object.keys(results)) if (!seen.has(name)) differences.push(`${name}: missing in baseline`);
  if (differences.length) {
    console.error(`${differences.length} render differences against ${compareDir}:`);
    for (const line of differences.slice(0, 80)) console.error(`  ${line}`);
    if (differences.length > 80) console.error(`  ... ${differences.length - 80} more`);
    process.exit(1);
  }
  console.log(`Render snapshot matches ${compareDir}: ${baselineNames.length} views, no differences.`);
}
