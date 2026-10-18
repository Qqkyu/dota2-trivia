import { useRef } from "react";
import { type PublicArcadeQuestion } from "@/lib/public-question";
import { type GamePhase } from "./shared";

/** Refs read by both the audio hook and the room hook. */
export function useRoundRefs() {
  const phaseRef = useRef<GamePhase>("lobby");

  const currentQuestionRef = useRef<PublicArcadeQuestion | null>(null);

  const roundIdRef = useRef("");

  return { phaseRef, currentQuestionRef, roundIdRef };
}
