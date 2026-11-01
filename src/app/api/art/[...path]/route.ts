import { NextResponse, type NextRequest } from "next/server";
import { preflightRateLimit } from "@/lib/api-protection";
import { logServerError } from "@/lib/server-diagnostics";
import { steamArtTarget } from "@/lib/steam-art.mjs";
import { cachedSteamArt } from "@/lib/steam-art-cache.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Valve art served from this site, so a visitor's browser never contacts Valve.
 * A hero grid alone is 127 icons and parties share one address, hence the high limit.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const limited = preflightRateLimit(request, "art", 6_000);
  if (limited) return limited;
  const [host, ...segments] = (await params).path ?? [];
  const target = steamArtTarget(host, segments, request.nextUrl.search);
  if (!target) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const art = await cachedSteamArt(target);
    return new NextResponse(new Uint8Array(art.bytes), {
      headers: {
        "Content-Type": art.contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logServerError("art.proxy", error, { host: String(host).slice(0, 60) });
    return NextResponse.json(
      { error: "Art unavailable." },
      { status: 502, headers: { "Cache-Control": "no-store", "Retry-After": "5" } },
    );
  }
}
