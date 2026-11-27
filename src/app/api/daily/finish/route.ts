import { NextResponse, type NextRequest } from "next/server";
import { preflightRateLimit, readJsonBody, requestOriginAllowed } from "@/lib/api-protection";
import { getDailyCounts, recordDailyCounts } from "@/lib/alpha-store";
import {
  dailyFinishMetrics,
  dailyTotal,
  isDailyPoints,
  isOpenDailyNumber,
  summarizeDailyCounts,
} from "@/lib/daily.mjs";
import { logServerError } from "@/lib/server-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A finished daily. The browser says whether it also finished yesterday's daily, so the
 * server can count next-day returns without linking visits. Only counts are stored.
 */
export async function POST(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const limited = preflightRateLimit(request, "daily-finish", 30);
  if (limited) return limited;
  const parsed = await readJsonBody(request);
  if ("response" in parsed) return parsed.response;
  const body = (parsed.body ?? {}) as Record<string, unknown>;
  const { day, points, playedYesterday, streak } = body;
  if (
    typeof day !== "number" ||
    !isOpenDailyNumber(day) ||
    !isDailyPoints(points) ||
    typeof playedYesterday !== "boolean" ||
    typeof streak !== "number" ||
    !Number.isInteger(streak) ||
    streak < 1 ||
    streak > 100_000
  ) {
    return NextResponse.json({ error: "Invalid daily result." }, { status: 400 });
  }
  try {
    await recordDailyCounts(day, dailyFinishMetrics({ points, playedYesterday, streak }));
    const counts = (await getDailyCounts(day, day))[day] ?? {};
    return NextResponse.json(
      { summary: summarizeDailyCounts(counts, dailyTotal(points)) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logServerError("daily.finish", error, { day });
    return NextResponse.json({ error: "Daily figures unavailable." }, { status: 503 });
  }
}
