import { useEffect } from "react";
import { shouldHandleAnswerShortcut } from "@/lib/answer-shortcuts.mjs";
import { preventQuestionClipboard, shouldBlockQuestionClipboard } from "@/lib/question-guard.mjs";
import { isPublicKeyedAnswerQuestion } from "@/lib/public-question";
import { type GamePhase } from "./shared";
import type { useRoundRefs } from "./use-round-refs";

export function useAnswerShortcuts({
  phase,
  phaseRef,
  currentQuestionRef,
  chooseAnswer,
}: Pick<ReturnType<typeof useRoundRefs>, "phaseRef" | "currentQuestionRef"> & {
  phase: GamePhase;
  chooseAnswer: (answerIndex: number) => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shouldHandleAnswerShortcut(event)) return;

      if (phaseRef.current === "answering") {
        if (currentQuestionRef.current && isPublicKeyedAnswerQuestion(currentQuestionRef.current)) return;
        const keyMap: Record<string, number> = {
          "1": 0,
          a: 0,
          "2": 1,
          b: 1,
          "3": 2,
          c: 2,
          "4": 3,
          d: 3,
        };
        // A non-Latin layout (Russian) reports its own letter, so read the physical key there.
        const key = /^[\x00-\x7f]$/.test(event.key) ? event.key : (event.code ?? "").replace(/^Key/, "");
        const answerIndex = keyMap[key.toLowerCase()];
        if (answerIndex !== undefined) {
          event.preventDefault();
          chooseAnswer(answerIndex);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [chooseAnswer]);

  useEffect(() => {
    if (!shouldBlockQuestionClipboard(phase)) return;
    const block = (event: ClipboardEvent) => preventQuestionClipboard(event);
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    return () => {
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
    };
  }, [phase]);
}
