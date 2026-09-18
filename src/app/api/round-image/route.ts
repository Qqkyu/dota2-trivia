import { readFile } from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { rateLimitRequest, requestPlayerIdentity } from "@/lib/api-protection";
import { GAME_CATALOGS, isGameId } from "@/lib/game-catalogs";
import { liveRoundForSettings } from "@/lib/private-room-rounds";
import { privateRoomCodeFromRoundId } from "@/lib/private-rooms.mjs";
import { parsePublicRoomSettings } from "@/lib/public-rooms";
import { logServerError } from "@/lib/server-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 1_500_000;
const IMAGE_CACHE_TTL_MS = 60_000;
const MAX_IMAGE_CACHE_ENTRIES = 16;
const ALLOWED_IMAGE_HOSTS = new Set([
  "cdn.cloudflare.steamstatic.com",
  "cdn.steamstatic.com",
  "cdn.akamai.steamstatic.com",
]);

type CachedRoundImage = { bytes: Buffer; contentType: string; createdAt: number };

const imageCacheStore = globalThis as typeof globalThis & {
  __queueArcadeRoundImageCache?: Map<string, CachedRoundImage>;
};
const roundImageCache = imageCacheStore.__queueArcadeRoundImageCache ?? new Map();
imageCacheStore.__queueArcadeRoundImageCache = roundImageCache;

function liveRoundForRoundId(roundId: string) {
  const gameId = roundId.split(":", 1)[0];
  if (!isGameId(gameId)) return null;
  const privateCode = privateRoomCodeFromRoundId(roundId);
  const settings = parsePublicRoomSettings({ gameId, ...(privateCode ? { privateCode } : {}) });
  if (!settings) return null;
  const live = liveRoundForSettings(settings, Date.now());
  if ("error" in live) return null;
  return { room: live.room, round: live.round };
}

function fogStage(round: { answerDeadline: number; answerDuration: number }, now: number) {
  const remaining = Math.max(0, round.answerDeadline - now);
  if (remaining <= round.answerDuration / 3) return 3;
  if (remaining <= (round.answerDuration * 2) / 3) return 2;
  return 1;
}

async function obscurePortrait(bytes: Buffer, stage: number) {
  const blur = stage <= 1 ? 21 : stage === 2 ? 14 : 8;
  const brightness = stage <= 1 ? 0.5 : stage === 2 ? 0.56 : 0.65;
  const saturation = stage <= 1 ? 0.44 : 0.6;
  return sharp(bytes)
    .resize(512, 288, { fit: "cover" })
    .blur(blur)
    .modulate({ brightness, saturation })
    .greyscale()
    .png()
    .toBuffer();
}

function pruneImageCache(now: number) {
  for (const [key, entry] of roundImageCache) {
    if (now - entry.createdAt >= IMAGE_CACHE_TTL_MS) roundImageCache.delete(key);
  }
  while (roundImageCache.size >= MAX_IMAGE_CACHE_ENTRIES) {
    const oldestKey = roundImageCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    roundImageCache.delete(oldestKey);
  }
}

function contentTypeFor(source: string, advertised: string | null) {
  if (advertised && advertised.startsWith("image/")) return advertised.split(";", 1)[0];
  if (source.endsWith(".webp")) return "image/webp";
  if (source.endsWith(".jpg") || source.endsWith(".jpeg")) return "image/jpeg";
  if (source.endsWith(".gif")) return "image/gif";
  return "image/png";
}

async function loadRoundImage(source: string): Promise<CachedRoundImage> {
  if (source.startsWith("/")) {
    const publicRoot = path.resolve(process.cwd(), "public");
    const resolved = path.resolve(publicRoot, source.replace(/^\/+/, ""));
    if (!resolved.startsWith(`${publicRoot}${path.sep}`) && resolved !== publicRoot) {
      throw new Error("Round image path is outside public assets.");
    }
    const bytes = await readFile(resolved);
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Round image exceeds the size limit.");
    return { bytes, contentType: contentTypeFor(source, null), createdAt: Date.now() };
  }

  const url = new URL(source);
  if (url.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.has(url.hostname)) {
    throw new Error("Round image host is not allowed.");
  }
  const upstream = await fetch(url, { cache: "force-cache", redirect: "follow" });
  if (!upstream.ok) throw new Error(`Upstream image returned ${upstream.status}.`);
  const advertisedLength = Number(upstream.headers.get("content-length"));
  if (Number.isFinite(advertisedLength) && advertisedLength > MAX_IMAGE_BYTES) {
    throw new Error("Round image exceeds the size limit.");
  }
  const bytes = Buffer.from(await upstream.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Round image exceeds the size limit.");
  return {
    bytes,
    contentType: contentTypeFor(source, upstream.headers.get("content-type")),
    createdAt: Date.now(),
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limited = rateLimitRequest(request, "round-image", requestPlayerIdentity(request, searchParams), 60);
  if (limited) return limited;

  const roundId = searchParams.get("roundId");
  if (!roundId || roundId.length > 240 || !isGameId(roundId.split(":", 1)[0])) {
    return NextResponse.json({ error: "Invalid round image." }, { status: 400 });
  }

  const live = liveRoundForRoundId(roundId);
  if (!live) return NextResponse.json({ error: "That round is no longer active." }, { status: 409 });
  const { room, round } = live;
  if (round.id !== roundId || round.game !== "fogged-vision" || round.phase !== "answering") {
    return NextResponse.json({ error: "That round is no longer active." }, { status: 409 });
  }

  const question = GAME_CATALOGS[room.gameId].questions.find((candidate) => candidate.id === round.questionId);
  const source = question?.image?.src;
  if (!source) return NextResponse.json({ error: "Round image not found." }, { status: 404 });

  try {
    const now = Date.now();
    const stage = fogStage(round, now);
    const cacheKey = `${roundId}:${stage}`;
    pruneImageCache(now);
    let cached = roundImageCache.get(cacheKey);
    if (!cached || now - cached.createdAt >= IMAGE_CACHE_TTL_MS) {
      const original = await loadRoundImage(source);
      const obscured = await obscurePortrait(original.bytes, stage);
      cached = { bytes: obscured, contentType: "image/png", createdAt: now };
      roundImageCache.set(cacheKey, cached);
    }
    return new NextResponse(new Uint8Array(cached.bytes), {
      status: 200,
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "private, max-age=8",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": 'inline; filename="portrait"',
      },
    });
  } catch (error) {
    logServerError("round-image.proxy", error, { roundId: roundId.slice(0, 160) });
    return NextResponse.json({ error: "Round image unavailable." }, { status: 502 });
  }
}
