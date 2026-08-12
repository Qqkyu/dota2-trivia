import {
  AudioLines,
  AudioWaveform,
  Brain,
  Gem,
  ListOrdered,
  MessageSquareQuote,
  ScanEye,
  ShoppingBag,
  WandSparkles,
} from "lucide-react";

const ICONS = {
  trivia: Brain,
  shopkeeper: ShoppingBag,
  "spell-link": WandSparkles,
  "fogged-vision": ScanEye,
  "echo-hunt": AudioLines,
  soundcheck: AudioWaveform,
  "quote-hunt": MessageSquareQuote,
  "aghanim-lab": Gem,
  "order-up": ListOrdered,
} as const;

export function RoundMark({ game }: { game: string }) {
  const Icon = ICONS[game as keyof typeof ICONS] ?? Brain;
  return <Icon aria-hidden="true" />;
}
