#!/usr/bin/env node
/**
 * Deploy handoff: a fresh server with ARCADE_DEPLOY_HANDOFF=on (the next deploy) holds its
 * health check while the live server (APP_URL) has an open party, then passes only early in
 * a reveal and stays ready after. With no live server to protect, it passes at once.
 * Starts two extra production servers from the current build.
 */
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const json = { "Content-Type": "application/json", Origin: new URL(appUrl).origin };

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
    server.on("error", reject);
  });
}

async function health(url) {
  try {
    const response = await fetch(`${url}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    return { status: response.status, body: await response.json().catch(() => null) };
  } catch {
    return { status: 0, body: null };
  }
}

const started = [];
async function startServer(liveOrigin) {
  const port = await freePort();
  const dataDirectory = await mkdtemp(path.join(tmpdir(), "queue-arcade-handoff-"));
  const output = [];
  const child = spawn(process.execPath, ["scripts/start-production.mjs", "-H", "127.0.0.1", "-p", String(port)], {
    stdio: ["ignore", "pipe", "inherit"],
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DATABASE_URL: "",
      ARCADE_ALLOW_FILE_STORE: "true",
      ARCADE_APP_URL: liveOrigin,
      ARCADE_DEPLOY_HANDOFF: "on",
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
  child.stdout.on("data", (chunk) => output.push(String(chunk)));
  const server = { url: `http://127.0.0.1:${port}`, child, dataDirectory, output };
  started.push(server);
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    if (child.exitCode !== null) throw new Error("A handoff test server exited during startup.");
    if ((await health(server.url)).status !== 0) return server;
    await delay(250);
  }
  throw new Error("A handoff test server did not start.");
}

let touching = null;
try {
  const live = await health(appUrl);
  if (live.status !== 200 || !live.body?.instance) throw new Error(`The live server is not ready (${live.status}).`);

  // An open party on the live server: one player keeps polling it.
  const code = `H${Date.now().toString(36).slice(-6).toUpperCase()}`;
  const playerId = `handoff-${randomUUID()}`;
  const created = await fetch(`${appUrl}/api/private-rooms`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ playerId, code, name: "Handoff", games: ["trivia"] }),
  });
  if (created.status !== 200) throw new Error(`Could not open a party (${created.status}).`);
  touching = setInterval(() => {
    void fetch(`${appUrl}/api/private-rooms`, {
      method: "POST",
      headers: json,
      body: JSON.stringify({ action: "touch", code, playerId }),
    }).catch(() => undefined);
  }, 2_000);

  const next = await startServer(appUrl);
  for (let check = 0; check < 6; check += 1) {
    const result = await health(next.url);
    if (result.status !== 503 || result.body?.wait !== "parties") {
      throw new Error(
        `The new server did not wait for the open party (${result.status} ${JSON.stringify(result.body)}).`,
      );
    }
    await delay(700);
  }

  clearInterval(touching);
  touching = null;
  const left = await fetch(`${appUrl}/api/private-rooms/leave`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ code, playerId }),
  });
  if (left.status !== 200) throw new Error(`Could not close the party (${left.status}).`);

  const reasons = new Set();
  let readyAt = null;
  let readyBody = null;
  const waitStart = Date.now();
  while (Date.now() - waitStart < 35_000) {
    const result = await health(next.url);
    if (result.status === 200) {
      readyAt = Date.now();
      readyBody = result.body;
      break;
    }
    if (result.status !== 503) throw new Error(`Unexpected health answer while waiting: ${result.status}.`);
    reasons.add(result.body?.wait);
    await delay(600);
  }
  if (!readyAt) throw new Error(`The new server never became ready (waited for ${[...reasons].join(", ")}).`);
  const presence = await fetch(`${appUrl}/api/presence`).then((response) => response.json());
  const intoReveal = presence.serverNow - presence.round.answerDeadline - (Date.now() - readyAt);
  if (presence.round.phase !== "reveal" || intoReveal < 900 || intoReveal > 4_700) {
    throw new Error(
      `The new server passed outside the reveal window (${presence.round.phase}, ${intoReveal} ms into reveal).`,
    );
  }
  if (readyBody?.instance === live.body.instance)
    throw new Error("The new server reported the live server's instance.");
  for (let check = 0; check < 3; check += 1) {
    await delay(1_500);
    if ((await health(next.url)).status !== 200)
      throw new Error("The new server fell back to waiting after it passed.");
  }
  const logged = next.output.join("").includes('"reason":"reveal-window"');
  if (!logged) throw new Error("The new server did not log its handoff decision.");

  // A server with nothing live to protect (first boot, crash) is ready at once.
  const nobody = `http://127.0.0.1:${await freePort()}`;
  const first = await startServer(nobody);
  const firstHealth = await health(first.url);
  if (firstHealth.status !== 200) {
    throw new Error(`A server with no live server waited (${firstHealth.status} ${JSON.stringify(firstHealth.body)}).`);
  }

  console.log(
    `Validated deploy handoff: waited for the open party, then for ${[...reasons].join(" + ") || "nothing"}; passed ${(intoReveal / 1000).toFixed(1)}s into a reveal and stayed ready; a lone server is ready at once.`,
  );
} finally {
  if (touching) clearInterval(touching);
  for (const server of started) {
    if (server.child.exitCode === null) {
      const stopped = new Promise((resolve) => server.child.once("exit", resolve));
      server.child.kill("SIGTERM");
      const timeout = setTimeout(() => server.child.kill("SIGKILL"), 5_000);
      await stopped;
      clearTimeout(timeout);
    }
    await rm(server.dataDirectory, { recursive: true, force: true });
  }
}
