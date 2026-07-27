import { NextResponse } from "next/server";
import { getCalibrationSnapshot } from "@/lib/calibration-data";
import { DEFAULT_GAME_ID, isGameId } from "@/lib/game-catalogs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const candidate = new URL(request.url).searchParams.get("gameId") ?? DEFAULT_GAME_ID;
  if (!isGameId(candidate)) {
    return NextResponse.json({ error: "Unknown game catalog." }, { status: 400 });
  }

  try {
    return NextResponse.json(await getCalibrationSnapshot(candidate), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Could not build calibration snapshot.", error);
    return NextResponse.json({ error: "Calibration data unavailable." }, { status: 503 });
  }
}
