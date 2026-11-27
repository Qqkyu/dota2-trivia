import type { Metadata } from "next";
import { DailyArcade } from "@/components/daily/daily-arcade";
import { SiteChrome } from "@/components/site-chrome";
import { getTranslator } from "@/i18n/server";
import { DAILY_ARCADE_PATH } from "@/lib/arcade-navigation.mjs";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("meta.daily.title"), alternates: { canonical: DAILY_ARCADE_PATH } };
}

export default function DailyPage() {
  // The share text links back here, so it must name the public address.
  const siteUrl = (process.env.ARCADE_APP_URL?.trim() || "https://queuearcade.com").replace(/\/$/, "");
  return (
    <SiteChrome>
      <DailyArcade siteUrl={siteUrl} />
    </SiteChrome>
  );
}
