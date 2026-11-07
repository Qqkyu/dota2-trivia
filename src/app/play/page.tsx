import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { QueueArcade } from "@/components/queue-arcade";
import { getTranslator } from "@/i18n/server";
import { PUBLIC_ARCADE_PATH } from "@/lib/arcade-navigation.mjs";
import { publicGameInfo } from "@/lib/game-catalogs";
import { localizedFormatPreviews } from "@/lib/format-preview-locale";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("meta.play.title"), robots: { index: false, follow: true } };
}

interface PlayProps {
  searchParams: Promise<{ mode?: string | string[]; room?: string | string[] }>;
}

export default async function Play({ searchParams }: PlayProps) {
  const params = await searchParams;
  const roomCode = typeof params.room === "string" ? params.room : undefined;
  if (params.mode !== undefined) {
    redirect(roomCode ? `${PUBLIC_ARCADE_PATH}?room=${encodeURIComponent(roomCode)}` : PUBLIC_ARCADE_PATH);
  }

  return (
    <QueueArcade
      autoStart={!roomCode}
      roomCode={roomCode}
      gameInfo={publicGameInfo()}
      formatPreviews={localizedFormatPreviews(await getLocale())}
    />
  );
}
