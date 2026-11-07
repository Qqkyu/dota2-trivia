import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { CalibrationDashboard } from "@/components/calibration-dashboard";
import { SiteChrome } from "@/components/site-chrome";
import { getLocale, getTranslator } from "@/i18n/server";
import { getUserBySession } from "@/lib/account-store";
import {
  getCalibrationSnapshot,
  getSharedCalibrationSnapshot,
  publicCalibrationSnapshot,
} from "@/lib/calibration-data";
import { DEFAULT_GAME_ID, GAME_CATALOGS } from "@/lib/game-catalogs";
import { isQuestionReviewer } from "@/lib/question-review";
import { consumeRateLimit, rateLimitDisabled, requestClientAddress } from "@/lib/rate-limit.mjs";
import { ACCOUNT_SESSION_COOKIE, sessionTokenHash } from "@/lib/steam-auth.mjs";
import { anonymousVoterHash } from "@/lib/voter-hash";
import styles from "../privacy/privacy.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return {
    title: t("meta.calibration.title"),
    description: t("meta.calibration.description"),
    robots: { index: false, follow: true },
  };
}

// The page renders every question in the catalog, so public loads are capped per
// address and in total. Reviewers are not limited.
const PUBLIC_LOADS_PER_ADDRESS = 20;
const PUBLIC_LOADS_TOTAL = 60;

async function publicLoadAllowed() {
  if (rateLimitDisabled()) return true;
  const address = requestClientAddress({ headers: await headers() } as unknown as Request);
  const perAddress = consumeRateLimit({
    scope: "calibration-page:ip",
    key: anonymousVoterHash("rate-limit:calibration-page:ip", address),
    limit: PUBLIC_LOADS_PER_ADDRESS,
  });
  if (!perAddress.allowed) return false;
  return consumeRateLimit({ scope: "calibration-page:all", key: "all", limit: PUBLIC_LOADS_TOTAL }).allowed;
}

export default async function CalibrationPage() {
  const catalog = GAME_CATALOGS[DEFAULT_GAME_ID];
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCOUNT_SESSION_COOKIE)?.value;
  const user = token ? await getUserBySession(sessionTokenHash(token)).catch(() => null) : null;
  const canReview = isQuestionReviewer(user);
  if (!canReview && !(await publicLoadAllowed())) {
    const t = await getTranslator();
    return (
      <SiteChrome current="calibration">
        <main className={styles.page} data-testid="calibration-busy">
          <h1>{t("calibration.busy.title")}</h1>
          <p className={styles.intro}>{t("calibration.busy.body")}</p>
        </main>
      </SiteChrome>
    );
  }
  const snapshot = canReview
    ? await getCalibrationSnapshot(DEFAULT_GAME_ID)
    : await getSharedCalibrationSnapshot(DEFAULT_GAME_ID);
  return (
    <CalibrationDashboard
      snapshot={canReview ? snapshot : publicCalibrationSnapshot(snapshot, await getLocale())}
      logoUrl={catalog.logoUrl}
      canReview={canReview}
    />
  );
}
