import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as cutter from "../src/lib/cut-round-audio.mjs";
import * as cache from "../src/lib/round-audio-cache.mjs";
import * as soundcheck from "../src/lib/soundcheck.mjs";
import * as media from "../src/lib/media-work.mjs";

function loadRoute(dependencies) {
  const source = ts.transpileModule(
    readFileSync(new URL("../src/app/api/round-audio/route.ts", import.meta.url), "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)(
    (name) => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
      return dependencies[name];
    },
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

function fixture({ offset = 0.6, game = "soundcheck", phase = "answering" } = {}) {
  const wav = Buffer.alloc(44 + 2_000);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(1_000, 24);
  wav.writeUInt32LE(2_000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(2_000, 40);
  for (let frame = 600; frame < 1_000; frame += 1) wav.writeInt16LE(5_000, 44 + frame * 2);
  const original = { bytes: wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.length), contentType: "audio/wav" };
  const question = {
    id: "fixture",
    audio: { src: `test:${crypto.randomUUID()}` },
    ...(game === "soundcheck" ? { soundcheck: { clips: [{ duration: 1, startSeconds: offset }] } } : {}),
  };
  const round = {
    id: "dota2:fixture:round:0",
    number: 0,
    questionId: "fixture",
    game,
    phase,
    answerDuration: 15_000,
    answerDeadline: 15_000,
    revealDeadline: 22_000,
  };
  const warm = vi.fn(async () => original);
  const cut = vi.fn(cache.cachedAudioCut);
  const route = loadRoute({
    "next/server": { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
    "@/lib/api-protection": { rateLimitRequest: () => null, requestPlayerIdentity: () => "fixture" },
    "@/lib/cut-round-audio.mjs": cutter,
    "@/lib/game-catalogs": { GAME_CATALOGS: { dota2: { questions: [question] } }, isGameId: (id) => id === "dota2" },
    "@/lib/private-room-rounds": {
      liveRoundForSettings: () => ({ round, room: { gameId: "dota2" } }),
      liveRoundAt: () => ({ ...round, id: "next-round" }),
    },
    "@/lib/private-rooms.mjs": { privateRoomCodeFromRoundId: () => null },
    "@/lib/private-media-access": { privateMediaAccessResponse: async () => null },
    "@/lib/round-audio-cache.mjs": {
      ...cache,
      warmRoundAudio: warm,
      cachedRoundAudio: async () => original,
      cachedAudioCut: cut,
    },
    "@/lib/media-work.mjs": media,
    "@/lib/soundcheck.mjs": soundcheck,
    "@/lib/scoring.mjs": { clueStageAt: () => 1 },
    "@/lib/public-rooms": { parsePublicRoomSettings: () => ({ gameId: "dota2" }) },
    "@/lib/server-diagnostics": { logServerError: () => {} },
  });
  const request = (extra = "", headers = {}) =>
    new Request(`http://test/api/round-audio?roundId=${round.id}${extra}`, { headers });
  return { ...route, request, round, cut, warm, original };
}

afterEach(() => vi.restoreAllMocks());

describe("trusted Soundcheck audio offset", () => {
  it.each([1_000, 6_000, 9_000])("starts every answering stage at the reviewed audible point at %sms", async (now) => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const test = fixture();
    const response = await test.GET(test.request("&startSeconds=0&stage=3", { Range: "bytes=0-1" }));
    expect(response.status).toBe(200);
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.readInt16LE(44)).toBe(5_000);
    const stage = soundcheck.soundcheckRevealStage(15_000 - now, 15_000);
    expect(bytes.readUInt32LE(40)).toBe(Math.ceil(soundcheck.soundcheckCutDuration(0.4, stage) * 1_000) * 2);
    expect(test.cut.mock.calls[0][4]).toBe(0.6);
  });

  it("applies byte ranges to the trimmed reveal and warms the same offset", async () => {
    const test = fixture({ phase: "reveal" });
    const response = await test.GET(test.request("", { Range: "bytes=44-45" }));
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 44-45/844");
    expect(Buffer.from(await response.arrayBuffer()).readInt16LE(0)).toBe(5_000);
    const warm = await test.HEAD(test.request());
    expect(warm.status).toBe(204);
    expect(await warm.text()).toBe("");
    expect(test.warm).toHaveBeenCalled();
    expect(test.cut.mock.calls.at(-1)[4]).toBe(0.6);
  });

  it("leaves full Echo audio unchanged at its final answering stage", async () => {
    vi.spyOn(Date, "now").mockReturnValue(9_000);
    const test = fixture({ game: "echo-hunt" });
    const response = await test.GET(test.request());
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from(test.original.bytes));
    expect(test.cut).not.toHaveBeenCalled();
  });

  it("rejects invalid trusted metadata rather than returning the untrimmed source", async () => {
    const test = fixture({ offset: 1, phase: "reveal" });
    expect((await test.GET(test.request())).status).toBe(502);
    expect((await test.HEAD(test.request())).status).toBe(502);
  });

  it("does not reuse a cut at a different start offset", async () => {
    const source = `cache-offset:${crypto.randomUUID()}`;
    const first = await cache.cachedAudioCut(source, 0.12, "audio/wav", async () => new Uint8Array([1]).buffer, 0);
    const second = await cache.cachedAudioCut(source, 0.12, "audio/wav", async () => new Uint8Array([2]).buffer, 0.6);
    expect(new Uint8Array(first.bytes)[0]).toBe(1);
    expect(new Uint8Array(second.bytes)[0]).toBe(2);
  });
});
