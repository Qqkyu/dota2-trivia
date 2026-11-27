import { NextResponse, type NextRequest } from "next/server";
import { preflightRateLimit } from "@/lib/api-protection";
import { dailyRoundPayload } from "@/lib/daily-deck";
import { isDailySlot, isDailyStage, isOpenDailyNumber } from "@/lib/daily.mjs";
import { requestLocale, translatorFor } from "@/i18n/server";
import { logServerError } from "@/lib/server-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One daily round at the clue stage the player has opened. The answer is never in it. */
export async function GET(request: NextRequest) {
  const limited = preflightRateLimit(request, "daily-round", 240);
  if (limited) return limited;
  const params = request.nextUrl.searchParams;
  const day = Number(params.get("day"));
  const slot = Number(params.get("slot"));
  const stage = Number(params.get("stage") ?? "1");
  if (!isOpenDailyNumber(day) || !isDailySlot(slot) || !isDailyStage(stage)) {
    return NextResponse.json({ error: "Invalid daily round." }, { status: 400 });
  }
  const locale = requestLocale(request);
  const t = translatorFor(locale);
  try {
    const round = dailyRoundPayload(
      day,
      slot,
      stage as 1 | 2 | 3,
      locale,
      {
        hiddenHero: t("question.hiddenHero"),
        spellLink: t("question.spellLink"),
      },
      false,
    );
    return NextResponse.json({ round }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logServerError("daily.round", error, { day, slot });
    return NextResponse.json({ error: "Daily unavailable." }, { status: 503 });
  }
}
