import type { Metadata } from "next";
import { QueueArcade } from "@/components/queue-arcade";
import { getTranslator } from "@/i18n/server";
import { publicGameInfo } from "@/lib/game-catalogs";
import { localizedFormatPreviews } from "@/lib/format-preview-locale";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("meta.party.title"), robots: { index: false, follow: true } };
}

export default async function PartyPage() {
  return (
    <QueueArcade partyStart gameInfo={publicGameInfo()} formatPreviews={localizedFormatPreviews(await getLocale())} />
  );
}
