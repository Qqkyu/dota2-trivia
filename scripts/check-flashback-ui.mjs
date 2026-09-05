#!/usr/bin/env node

/**
 * Spawns Chrome, then runs the Flashback visual fixtures.
 */

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

async function waitJson(url, timeout = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      // Chrome is still binding.
    }
    await delay(100);
  }
  throw new Error(`Chrome debug HTTP did not open at ${url}`);
}

const port = await freePort();
const userDataDir = await mkdtemp(join(tmpdir(), "queue-arcade-flashback-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--mute-audio",
    `--remote-debugging-port=${port}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--disable-gpu",
    "--window-size=1440,1000",
    "about:blank",
  ],
  { stdio: "ignore" },
);

try {
  await waitJson(`http://127.0.0.1:${port}/json/version`);
  await new Promise((resolve, reject) => {
    const child = spawn("node", ["scripts/visual-flashback.mjs"], {
      stdio: "inherit",
      env: {
        ...process.env,
        CHROME_DEBUG_URL: `http://127.0.0.1:${port}`,
      },
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`visual-flashback failed (${code}).`));
    });
  });
} finally {
  chrome.kill("SIGKILL");
  await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
}
