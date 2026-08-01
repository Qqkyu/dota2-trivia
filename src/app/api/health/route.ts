import { NextResponse } from "next/server";
import { DEFAULT_GAME_ID, GAME_CATALOGS } from "@/lib/game-catalogs";
import { getVoteStoreHealth } from "@/lib/vote-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const catalog = GAME_CATALOGS[DEFAULT_GAME_ID];
  try {
    if (process.env.NODE_ENV === "production" && !process.env.ARCADE_VOTER_SALT?.trim()) {
      throw new Error("ARCADE_VOTER_SALT is required in production.");
    }
    if (
      process.env.NODE_ENV === "production" &&
      !process.env.DATABASE_URL?.trim() &&
      process.env.ARCADE_ALLOW_FILE_STORE !== "true"
    ) {
      throw new Error("Production file storage requires an explicit ARCADE_ALLOW_FILE_STORE=true opt-in.");
    }
    const storage = await getVoteStoreHealth();
    return NextResponse.json(
      {
        status: "ready",
        storage,
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
    console.error("Queue Arcade readiness check failed.", error);
    return NextResponse.json(
      { status: "unavailable", storage: { backend: process.env.DATABASE_URL ? "postgres" : "file", ok: false } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
