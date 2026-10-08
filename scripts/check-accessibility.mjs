#!/usr/bin/env node

/**
 * Audit rendered pages and every answer format in an isolated browser context.
 * Supply PLAYWRIGHT_MODULE and AXE_SOURCE when these tools are not installed in
 * the repository. BROWSER_EXECUTABLE selects a locally installed browser.
 * APP_URL points to an isolated app server. API responses for round fixtures,
 * votes, sessions, and reports are local test data and never reach storage.
 * Reflow modes use the CSS viewport and device scale for 200% and 400% zoom.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { publicQuestionForRound } from "../src/lib/public-question.mjs";

const require = createRequire(import.meta.url);
const playwrightModule = process.env.PLAYWRIGHT_MODULE;
const playwright = await import(playwrightModule ? pathToFileURL(playwrightModule).href : "playwright");
const axeSource = process.env.AXE_SOURCE ?? require.resolve("axe-core/axe.min.js");
const appUrl = process.env.APP_URL ?? "http://127.0.0.1:3310";
const engine = process.env.BROWSER_ENGINE ?? "chromium";
const runName = process.env.A11Y_RUN_NAME ?? engine;
const outputDir = process.env.A11Y_OUTPUT_DIR ?? "/tmp/queue-arcade-deep-review/accessibility";
const requestedModes = (process.env.A11Y_MODES ?? "desktop,mobile,zoom200,zoom400,reduced,forced")
  .split(",")
  .filter(Boolean);
const fixtureModes = process.env.A11Y_FIXTURE_MODES?.split(",").filter(Boolean) ?? requestedModes;
const fixtureNames = process.env.A11Y_FIXTURES?.split(",").filter(Boolean);
const timeoutMs = Number(process.env.A11Y_TIMEOUT_MS ?? 45000);
const modes = {
  desktop: { viewport: { width: 1280, height: 900 } },
  mobile: {
    viewport: { width: 320, height: 640 },
    hasTouch: true,
    ...(engine === "firefox" ? {} : { isMobile: true }),
  },
  zoom200: { viewport: { width: 640, height: 450 }, deviceScaleFactor: 2 },
  zoom400: { viewport: { width: 320, height: 225 }, deviceScaleFactor: 4 },
  reduced: { viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" },
  forced: { viewport: { width: 1280, height: 900 }, forcedColors: "active" },
};
const results = {
  appUrl,
  engine,
  runName,
  buildId: process.env.A11Y_BUILD_ID ?? null,
  startedAt: new Date().toISOString(),
  completed: false,
  requestedModes,
  fixtureModes,
  reviewerFixture: Boolean(process.env.A11Y_REVIEWER_COOKIE),
  version: null,
  pages: [],
  fixtures: [],
  keyboard: [],
  failures: [],
};
await mkdir(outputDir, { recursive: true });
const datasets = {};
for (const name of [
  "questions.generated",
  "shopkeeper-questions",
  "aghanim-questions",
  "soundcheck-questions",
  "value-order-questions",
  "flashback-questions",
]) {
  datasets[name] = JSON.parse(await readFile(path.join("src/data", `${name}.json`), "utf8"));
}
const choices = [
  ["classic-ability", "trivia", "questions.generated", "mana-cost"],
  ["classic-hero", "trivia", "questions.generated", "hero-move-speed"],
  ["classic-item", "trivia", "questions.generated", "item-cost"],
  ["shop-recipe", "shopkeeper", "shopkeeper-questions", "shopkeeper-real-recipe"],
  ["shop-build", "shopkeeper", "shopkeeper-questions", "shopkeeper-build-result"],
  ["shop-path", "shopkeeper", "shopkeeper-questions", "shopkeeper-upgrade-path"],
  ["spell-link", "spell-link", "questions.generated", "spell-owner"],
  ["fogged-vision", "fogged-vision", "questions.generated", "fogged-hero"],
  ["echo-hunt", "echo-hunt", "questions.generated", "hero-voice"],
  ["quote-hunt", "quote-hunt", "questions.generated", "hero-quote"],
  ["aghanim", "aghanim-lab", "aghanim-questions", "aghanim-upgrade"],
  ["soundcheck", "soundcheck", "soundcheck-questions", "soundcheck-ability"],
  ["order-up", "order-up", "value-order-questions", "value-order-item"],
  ["flashback-year", "flashback", "flashback-questions", "flashback-year"],
  ["flashback-choice", "flashback", "flashback-questions", "flashback-choice"],
  ["flashback-order", "flashback", "flashback-questions", "flashback-order"],
];
const fixtures = choices.map(([name, game, dataset, kind]) => {
  const raw = datasets[dataset].find((question) => question.kind === kind);
  if (!raw) throw new Error(`Missing fixture ${name}: ${kind}`);
  return { name, game, raw };
});
const browser = await playwright[engine].launch({
  executablePath: process.env.BROWSER_EXECUTABLE || undefined,
  headless: true,
  args: engine === "chromium" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
});
results.version = browser.version();
const save = () => writeFile(path.join(outputDir, `${runName}.json`), JSON.stringify(results, null, 2));

async function makePage(mode) {
  const context = await browser.newContext(modes[mode]);
  context.setDefaultTimeout(timeoutMs);
  context.setDefaultNavigationTimeout(timeoutMs);
  if (process.env.A11Y_REVIEWER_COOKIE) {
    await context.addCookies([{ name: "queue_arcade_session", value: process.env.A11Y_REVIEWER_COOKIE, url: appUrl }]);
  }
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("queue-arcade:settings:v3", JSON.stringify({ soundEnabled: false, gameVolume: 0.7 }));
  });
  for (const routePath of ["sessions", "reports", "diagnostics"]) {
    await page.route(`**/api/${routePath}`, (route) => route.fulfill({ json: { accepted: true } }));
  }
  if (!process.env.A11Y_REVIEWER_COOKIE) {
    await page.route("**/api/me", (route) => route.fulfill({ json: { authenticated: false, steamAvailable: false } }));
  }
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  return { context, page, errors };
}

async function fixturePage(fixture, mode) {
  const session = await makePage(mode);
  const { page } = session;
  const state = { served: 0, gate: true, phase: "answering", number: 1, vote: null, votes: [] };
  await page.route("**/api/rounds?*", async (route) => {
    const now = Date.now();
    const gate = state.gate;
    state.served += 1;
    const round = {
      id: gate ? "a11y-gate" : `a11y-${fixture.name}-${state.number}`,
      number: state.number,
      game: gate ? "trivia" : fixture.game,
      phase: gate ? "reveal" : state.phase,
      startedAt: now - 1000,
      answerDeadline: gate || state.phase === "reveal" ? now - 1000 : now + 60000,
      revealDeadline: gate ? now + 100 : now + 67000,
      answerDuration: 15000,
    };
    const question = gate
      ? null
      : {
          ...publicQuestionForRound(
            fixture.raw,
            { ...round, answerDeadline: state.phase === "reveal" ? now - 1000 : now + 14000 },
            now,
          ),
          id: round.id,
          game: fixture.game,
        };
    if (question?.image?.src?.startsWith("/api/round-image")) question.image.src = fixture.raw.image.src;
    await route.fulfill({
      json: {
        serverNow: now,
        room: { id: "a11y-room", gameId: "dota2", contentVersion: "a11y", mode: "mixed", filter: "Mixed" },
        round,
        questionRevision: `${round.id}:${round.phase}`,
        question,
        presence: { activePlayers: 1 },
        crowd: { counts: [0, 0, 0, 0], total: 0, keyCounts: [], scoreSummary: null },
        playerVote: state.vote,
        playerReport: null,
        previousResults: [],
      },
    });
  });
  await page.route("**/api/votes", async (route) => {
    const vote = route.request().postDataJSON();
    state.votes.push(vote);
    state.vote = { answerIndex: vote.answerIndex, answerKey: vote.answerKey, submittedAt: Date.now() };
    await route.fulfill({
      json: {
        accepted: true,
        counts: [0, 0, 0, 0],
        total: 1,
        keyCounts: [],
        scoreSummary: null,
        playerVote: state.vote,
      },
    });
  });
  await page.goto(`${appUrl}/play`, { waitUntil: "domcontentloaded" });
  try {
    // Account initialization can cancel an early request. Advance only after
    // the app has accepted the entry round, rather than counting requests.
    await page.waitForSelector('main[data-phase="waiting"][data-round-id="a11y-gate"]', { timeout: timeoutMs });
    state.gate = false;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForSelector(`main[data-phase="answering"][data-round-id="a11y-${fixture.name}-1"]`, {
      timeout: timeoutMs,
    });
  } catch (error) {
    const screenshot = path.join(outputDir, `${runName}-${mode}-${fixture.name}-startup-failure.png`);
    await page.screenshot({ path: screenshot, scale: "css", timeout: 10000 }).catch(() => {});
    const stateOnFailure = await page
      .evaluate(() => ({
        mains: [...document.querySelectorAll("main")].map((node) => ({ ...node.dataset })),
        text: document.body.innerText.slice(0, 1600),
      }))
      .catch(() => null);
    results.fixtureStartupFailures ??= [];
    results.fixtureStartupFailures.push({
      name: fixture.name,
      mode,
      served: state.served,
      stateOnFailure,
      screenshot,
      errors: session.errors,
    });
    results.failures.push(`${mode}-${fixture.name}: fixture startup failed`);
    await save();
    throw error;
  }
  return { ...session, state };
}

async function inspect(page, label, errors, mode) {
  await page.addScriptTag({ path: axeSource });
  const axeReport = await page.evaluate(async () => {
    const report = await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"] },
    });
    const compact = (rule) => ({
      id: rule.id,
      impact: rule.impact,
      help: rule.help,
      helpUrl: rule.helpUrl,
      nodes: rule.nodes.map((node) => ({ target: node.target, html: node.html, summary: node.failureSummary })),
    });
    return { violations: report.violations.map(compact), incomplete: report.incomplete.map(compact) };
  });
  const axe = axeReport.violations;
  const geometry = await page.evaluate(() => {
    const visible = (node) =>
      node.getClientRects().length && getComputedStyle(node).visibility !== "hidden" && !node.closest("[inert]");
    const controls = [...document.querySelectorAll("button,a[href],input,select,textarea")].filter(
      (node) => visible(node) && !node.disabled,
    );
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      scrollWidth: document.documentElement.scrollWidth,
      smallTargets: controls
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            name: node.getAttribute("aria-label") || node.textContent.trim().slice(0, 80),
            testid: node.dataset.testid,
            width: rect.width,
            height: rect.height,
          };
        })
        .filter((node) => node.width < 24 || node.height < 24),
      inputs: [...document.querySelectorAll("input")].filter(visible).map((node) => ({
        testid: node.dataset.testid,
        type: node.type,
        name: node.getAttribute("aria-label") || [...node.labels].map((label) => label.innerText).join(" "),
        placeholder: node.placeholder,
      })),
      timers: [...document.querySelectorAll('[role="timer"]')].map((node) => ({
        label: node.getAttribute("aria-label"),
        live: node.getAttribute("aria-live"),
      })),
      activeAnimations: document
        .getAnimations()
        .filter((animation) => animation.playState === "running")
        .map((animation) => ({
          target: animation.effect?.target?.className,
          duration: animation.effect?.getTiming().duration,
          iterations: animation.effect?.getTiming().iterations,
        })),
      forcedColors: matchMedia("(forced-colors: active)").matches,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  });
  const screenshot = path.join(outputDir, `${runName}-${label}.png`);
  // Capture CSS pixels so long pages at 400% reflow stay below browser image
  // dimension limits. Layout and device-scale measurements remain unchanged.
  await page.screenshot({ path: screenshot, fullPage: true, scale: "css" });
  if (geometry.scrollWidth > modes[mode].viewport.width + 2) results.failures.push(`${label}: horizontal overflow`);
  for (const rule of axe)
    if (["critical", "serious"].includes(rule.impact) && !(mode === "forced" && rule.id === "color-contrast")) {
      // Axe uses authored colors here, although forced-color painting replaces
      // them. Keep its raw output and inspect those screenshots separately.
      results.failures.push(`${label}: ${rule.id}`);
    }
  if (errors.length) results.failures.push(`${label}: browser error`);
  if (mode === "forced" && !geometry.forcedColors)
    results.failures.push(`${label}: forced-color emulation unavailable`);
  if (mode === "reduced" && !geometry.reducedMotion)
    results.failures.push(`${label}: reduced-motion emulation unavailable`);
  if (
    mode === "reduced" &&
    geometry.activeAnimations.some((animation) => animation.duration > 10 || animation.iterations === Infinity)
  )
    results.failures.push(`${label}: animation ignores reduced motion`);
  return {
    label,
    axe,
    axeIncomplete: axeReport.incomplete,
    geometry,
    configuredViewport: modes[mode].viewport,
    screenshot,
    errors: [...errors],
  };
}

async function focusState(page) {
  return page.evaluate(() => {
    const node = document.activeElement;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      tag: node.tagName,
      name: node.getAttribute("aria-label") || node.textContent.trim().slice(0, 80),
      testid: node.dataset.testid,
      role: node.getAttribute("role"),
      outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
      box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  });
}

try {
  if (process.env.A11Y_REVIEWER_COOKIE) {
    const verificationContext = await browser.newContext();
    try {
      await verificationContext.addCookies([
        { name: "queue_arcade_session", value: process.env.A11Y_REVIEWER_COOKIE, url: appUrl },
      ]);
      const response = await verificationContext.request.get(`${appUrl}/api/me`);
      const identity = await response.json();
      results.accountFixture = {
        status: response.status(),
        authenticated: identity.authenticated === true,
        name: identity.profile?.user?.displayName ?? null,
        answers: identity.profile?.stats?.answered ?? null,
      };
      if (!response.ok() || !results.accountFixture.authenticated) {
        results.failures.push("Reviewer fixture is not authenticated by /api/me");
        throw new Error("Reviewer fixture is not authenticated by /api/me");
      }
    } finally {
      await verificationContext.close();
    }
  }
  for (const mode of requestedModes) {
    if (!modes[mode]) throw new Error(`Unknown mode ${mode}`);
    if (process.env.A11Y_FIXTURES_ONLY !== "1") {
      for (const pathname of ["/", "/party", "/profile", "/privacy", "/calibration", "/ops"]) {
        const session = await makePage(mode);
        await session.page.goto(appUrl + pathname, { waitUntil: "domcontentloaded" });
        await session.page.waitForFunction(() => {
          const main = document.querySelector("main[data-client-ready]");
          return !main || (main.dataset.clientReady === "true" && main.dataset.accountReady === "true");
        });
        const pageResult = await inspect(session.page, `${mode}-${pathname.slice(1) || "home"}`, session.errors, mode);
        if (pathname === "/profile" && process.env.A11Y_REVIEWER_COOKIE) {
          pageResult.profileFixture = await session.page.evaluate(() => {
            const profile = document.querySelector('[data-testid="profile-page"]');
            const answerLabel = [...document.querySelectorAll('[aria-label="Lifetime records"] span')].find(
              (node) => node.textContent === "Answers",
            );
            return {
              authenticated: profile?.getAttribute("data-authenticated") === "true",
              name: profile?.querySelector("h1")?.textContent ?? "",
              answers: Number(answerLabel?.nextElementSibling?.textContent?.replaceAll(",", "")),
              formats: document.querySelectorAll('[data-testid^="format-mastery-"]').length,
            };
          });
          const profile = pageResult.profileFixture;
          if (!profile.authenticated || !profile.formats)
            results.failures.push(`${mode}-profile: signed-in fixture missing`);
          if (profile.name.length < Number(process.env.A11Y_EXPECT_PROFILE_NAME_LENGTH ?? 1))
            results.failures.push(`${mode}-profile: long name fixture missing`);
          if (
            !Number.isFinite(profile.answers) ||
            profile.answers < Number(process.env.A11Y_EXPECT_PROFILE_MIN_ANSWERS ?? 0)
          )
            results.failures.push(`${mode}-profile: answer history fixture missing`);
        }
        if (pathname === "/ops") {
          const table = session.page.getByRole("table", { name: "Round format health" });
          if (await table.count()) {
            const before = await table.evaluate((node) => ({
              left: node.scrollLeft,
              overflows: node.scrollWidth > node.clientWidth,
            }));
            if (before.overflows) {
              await table.focus();
              await session.page.keyboard.press("ArrowRight");
              await session.page
                .waitForFunction((node) => node.scrollLeft > 0, await table.elementHandle(), { timeout: 1000 })
                .catch(() => {});
              pageResult.keyboardScroll = {
                before: before.left,
                after: await table.evaluate((node) => node.scrollLeft),
              };
              if (pageResult.keyboardScroll.after <= before.left)
                results.failures.push(`${mode}-ops: keyboard cannot scroll table`);
            }
          }
        }
        results.pages.push(pageResult);
        if (pathname === "/party") {
          await session.page.getByTestId("private-room-choose-create").click();
          await session.page.getByRole("group", { name: "Games", exact: true }).getByRole("button").first().click();
          results.pages.push(await inspect(session.page, `${mode}-party-unchecked`, session.errors, mode));
        }
        await session.context.close();
      }
    }
    for (const fixture of process.env.A11Y_PAGES_ONLY === "1" || !fixtureModes.includes(mode)
      ? []
      : fixtures.filter((fixture) => !fixtureNames || fixtureNames.includes(fixture.name))) {
      const session = await fixturePage(fixture, mode);
      results.fixtures.push(await inspect(session.page, `${mode}-${fixture.name}`, session.errors, mode));
      await session.context.close();
      await save();
    }
    console.log(
      JSON.stringify({
        runName,
        mode,
        pages: results.pages.length,
        fixtures: results.fixtures.length,
        failures: results.failures.length,
      }),
    );
  }
  if (process.env.A11Y_SKIP_KEYBOARD !== "1") {
    for (const name of ["classic-ability", "shop-build", "fogged-vision", "order-up", "flashback-year"]) {
      const keyboardMode = process.env.A11Y_KEYBOARD_MODE ?? "desktop";
      const session = await fixturePage(
        fixtures.find((fixture) => fixture.name === name),
        keyboardMode,
      );
      const { page, state } = session;
      const sequence = [];
      for (let index = 0; index < 14; index += 1) {
        await page.keyboard.press("Tab");
        sequence.push(await focusState(page));
      }
      const keyboard = { name, tabSequence: sequence };
      keyboard.timerLive = await page.locator('[role="timer"]').getAttribute("aria-live");
      if (keyboard.timerLive !== "off") results.failures.push(`${name}: timer announces each tick`);
      if (engine === "chromium") {
        const cdp = await session.context.newCDPSession(page);
        const { nodes } = await cdp.send("Accessibility.getFullAXTree");
        keyboard.timerAccessibility = nodes
          .filter((node) => node.role?.value === "timer")
          .map((node) => ({ role: node.role, name: node.name, properties: node.properties }));
        await cdp.detach();
      }
      const tabs = page.locator('[role="tab"]');
      if (await tabs.count()) {
        await tabs.first().focus();
        const before = await focusState(page);
        await page.keyboard.press("ArrowRight");
        keyboard.tabs = {
          before,
          after: await focusState(page),
          selected: await page.locator('[role="tab"][aria-selected="true"]').textContent(),
        };
        if (keyboard.tabs.before.testid === keyboard.tabs.after.testid)
          results.failures.push(`${name}: tab arrow navigation missing`);
      }
      if (name === "classic-ability") {
        state.phase = "reveal";
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await page.getByTestId("report-question").waitFor({ timeout: 10000 });
        await page.getByTestId("report-question").focus();
        await page.keyboard.press("Enter");
        await page.keyboard.press("Tab");
        keyboard.report = { openedFocus: await focusState(page) };
        if (keyboardMode === "forced") {
          const menu = page.getByRole("group", { name: "Why are you reporting this question?" });
          const first = await menu.screenshot({ path: path.join(outputDir, `${runName}-report-focus-first.png`) });
          await page.keyboard.press("Tab");
          const second = await menu.screenshot({ path: path.join(outputDir, `${runName}-report-focus-second.png`) });
          keyboard.report.focusPaintChanged = !first.equals(second);
          if (!keyboard.report.focusPaintChanged) results.failures.push("report: forced-color focus is invisible");
        }
        await page.keyboard.press("Escape");
        keyboard.report.afterEscape = {
          focus: await focusState(page),
          reasons: await page.getByTestId("report-reason").count(),
        };
        state.phase = "answering";
        state.number += 1;
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await page.getByTestId("report-carryover").waitFor({ timeout: 10000 });
        keyboard.report.afterRoundChange = await focusState(page);
        if (
          keyboard.report.afterRoundChange.tag !== "BUTTON" ||
          keyboard.report.afterRoundChange.name !== keyboard.report.afterEscape.focus.name
        )
          results.failures.push("report: focus lost when round changes");
        await page.screenshot({ path: path.join(outputDir, `${runName}-report-carryover-focus.png`), fullPage: true });
      }
      keyboard.votes = state.votes;
      results.keyboard.push(keyboard);
      await session.context.close();
      await save();
    }
    const session = await fixturePage(
      fixtures.find((fixture) => fixture.name === "fogged-vision"),
      "mobile",
    );
    const { page, state } = session;
    const readViewport = () => {
      const prompt = document.querySelector('[data-testid="round-prompt"] h2')?.getBoundingClientRect();
      const timer = document.querySelector('[data-testid="round-timer"]')?.getBoundingClientRect();
      return {
        scrollY,
        height: innerHeight,
        prompt: prompt ? { top: prompt.top, bottom: prompt.bottom } : null,
        timer: timer ? { top: timer.top, bottom: timer.bottom } : null,
      };
    };
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    const before = await page.evaluate(readViewport);
    if (!before.prompt || before.prompt.top >= 0)
      results.failures.push("mobile next round: fixture did not put the old prompt above the viewport");
    state.number += 1;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForSelector('main[data-phase="answering"][data-round-id="a11y-fogged-vision-2"]');
    await page
      .waitForFunction(
        () => {
          const prompt = document.querySelector('[data-testid="round-prompt"] h2')?.getBoundingClientRect();
          const timer = document.querySelector('[data-testid="round-timer"]')?.getBoundingClientRect();
          return (
            prompt &&
            timer &&
            prompt.top >= timer.bottom - 1 &&
            prompt.bottom <= innerHeight + 1 &&
            timer.top >= 0 &&
            timer.bottom <= innerHeight
          );
        },
        undefined,
        { timeout: 5000 },
      )
      .catch(() => {});
    const after = await page.evaluate(readViewport);
    if (
      !after.prompt ||
      !after.timer ||
      after.prompt.top < after.timer.bottom - 1 ||
      after.prompt.bottom > after.height + 1 ||
      after.timer.top < 0 ||
      after.timer.bottom > after.height
    )
      results.failures.push("mobile next round: new question or timer remains outside the viewport");
    const screenshot = path.join(outputDir, `${runName}-mobile-next-round.png`);
    await page.screenshot({ path: screenshot, scale: "css" });
    results.keyboard.push({ name: "mobile-next-round", before, after, screenshot });
    await session.context.close();
    await save();
  }
} finally {
  await save();
  await browser.close();
}
results.completed = true;
results.completedAt = new Date().toISOString();
await save();
console.log(
  JSON.stringify({
    runName,
    pages: results.pages.length,
    fixtures: results.fixtures.length,
    failures: results.failures,
    output: path.join(outputDir, `${runName}.json`),
  }),
);
if (results.failures.length && process.env.A11Y_REPORT_ONLY !== "1") process.exitCode = 1;
