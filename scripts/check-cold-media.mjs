#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const origin = new URL(process.env.APP_URL ?? "http://127.0.0.1:3323");
assert(origin.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(origin.hostname));
assert(!origin.username && !origin.password && origin.pathname === "/" && !origin.search && !origin.hash);
assert.equal(process.env.CAPACITY_ISOLATED, "1", "Use an isolated local synthetic server");
const size = Number(process.env.COLD_MEDIA_PLAYERS ?? 100);
assert(Number.isInteger(size) && size > 0 && size <= 100, "Use one to 100 media clients");
const output = resolve(process.env.COLD_MEDIA_OUTPUT ?? "/tmp/queue-arcade-cold-media.json");
const id = randomUUID().slice(0, 8);
const sleep = (ms) => new Promise((done) => setTimeout(done, Math.max(0, ms)));
const result = { ok: false, players: size, startedAt: Date.now(), scenarios: [] };
const elapsed = [];
async function call(path, player, { body, binary = false, expected = [200] } = {}) {
  const start = performance.now();
  const response = await fetch(new URL(path, origin), {
    method: body ? "POST" : "GET",
    headers: {
      Origin: origin.origin,
      "x-real-ip": player.address,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  const milliseconds = performance.now() - start;
  elapsed.push(milliseconds);
  assert(expected.includes(response.status), `${player.id}: ${path.split("?")[0]} returned ${response.status}`);
  if (!binary) return JSON.parse(bytes.toString());
  assert(bytes.length > 0);
  return {
    milliseconds,
    bytes: bytes.length,
    contentType: response.headers.get("content-type"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] * 100) / 100;
};
try {
  for (const [gameIndex, game] of ["soundcheck", "echo-hunt", "fogged-vision"].entries()) {
    const code = `COLD${id}${gameIndex}`.toUpperCase();
    const players = Array.from({ length: size }, (_, index) => ({
      id: `cold-${id}-${gameIndex}-${index}`,
      name: `Media ${index + 1}`,
      address: `10.220.${30 + gameIndex}.1`,
    }));
    const host = players[0];
    const scenario = { game, stages: [] };
    result.scenarios.push(scenario);
    try {
      await call("/api/private-rooms", host, {
        body: { action: "create", code, playerId: host.id, name: host.name, games: [game] },
      });
      const guests = players.slice(1);
      await Promise.all(
        guests.map((player) =>
          call("/api/private-rooms", player, {
            body: { action: "join", code, playerId: player.id, name: player.name },
          }),
        ),
      );
      const start = await call("/api/private-rooms/start", host, { body: { code, playerId: host.id } });
      const startedAt = start.privateRoom.startedAt;
      for (const stage of [0, 1, 2]) {
        await sleep(startedAt + stage * 5000 + 250 - Date.now());
        const params = new URLSearchParams({
          gameId: "dota2",
          mode: "mixed",
          filter: "Mixed",
          privateCode: code,
          playerId: host.id,
        });
        const snapshot = await call(`/api/rounds?${params}`, host);
        assert.equal(snapshot.round.phase, "answering");
        const source =
          game !== "fogged-vision"
            ? (snapshot.question.audio.clips?.[0] ?? snapshot.question.audio.src)
            : snapshot.question.image.src;
        assert(source.startsWith("/api/"), "Media must stay behind the local app proxy");
        const outputs = await Promise.all(
          players.map((player) => {
            const url = new URL(source, origin);
            url.searchParams.set("playerId", player.id);
            return call(url.pathname + url.search, player, { binary: true });
          }),
        );
        assert(
          outputs.every((entry) => entry.sha256 === outputs[0].sha256 && entry.contentType === outputs[0].contentType),
          "Shared media differed within one clue stage",
        );
        const milliseconds = outputs.map((entry) => entry.milliseconds);
        scenario.stages.push({
          stage: stage + 1,
          requests: outputs.length,
          totalBytes: outputs.reduce((sum, entry) => sum + entry.bytes, 0),
          responseBytes: outputs[0].bytes,
          contentType: outputs[0].contentType,
          sha256: outputs[0].sha256,
          p50Ms: percentile(milliseconds, 0.5),
          p95Ms: percentile(milliseconds, 0.95),
          p99Ms: percentile(milliseconds, 0.99),
          maxMs: Math.max(...milliseconds),
        });
        console.log(`PASS ${game} stage ${stage + 1}: ${size} matching media responses`);
      }
    } finally {
      for (const player of players)
        await call("/api/private-rooms/leave", player, {
          body: { code, playerId: player.id },
          expected: [200, 403, 404],
        });
    }
  }
  result.ok = true;
} catch (error) {
  result.error = error.stack ?? String(error);
  console.error(result.error);
  process.exitCode = 1;
} finally {
  result.endedAt = Date.now();
  result.requests = elapsed.length;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + "\n");
  console.log(`Cold media result: ${output}`);
}
