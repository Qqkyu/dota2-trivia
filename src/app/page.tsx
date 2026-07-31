import { QueueArcade } from "@/components/queue-arcade";
import { DEFAULT_ARCADE_MODE, resolveArcadeMode } from "@/lib/arcade-navigation.mjs";
import { DEFAULT_GAME_ID, GAME_CATALOGS } from "@/lib/game-catalogs";

interface HomeProps {
  searchParams: Promise<{ mode?: string | string[] }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const mode = resolveArcadeMode(params.mode, GAME_CATALOGS[DEFAULT_GAME_ID].modes, DEFAULT_ARCADE_MODE);

  return <QueueArcade key={mode} initialMode={mode} />;
}
