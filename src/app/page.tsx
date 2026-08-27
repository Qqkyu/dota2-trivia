import { redirect } from "next/navigation";
import { QueueArcade } from "@/components/queue-arcade";
import { publicGameInfo } from "@/lib/game-catalogs";
import { formatPreviewsFromQuestions } from "@/lib/format-preview.mjs";
import { triviaQuestions } from "@/lib/trivia";

const formatPreviews = formatPreviewsFromQuestions(triviaQuestions);

interface HomeProps {
  searchParams: Promise<{ mode?: string | string[] }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  if (params.mode !== undefined) redirect("/");

  return <QueueArcade gameInfo={publicGameInfo()} formatPreviews={formatPreviews} />;
}
