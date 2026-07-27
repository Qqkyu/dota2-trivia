import type { Metadata } from "next";
import { CalibrationDashboard } from "@/components/calibration-dashboard";
import { getCalibrationSnapshot } from "@/lib/calibration-data";
import { DEFAULT_GAME_ID, GAME_CATALOGS } from "@/lib/game-catalogs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Calibration Lab",
  description: "Aggregate Queue Arcade question accuracy and player reports.",
};

export default async function CalibrationPage() {
  const catalog = GAME_CATALOGS[DEFAULT_GAME_ID];
  const snapshot = await getCalibrationSnapshot(DEFAULT_GAME_ID);
  return <CalibrationDashboard snapshot={snapshot} logoUrl={catalog.logoUrl} />;
}
