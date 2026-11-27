import { NextResponse, type NextRequest } from "next/server";
import { preflightRateLimit, readJsonBody, requestOriginAllowed } from "@/lib/api-protection";
import { recordDailyCounts } from "@/lib/alpha-store";
import { dailyRoundPayload, gradeDailyAnswer } from "@/lib/daily-deck";
import { dailyRoundMetrics, isDailySlot, isDailyStage, isOpenDailyNumber } from "@/lib/daily.mjs";
import { requestLocale, translatorFor } from "@/i18n/server";
import { logServerError } from "@/lib/server-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Check one daily answer on the server, then send the round with its answer. The player
 * gets one answer per round; the browser keeps the result, as the daily has no account.
 */
export async function POST(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const limited = preflightRateLimit(request, "daily-answer", 120);
  if (limited) return limited;
  const parsed = await readJsonBody(request);
  if ("response" in parsed) return parsed.response;
  const body = (parsed.body ?? {}) as Record<string, unknown>;
  const { day, slot, stage } = body;
  if (
    typeof day !== "number" ||
    !isOpenDailyNumber(day) ||
    typeof slot !== "number" ||
    !isDailySlot(slot) ||
    typeof stage !== "number" ||
    !isDailyStage(stage)
  ) {
    return NextResponse.json({ error: "Invalid daily answer." }, { status: 400 });
  }
  const answer = {
    ...(typeof body.answerIndex === "number" ? { answerIndex: body.answerIndex } : {}),
    ...(typeof body.answerKey === "string" ? { answerKey: body.answerKey } : {}),
    ...(typeof body.value === "number" ? { value: body.value } : {}),
  };
  const locale = requestLocale(request);
  const t = translatorFor(locale);
  try {
    const result = gradeDailyAnswer(day, slot, stage as 1 | 2 | 3, answer);
    if (!result) return NextResponse.json({ error: "Invalid daily answer." }, { status: 400 });
    const round = dailyRoundPayload(
      day,
      slot,
      3,
      locale,
      {
        hiddenHero: t("question.hiddenHero"),
        spellLink: t("question.spellLink"),
      },
      true,
    );
    try {
      await recordDailyCounts(day, dailyRoundMetrics(slot, result.points));
    } catch (error) {
      // The count is for the owner's figures only; the player still gets the result.
      logServerError("daily.answer.count", error, { day, slot });
    }
    return NextResponse.json({ ...result, round }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logServerError("daily.answer", error, { day, slot });
    return NextResponse.json({ error: "Daily unavailable." }, { status: 503 });
  }
}
