import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { QueueArcade } from "@/components/queue-arcade";
import { publicGameInfo } from "@/lib/game-catalogs";
import { localizedFormatPreviews } from "@/lib/format-preview-locale";
import { getLocale } from "@/i18n/server";
import { lobbyPulseSnapshot } from "@/lib/lobby-pulse";

// Canonical for the lobby only; every other page sets its own or opts out of indexing.
export const metadata: Metadata = { alternates: { canonical: "/" } };

interface HomeProps {
  searchParams: Promise<{ mode?: string | string[] }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  if (params.mode !== undefined) redirect("/");

  return (
    <QueueArcade
      gameInfo={publicGameInfo()}
      formatPreviews={localizedFormatPreviews(await getLocale())}
      initialPulse={lobbyPulseSnapshot()}
    />
  );
}
