#!/usr/bin/env node
/**
 * Deploy to Render without cutting off players.
 *
 *   RENDER_API_KEY=... pnpm run deploy:production [--commit=<sha>] [--max-wait=30]
 *                      [--skip-gate-check] [--skip-live-checks]
 *
 * 1. The commit must be on origin/main and must have passed `pnpm check`; later commits
 *    may only change Markdown files.
 * 2. Parties live in the server's memory, so this waits until no party is open on the
 *    live server (up to --max-wait minutes, default 30).
 * 3. It starts the Render deploy and follows it. The new server waits again for parties
 *    opened during the build and takes traffic only early in a reveal
 *    (src/lib/deploy-handoff.mjs), so the public room never changes mid-question.
 * 4. It reports when traffic moved, then runs the live header and public-play checks.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const APP_URL = (process.env.APP_URL ?? "https://queuearcade.com").replace(/\/$/, "");
const SERVICE_ID = process.env.RENDER_SERVICE_ID ?? "srv-d9mqd1942hec73e9nlt0";
const API = "https://api.render.com/v1";
const KEY = process.env.RENDER_API_KEY;
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const match = args.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const git = (...parts) => execFileSync("git", parts, { encoding: "utf8" }).trim();
const started = Date.now();
const stamp = () => `+${Math.round((Date.now() - started) / 1000)}s`.padStart(6);
const say = (line) => console.log(`${stamp()}  ${line}`);

function fail(message) {
  console.error(`Deploy stopped: ${message}`);
  process.exit(1);
}

async function render(path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${KEY}`, Accept: "application/json", "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Render API ${path} answered ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function live(path) {
  try {
    const response = await fetch(`${APP_URL}${path}`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/** The new server's handoff decisions and Render's switch time, from the Render logs. */
async function reportHandoff(since, attempt = 1) {
  try {
    const { ownerId } = await render(`/services/${SERVICE_ID}`);
    const read = async (text) => {
      const query = new URLSearchParams({
        ownerId,
        resource: SERVICE_ID,
        startTime: since,
        endTime: new Date().toISOString(),
        limit: "100",
        direction: "forward",
        text,
      });
      return ((await render(`/logs?${query}`)).logs ?? []).map((entry) => ({
        at: Date.parse(entry.timestamp),
        message: String(entry.message ?? "").replace(/\u001b\[[0-9;]*m/g, ""),
      }));
    };
    const decisions = (await read("queue-arcade:handoff")).map((entry) => ({
      ...entry,
      ...JSON.parse(entry.message.slice(entry.message.indexOf("{"))),
    }));
    const passed = decisions.find((entry) => entry.ready);
    for (const decision of decisions.filter((entry) => !entry.ready && entry.instance === passed?.instance)) {
      const why =
        decision.reason === "parties"
          ? `${decision.openParties} open part${decision.openParties === 1 ? "y" : "ies"}`
          : "a reveal";
      say(`New server waited for ${why} (from ${new Date(decision.at).toISOString().slice(11, 19)} UTC).`);
    }
    const switched = passed && (await read("Your service is live")).find((entry) => entry.at >= Date.parse(passed.at));
    if (!passed || !switched) {
      if (attempt < 3) {
        await delay(5_000);
        return reportHandoff(since, attempt + 1);
      }
      return say("Handoff details are not in the Render logs yet.");
    }
    const intoPhase = passed.msIntoPhase + (switched.at - Date.parse(passed.at));
    say(
      `New server passed ${(passed.msIntoPhase / 1000).toFixed(1)}s into the ${passed.phase === "reveal" ? "reveal" : "question"} of round ${passed.round} after ${Math.round(passed.waitedMs / 1000)}s (${passed.reason}); Render switched ${((switched.at - Date.parse(passed.at)) / 1000).toFixed(1)}s later, about ${(intoPhase / 1000).toFixed(1)}s into that ${passed.phase === "reveal" ? "7-second reveal" : "question"}.`,
    );
  } catch (error) {
    say(`Could not read the handoff from the Render logs (${error.message}).`);
  }
}

function runCheck(script) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { stdio: "inherit", env: { ...process.env, APP_URL } });
    child.on("exit", (code) => resolve(code === 0));
  });
}

if (!KEY) fail("set RENDER_API_KEY.");

