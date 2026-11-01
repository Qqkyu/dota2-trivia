import Image from "next/image";
import {
  AudioLines,
  AudioWaveform,
  Brain,
  Gem,
  History,
  ListOrdered,
  MessageSquareQuote,
  ScanEye,
  ShoppingBag,
  Shuffle,
  WandSparkles,
} from "lucide-react";
import type { ArcadeMode, RoundGame } from "@/lib/trivia";
import styles from "../queue-arcade.module.css";
import { firstPartyArtSrc } from "@/lib/steam-art.mjs";

export function ModeIcon({ mode }: { mode: ArcadeMode | RoundGame }) {
  if (mode === "mixed") return <Shuffle />;
  if (mode === "shopkeeper") return <ShoppingBag />;
  if (mode === "spell-link") return <WandSparkles />;
  if (mode === "fogged-vision") return <ScanEye />;
  if (mode === "echo-hunt") return <AudioLines />;
  if (mode === "soundcheck") return <AudioWaveform />;
  if (mode === "quote-hunt") return <MessageSquareQuote />;
  if (mode === "aghanim-lab") return <Gem />;
  if (mode === "order-up") return <ListOrdered />;
  if (mode === "flashback") return <History />;
  return <Brain />;
}

export function BrandMark({ logoUrl }: { logoUrl: string }) {
  return (
    <span className={styles.brandMark} aria-hidden="true">
      <Image src={firstPartyArtSrc(logoUrl)} alt="" width={30} height={30} unoptimized />
    </span>
  );
}
