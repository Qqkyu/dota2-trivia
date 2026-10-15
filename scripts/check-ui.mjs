#!/usr/bin/env node

/**
 * Runs browser click-throughs. Uses a live app if one is up, else `pnpm start`.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
    server.on("error", reject);
  });
}

async function healthy(url) {
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/api/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function run(script, appUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [`scripts/${script}`], {
      stdio: "inherit",
      env: { ...process.env, APP_URL: appUrl },
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} failed (${code}).`));
    });
  });
}

// Each script starts its own browser and mocks its own server state, so a rerun
// starts clean. One retry absorbs timing noise on shared CI runners; a script
// that fails twice in a row still fails the gate. UI_CHECK_RETRIES=0 disables it.
const retries = Number(process.env.UI_CHECK_RETRIES ?? 1);
const retried = [];
async function runWithRetry(script, appUrl) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await run(script, appUrl);
      if (attempt > 0) retried.push(script);
      return;
    } catch (error) {
      if (attempt >= retries) throw error;
      console.warn(`RETRY ${script} after: ${error.message}`);
    }
  }
}

const preferred = process.env.APP_URL ?? "http://localhost:3000";
let appUrl = preferred;
let server = null;
let dataDirectory = null;

if (!(await healthy(appUrl))) {
  const port = await freePort();
  appUrl = `http://127.0.0.1:${port}`;
  dataDirectory = await mkdtemp(path.join(tmpdir(), "queue-arcade-ui-"));
  server = spawn(process.execPath, ["scripts/start-production.mjs", "-H", "127.0.0.1", "-p", String(port)], {
    stdio: ["ignore", "ignore", "inherit"],
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DATABASE_URL: "",
      ARCADE_ALLOW_FILE_STORE: "true",
      ARCADE_APP_URL: appUrl,
      ARCADE_DATA_COUNTRIES: "temporary local verification",
      ARCADE_VOTER_SALT: randomBytes(32).toString("hex"),
      ARCADE_AUTH_SECRET: randomBytes(32).toString("hex"),
      ARCADE_DATA_FILE: path.join(dataDirectory, "votes.json"),
      ARCADE_ACCOUNT_DATA_FILE: path.join(dataDirectory, "accounts.json"),
      ARCADE_ALPHA_DATA_FILE: path.join(dataDirectory, "alpha.json"),
      ARCADE_TRUST_PROXY: "none",
      STEAM_WEB_API_KEY: "",
    },
  });
  let startupError = null;
  server.on("error", (error) => {
    startupError = error;
  });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    if (startupError || server.exitCode !== null) break;
    if (await healthy(appUrl)) break;
    await delay(250);
  }
  if (!(await healthy(appUrl))) {
    server.kill("SIGKILL");
    await rm(dataDirectory, { recursive: true, force: true });
    throw startupError ?? new Error("Could not start the app for UI checks. Run pnpm dev or pnpm build first.");
  }
}

try {
  for (const script of [
    "check-pages.mjs",
    "check-party-lobby.mjs",
    "check-party-previews.mjs",
    "check-party-nicks.mjs",
    "check-party-crowd.mjs",
    "check-public-play.mjs",
    "check-reports-api.mjs",
    "check-party-api.mjs",
    "check-round-copy.mjs",
    "check-shop-search.mjs",
    "check-layout.mjs",
    "check-hero-search.mjs",
    "check-flashback-ui.mjs",
    "check-ui-recovery.mjs",
    "check-gameplay-recovery.mjs",
    "check-user-journeys.mjs",
    "check-round-accessibility.mjs",
    "check-shop-accessibility.mjs",
    "check-responsive-ui.mjs",
    "check-native-feedback-sounds.mjs",
    "check-feedback-sounds.mjs",
    "check-rate-limit-live.mjs",
  ]) {
    await runWithRetry(script, appUrl);
  }
  if (retried.length) console.warn(`Passed on retry: ${retried.join(", ")}`);
} finally {
  if (server && server.exitCode === null) {
    const stopped = new Promise((resolve) => server.once("exit", resolve));
    server.kill("SIGTERM");
    const timeout = setTimeout(() => server.kill("SIGKILL"), 5_000);
    await stopped;
    clearTimeout(timeout);
  }
  if (dataDirectory) await rm(dataDirectory, { recursive: true, force: true });
}