// 1. What to deploy, and was it tested?
git("fetch", "--quiet", "origin", "main");
const commit = git("rev-parse", option("commit", "origin/main"));
try {
  git("merge-base", "--is-ancestor", commit, "origin/main");
} catch {
  fail(`${commit.slice(0, 7)} is not on origin/main. Push or merge it first.`);
}
if (!flag("skip-gate-check")) {
  if (!existsSync(".check-pass.json"))
    fail("no passing `pnpm check` recorded on this machine. Run it, or pass --skip-gate-check.");
  const pass = JSON.parse(readFileSync(".check-pass.json", "utf8"));
  if (pass.dirty) fail("the last `pnpm check` ran with uncommitted changes. Commit, then run it again.");
  const sameTree = git("rev-parse", `${commit}^{tree}`) === pass.tree;
  let changed = [];
  if (!sameTree) {
    try {
      changed = git("diff", "--name-only", pass.tree, `${commit}^{tree}`).split("\n").filter(Boolean);
    } catch {
      fail(`the tested tree from ${pass.commit.slice(0, 7)} is not in this clone.`);
    }
  }
  const untested = changed.filter((file) => !file.endsWith(".md"));
  if (untested.length) {
    fail(
      `files changed after the last passing \`pnpm check\` (${pass.commit.slice(0, 7)}): ${untested.slice(0, 6).join(", ")}`,
    );
  }
  say(
    `Commit ${commit.slice(0, 7)} matches the gate that passed ${pass.at}${changed.length ? ` (plus ${changed.length} Markdown file(s))` : ""}.`,
  );
}

// 2. Wait for open parties on the live server.
const before = await live("/api/health");
if (!before) fail(`${APP_URL}/api/health is not answering; use the Render dashboard for a broken service.`);
say(
  `Live: release ${before.release ?? "?"}, instance ${before.instance ?? "?"}, open parties ${before.parties?.open ?? "unknown"}.`,
);
const maxWaitMs = Number(option("max-wait", "30")) * 60_000;
let open = before.parties?.open ?? 0;
const waitStart = Date.now();
while (open > 0 && Date.now() - waitStart < maxWaitMs) {
  say(
    `${open} open part${open === 1 ? "y" : "ies"} on the live server; waiting for ${open === 1 ? "it" : "them"} to finish.`,
  );
  await delay(20_000);
  open = (await live("/api/health"))?.parties?.open ?? 0;
}
if (open > 0)
  say(`Still ${open} open after the wait. The new server waits up to 10 more minutes, then ends them with a notice.`);

// 3. Deploy and follow it.
const deploy = await render(`/services/${SERVICE_ID}/deploys`, {
  method: "POST",
  body: JSON.stringify({ commitId: commit }),
});
say(`Deploy ${deploy.id} started: https://dashboard.render.com/web/${SERVICE_ID}/deploys/${deploy.id}`);
let status = deploy.status;
const deployStartedAt = new Date().toISOString();
const FAILED = new Set(["build_failed", "update_failed", "canceled", "deactivated", "pre_deploy_failed"]);
while (status !== "live" && !FAILED.has(status)) {
  await delay(5_000);
  const next = (await render(`/services/${SERVICE_ID}/deploys/${deploy.id}`)).status;
  if (next !== status) say(`Deploy status: ${next}`);
  status = next;
}
if (status !== "live") fail(`Render reports ${status}. The previous version keeps serving.`);
await reportHandoff(deployStartedAt);

// 4. Verify the new server and run the live checks.
const after = await live("/api/health");
if (after?.instance && after.instance === before.instance) fail("the live instance did not change.");
const expected = commit.slice(0, 12);
if (after?.release && after.release !== "local" && after.release !== expected) {
  fail(`live release is ${after.release}, expected ${expected}.`);
}
say(
  `Live: release ${after?.release ?? "?"}, instance ${after?.instance ?? "?"}, open parties ${after?.parties?.open ?? "?"}.`,
);
if (!flag("skip-live-checks")) {
  const headers = await runCheck("scripts/check-security-headers.mjs");
  const play = await runCheck("scripts/check-public-play.mjs");
  if (!headers || !play) fail("a live check failed. Roll back in the Render dashboard if players are affected.");
}
say(`Done: ${commit.slice(0, 7)} is live at ${APP_URL}.`);
