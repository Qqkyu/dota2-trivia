#!/usr/bin/env node

/**
 * Hits the vote API on a production Next server until the 12/min guardrail fires.
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
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
    const response = await fetch(`${url}/api/health`, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

const distDir = process.env.QUEUE_ARCADE_DIST_DIR || ".next";
try {
  await access(path.join(process.cwd(), distDir, "BUILD_ID"));
} catch {
  throw new Error(`Need a production build in ${distDir} for the rate-limit check. Run pnpm build.`);
}

const port = await freePort();
const appUrl = `http://127.0.0.1:${port}`;
const nextBin = path.join(process.cwd(), "node_modules/next/dist/bin/next");
const logs = [];
const server = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    ARCADE_APP_URL: appUrl,
    ARCADE_DATA_COUNTRIES: "the rate-limit check",
    ARCADE_ALLOW_FILE_STORE: "true",
    ARCADE_VOTER_SALT: "queue-arcade-rate-limit-check-voter-salt",
    ARCADE_AUTH_SECRET: "queue-arcade-rate-limit-check-auth-secret",
    DATABASE_URL: "",
  },
});
for (const stream of [server.stdout, server.stderr]) {
  stream?.on("data", (chunk) => {
    logs.push(String(chunk));
    if (logs.length > 40) logs.shift();
  });
}

try {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    if (server.exitCode != null) {
      throw new Error(`Production server exited (${server.exitCode}).\n${logs.join("")}`);
    }
    if (await healthy(appUrl)) break;
    await delay(250);
  }
  if (!(await healthy(appUrl))) {
    throw new Error(`Production server did not start for the rate-limit check.\n${logs.join("")}`);
  }

  const playerId = `rate-limit-${randomUUID()}`;
  const round = await fetch(
    `${appUrl}/api/rounds?gameId=dota2&mode=mixed&filter=Mixed&playerId=${encodeURIComponent(playerId)}`,
    { cache: "no-store" },
  );
  const payload = await round.json();
  const roundId = payload.round?.id;
  if (!round.ok || !roundId) throw new Error("Could not read a public round for the rate-limit check.");

  const statuses = [];
  let retryAfter = null;
  for (let attempt = 0; attempt < 13; attempt += 1) {
    const response = await fetch(`${appUrl}/api/votes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId: "dota2",
        mode: "mixed",
        filter: "Mixed",
        roundId,
        answerIndex: 0,
        voterId: playerId,
      }),
    });
    statuses.push(response.status);
    if (response.status === 429) retryAfter = response.headers.get("retry-after");
  }
  if (statuses[12] !== 429) {
    throw new Error(`Vote rate limit did not fire (statuses ${statuses.join(",")}).`);
  }
  if (!retryAfter) {
    throw new Error("429 had no Retry-After header.");
  }
  console.log("Validated production vote rate limit (12 then 429).");
} finally {
  server.kill("SIGKILL");
}
