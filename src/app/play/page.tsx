import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { QueueArcade } from "@/components/queue-arcade";
import { PUBLIC_ARCADE_PATH } from "@/lib/arcade-navigation.mjs";
import { publicGameInfo } from "@/lib/game-catalogs";

export const metadata: Metadata = {
  title: "Play",
};

interface PlayProps {
  searchParams: Promise<{ mode?: string | string[] }>;
}

export default async function Play({ searchParams }: PlayProps) {
  const params = await searchParams;
  if (params.mode !== undefined) redirect(PUBLIC_ARCADE_PATH);

  return <QueueArcade autoStart gameInfo={publicGameInfo()} />;
}
