import { NextResponse } from "next/server";
import { getAccountStoreHealth } from "@/lib/account-store";
import { getAlphaStoreHealth } from "@/lib/alpha-store";
import { configuredApplicationOrigin, configuredAuthSecret, configuredDataCountries } from "@/lib/auth-session";
import { DEFAULT_GAME_ID, GAME_CATALOGS } from "@/lib/game-catalogs";
import { configuredReviewerSteamIds, invalidReviewerSteamIds } from "@/lib/question-review";
import { logServerError } from "@/lib/server-diagnostics";
import { getVoteStoreHealth } from "@/lib/vote-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const catalog = GAME_CATALOGS[DEFAULT_GAME_ID];
  try {
    if (process.env.NODE_ENV === "production" && !process.env.ARCADE_VOTER_SALT?.trim()) {
      throw new Error("ARCADE_VOTER_SALT is required in production.");
    }
    configuredAuthSecret();
    configuredApplicationOrigin(request);
    configuredDataCountries();
    if (invalidReviewerSteamIds().length) throw new Error("ARCADE_REVIEWER_STEAM_IDS contains an invalid SteamID.");
    if (
      process.env.NODE_ENV === "production" &&
      !process.env.DATABASE_URL?.trim() &&
      process.env.ARCADE_ALLOW_FILE_STORE !== "true"
    ) {
      throw new Error("Production file storage requires an explicit ARCADE_ALLOW_FILE_STORE=true opt-in.");
    }
    const [storage, accounts, alpha] = await Promise.all([
      getVoteStoreHealth(),
      getAccountStoreHealth(),
      getAlphaStoreHealth(),
    ]);
    return NextResponse.json(
      {
        status: "ready",
        storage,
        accounts,
        alpha,
        steam: { profileEnrichment: Boolean(process.env.STEAM_WEB_API_KEY?.trim()) },
        reviews: { reviewersConfigured: configuredReviewerSteamIds().length },
        content: {
          gameId: catalog.id,
          version: catalog.contentVersion,
          questions: catalog.questions.length,
        },
        serverNow: Date.now(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logServerError("health.readiness", error);
    return NextResponse.json(
      { status: "unavailable", storage: { backend: process.env.DATABASE_URL ? "postgres" : "file", ok: false } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
