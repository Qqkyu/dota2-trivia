import type { Metadata } from "next";
import { QueueArcade } from "@/components/queue-arcade";
import { publicGameInfo } from "@/lib/game-catalogs";
import { formatPreviewsFromQuestions } from "@/lib/format-preview.mjs";
import { triviaQuestions } from "@/lib/trivia";

const formatPreviews = formatPreviewsFromQuestions(triviaQuestions);

export const metadata: Metadata = {
  title: "Party",
  robots: { index: false, follow: true },
};

export default function PartyPage() {
  return <QueueArcade partyStart gameInfo={publicGameInfo()} formatPreviews={formatPreviews} />;
}
