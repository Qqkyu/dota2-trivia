import { NextResponse, type NextRequest } from "next/server";
import { preflightRateLimit } from "@/lib/api-protection";
import { getDailyCounts } from "@/lib/alpha-store";
import { DAILY_MAX_POINTS, isOpenDailyNumber, summarizeDailyCounts } from "@/lib/daily.mjs";
import { logServerError } from "@/lib/server-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Today's figures for a player who already finished, without counting them again. */
export async function GET(request: NextRequest) {
  const limited = preflightRateLimit(request, "daily-summary", 60);
  if (limited) return limited;
  const params = request.nextUrl.searchParams;
  const day = Number(params.get("day"));
  const total = Number(params.get("total"));
  if (!isOpenDailyNumber(day) || !Number.isInteger(total) || total < 0 || total > DAILY_MAX_POINTS) {
    return NextResponse.json({ error: "Invalid daily." }, { status: 400 });
  }
  try {
    const counts = (await getDailyCounts(day, day))[day] ?? {};
    return NextResponse.json(
      { summary: summarizeDailyCounts(counts, total) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logServerError("daily.summary", error, { day });
    return NextResponse.json({ error: "Daily figures unavailable." }, { status: 503 });
  }
}
