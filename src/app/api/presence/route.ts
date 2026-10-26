import { NextResponse, type NextRequest } from "next/server";
import { rateLimitRequest } from "@/lib/api-protection";
import { lobbyPulseSnapshot } from "@/lib/lobby-pulse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rateLimited = rateLimitRequest(request, "presence", "public-room", 600, 600);
  if (rateLimited) return rateLimited;
  return NextResponse.json(lobbyPulseSnapshot(), { headers: { "Cache-Control": "no-store" } });
}
