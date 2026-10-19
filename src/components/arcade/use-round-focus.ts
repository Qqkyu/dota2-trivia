import { useEffect, useRef, useState } from "react";
import { type PublicArcadeQuestion } from "@/lib/public-question";
import { type GamePhase } from "./shared";

import type { RefObject } from "react";

export function useRoundFocus({
  phase,
  currentQuestion,
  activeRoundId,
  roundIndex,
  roundStageRef,
  roundHeadingRef,
  reportFocusRef,
}: {
  phase: GamePhase;
  currentQuestion: PublicArcadeQuestion | null;
  activeRoundId: string;
  roundIndex: number;
  roundStageRef: RefObject<HTMLDivElement | null>;
  roundHeadingRef: RefObject<HTMLHeadingElement | null>;
  reportFocusRef: RefObject<string | null>;
}) {
  const [roundAnnouncement, setRoundAnnouncement] = useState<{ id: string; text: string } | null>(null);

  const lastRoundControlRef = useRef<HTMLElement | null>(null);

  const announcedRoundRef = useRef<string | null>(null);

  const scrollToRoundRef = useRef<string | null>(null);

  useEffect(() => {
    const rememberControl = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target === document.body) return;
      lastRoundControlRef.current =
        roundStageRef.current?.contains(target) && target.matches("button, input, select, textarea") ? target : null;
    };
    const clearOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !roundStageRef.current?.contains(event.target))
        lastRoundControlRef.current = null;
    };
    document.addEventListener("focusin", rememberControl);
    document.addEventListener("pointerdown", clearOutsideClick);
    return () => {
      document.removeEventListener("focusin", rememberControl);
      document.removeEventListener("pointerdown", clearOutsideClick);
    };
  }, []);

  useEffect(() => {
    if (phase === "lobby" || phase === "waiting") {
      announcedRoundRef.current = null;
      return;
    }
    if (phase !== "answering" || !currentQuestion || currentQuestion.id !== activeRoundId) return;
    if (announcedRoundRef.current === activeRoundId) return;
    announcedRoundRef.current = activeRoundId;
    setRoundAnnouncement({ id: activeRoundId, text: `Round ${roundIndex + 1}. ${currentQuestion.prompt}` });
  }, [activeRoundId, currentQuestion, phase, roundIndex]);

  useEffect(() => {
    if (phase !== "answering" || currentQuestion?.id !== activeRoundId || scrollToRoundRef.current !== activeRoundId)
      return;
    scrollToRoundRef.current = null;
    const focused = document.activeElement;
    if (
      focused instanceof HTMLElement &&
      (focused.closest('[data-testid="private-room-play-dock"], [data-testid="report-carryover"]') ||
        (focused.matches('input, textarea, select, [contenteditable="true"]') &&
          !roundStageRef.current?.contains(focused)))
    )
      return;
    if (reportFocusRef.current) return;
    const previousControl = lastRoundControlRef.current;
    if (
      focused === document.body &&
      previousControl &&
      (!previousControl.isConnected || previousControl.matches(":disabled"))
    ) {
      lastRoundControlRef.current = null;
      roundHeadingRef.current?.focus({ preventScroll: true });
    }
    const stage = roundStageRef.current;
    const prompt = stage?.querySelector<HTMLElement>('[data-testid="round-prompt"] h2');
    const timer = stage?.querySelector<HTMLElement>('[data-testid="round-timer"]');
    if (!stage || !prompt || !timer) return;
    const promptBounds = prompt.getBoundingClientRect();
    const timerBounds = timer.getBoundingClientRect();
    if (promptBounds.top < timerBounds.bottom || promptBounds.bottom > window.innerHeight || timerBounds.top < 0) {
      stage.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
    }
  }, [activeRoundId, currentQuestion?.id, phase]);

  return {
    roundAnnouncement,
    scrollToRoundRef,
  };
}
