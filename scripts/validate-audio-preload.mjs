#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  cachedAudioResponse,
  cachedRoundAudio,
  parseAudioRange,
  warmRoundAudio,
} from "../src/lib/round-audio-cache.mjs";

const failures = [];
const record = (condition, message) => {
  if (!condition) failures.push(message);
};

record(
  JSON.stringify(parseAudioRange("bytes=2-5", 10)) === JSON.stringify({ start: 2, end: 5 }),
  "A bounded browser audio range no longer resolves correctly.",
);
record(
  JSON.stringify(parseAudioRange("bytes=7-", 10)) === JSON.stringify({ start: 7, end: 9 }),
  "An open-ended browser audio range no longer resolves correctly.",
);
record(
  JSON.stringify(parseAudioRange("bytes=-3", 10)) === JSON.stringify({ start: 7, end: 9 }),
  "A suffix browser audio range no longer resolves correctly.",
);
record(parseAudioRange("bytes=10-12", 10) === null, "An invalid browser audio range was accepted.");

const originalFetch = globalThis.fetch;
const sourceBytes = Uint8Array.from({ length: 10 }, (_, index) => index);
let upstreamFetches = 0;
globalThis.fetch = async () => {
  upstreamFetches += 1;
  return new Response(sourceBytes, {
    status: 200,
    headers: {
      "Content-Length": String(sourceBytes.byteLength),
      "Content-Type": "audio/test",
    },
  });
};

try {
  const roundId = `audio-preload-validation:${Date.now()}`;
  const [first, second] = await Promise.all([
    warmRoundAudio(roundId, 0, "https://audio.invalid/clip.wav"),
    warmRoundAudio(roundId, 0, "https://audio.invalid/clip.wav"),
  ]);
  const cached = await cachedRoundAudio(roundId, 0);
  record(upstreamFetches === 1, "Concurrent audio preloads no longer collapse into one upstream fetch.");
  record(first === second && cached === first, "The warmed round audio was not retained for the live request.");

  if (cached) {
    const ranged = cachedAudioResponse(cached, "bytes=2-5");
    record(ranged.status === 206, "Warmed audio no longer serves a partial browser response.");
    record(
      ranged.headers.get("Content-Range") === "bytes 2-5/10" &&
        ranged.headers.get("X-Queue-Arcade-Audio-Cache") === "hit",
      "Warmed audio lost its range or cache response headers.",
    );
    record(
      JSON.stringify([...new Uint8Array(await ranged.arrayBuffer())]) === JSON.stringify([2, 3, 4, 5]),
      "Warmed audio returned the wrong byte range.",
    );
  }
} finally {
  globalThis.fetch = originalFetch;
}

const [routeSource, clientSource, cutterSource, dockerfile] = await Promise.all(
  [
    "src/app/api/round-audio/route.ts",
    "src/components/queue-arcade.tsx",
    "src/lib/cut-round-audio.mjs",
    "Dockerfile",
  ].map((file) => readFile(path.join(process.cwd(), file), "utf8")),
);
record(
  routeSource.includes('round.id !== roundId || round.phase !== "reveal"') &&
    routeSource.includes("liveRoundAt(settings, round.number + 1, round.revealDeadline)") &&
    routeSource.includes("warmRoundAudio(nextRound.id"),
  "The preload endpoint no longer limits warming to the immediate next round during reveal.",
);
record(
  routeSource.includes("if (round.id !== roundId)") && routeSource.includes("cachedRoundAudio(round.id, clip)"),
  "The playable audio endpoint no longer requires the current round or consumes its warm cache.",
);
record(
  routeSource.includes('rateLimitRequest(request, "round-audio", requestPlayerIdentity(request, searchParams), 60)') &&
    !routeSource.includes('"proxy", 60'),
  "The audio proxy still shares one identity across every player on an IP.",
);
record(
  clientSource.includes('method: "HEAD"') && clientSource.includes("prewarmedAfterRoundIdRef"),
  "The client no longer requests one bodyless audio warmup per reveal.",
);
record(
  routeSource.includes('from "@/lib/cut-round-audio.mjs"') && routeSource.includes("cutAudioWithFfmpeg("),
  "The audio route no longer cuts answering MP3s through the shared encoder helper.",
);
record(
  cutterSource.includes("finally") &&
    cutterSource.includes("await rm(dir, { recursive: true, force: true })") &&
    cutterSource.includes("spawn(") &&
    cutterSource.includes('"ffmpeg"'),
  "Failed audio cuts no longer remove their temporary work directory.",
);
record(
  dockerfile.includes("apk add --no-cache ffmpeg") && dockerfile.includes("FROM node:22-alpine AS runner"),
  "The production image no longer installs ffmpeg for Echo Hunt cuts.",
);

if (failures.length) throw new Error(failures.join("\n"));

console.log("Validated answer-safe next-round audio warming, request deduplication, and cached byte ranges.");
