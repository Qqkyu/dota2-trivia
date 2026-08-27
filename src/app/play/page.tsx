import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { QueueArcade } from "@/components/queue-arcade";
import { PUBLIC_ARCADE_PATH } from "@/lib/arcade-navigation.mjs";
import { publicGameInfo } from "@/lib/game-catalogs";

export const metadata: Metadata = {
  title: "Play",
};

interface PlayProps {
  searchParams: Promise<{ mode?: string | string[]; room?: string | string[] }>;
}

export default async function Play({ searchParams }: PlayProps) {
  const params = await searchParams;
  const roomCode = typeof params.room === "string" ? params.room : undefined;
  if (params.mode !== undefined) {
    redirect(roomCode ? `${PUBLIC_ARCADE_PATH}?room=${encodeURIComponent(roomCode)}` : PUBLIC_ARCADE_PATH);
  }

  return <QueueArcade autoStart={!roomCode} roomCode={roomCode} gameInfo={publicGameInfo()} />;
}
