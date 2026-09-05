#!/usr/bin/env node

/**
 * Runs browser click-throughs. Uses a live app if one is up, else `pnpm start`.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";

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
    const response = await fetch(`${url.replace(/\/$/, "")}/api/health`, { cache: "no-store" });
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
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} failed (${code}).`));
    });
  });
}

const preferred = process.env.APP_URL ?? "http://localhost:3000";
let appUrl = preferred;
let server = null;

if (!(await healthy(appUrl))) {
  const port = await freePort();
  appUrl = `http://127.0.0.1:${port}`;
  server = spawn("pnpm", ["start", "-H", "127.0.0.1", "-p", String(port)], {
    stdio: "ignore",
    env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1" },
  });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    if (await healthy(appUrl)) break;
    await delay(250);
  }
  if (!(await healthy(appUrl))) {
    server.kill("SIGKILL");
    throw new Error("Could not start the app for UI checks. Run pnpm dev or pnpm build first.");
  }
}

try {
  for (const script of [
    "check-pages.mjs",
    "check-party-lobby.mjs",
    "check-party-previews.mjs",
    "check-party-nicks.mjs",
    "check-public-play.mjs",
    "check-reports-api.mjs",
    "check-party-api.mjs",
    "check-round-copy.mjs",
    "check-shop-search.mjs",
    "check-hero-search.mjs",
    "check-flashback-ui.mjs",
    "check-feedback-sounds.mjs",
    "check-rate-limit-live.mjs",
  ]) {
    await run(script, appUrl);
  }
} finally {
  server?.kill("SIGKILL");
}
