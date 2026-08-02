import type { Metadata } from "next";
import { cookies } from "next/headers";
import { CalibrationDashboard } from "@/components/calibration-dashboard";
import { getUserBySession } from "@/lib/account-store";
import { getCalibrationSnapshot, publicCalibrationSnapshot } from "@/lib/calibration-data";
import { DEFAULT_GAME_ID, GAME_CATALOGS } from "@/lib/game-catalogs";
import { isQuestionReviewer } from "@/lib/question-review";
import { ACCOUNT_SESSION_COOKIE, sessionTokenHash } from "@/lib/steam-auth.mjs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Calibration Lab",
  description: "Aggregate Queue Arcade question accuracy and player reports.",
};

export default async function CalibrationPage() {
  const catalog = GAME_CATALOGS[DEFAULT_GAME_ID];
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCOUNT_SESSION_COOKIE)?.value;
  const [snapshot, user] = await Promise.all([
    getCalibrationSnapshot(DEFAULT_GAME_ID),
    token ? getUserBySession(sessionTokenHash(token)).catch(() => null) : Promise.resolve(null),
  ]);
  const canReview = isQuestionReviewer(user);
  return (
    <CalibrationDashboard
      snapshot={canReview ? snapshot : publicCalibrationSnapshot(snapshot)}
      logoUrl={catalog.logoUrl}
      canReview={canReview}
    />
  );
}
