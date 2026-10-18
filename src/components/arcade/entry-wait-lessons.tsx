import clsx from "clsx";
import { ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { shouldHandleAnswerShortcut } from "@/lib/answer-shortcuts.mjs";
import { ENTRY_WAIT_TIP_LABEL, shuffleEntryWaitTips } from "@/lib/entry-wait-tips.mjs";
import type { PublicArcadeQuestion } from "@/lib/public-question";
import { LIVE_ROUND_HEADER_LABELS } from "@/lib/round-question-copy.mjs";
import { RoundMark } from "@/components/round-mark";
import { QuestionArtwork } from "./artwork";
import { HeroPicker } from "./hero-picker";
import { EMPTY_CROWD, LETTERS, WAIT_CHOICE_QUESTION, WAIT_HERO_QUESTION, WAIT_SHOP_QUESTION } from "./shared";
import { ShopkeeperStore } from "./shopkeeper-store";
import styles from "../queue-arcade.module.css";

export function ClassicChoiceBoard({ question, active }: { question: PublicArcadeQuestion; active: boolean }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!active || selectedIndex !== null) return;
    const onKey = (event: KeyboardEvent) => {
      if (!shouldHandleAnswerShortcut(event)) return;
      const letterIndex = (LETTERS as readonly string[]).indexOf(event.key.toUpperCase());
      const numIndex = ["1", "2", "3", "4"].indexOf(event.key);
      const index = letterIndex >= 0 ? letterIndex : numIndex;
      if (index < 0) return;
      event.preventDefault();
      setSelectedIndex(index);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, selectedIndex]);

  return (
    <div className={styles.entryWaitChoiceBoard} data-testid="entry-wait-keys-demo">
      <div className={styles.roundHeader}>
        <div>
          <span>Round 001</span>
          <i />
          <span className={styles.roundGameLabel}>
            <RoundMark game="trivia" />
            {LIVE_ROUND_HEADER_LABELS.trivia}
          </span>
          <i />
          <span>{question.category}</span>
        </div>
        <div className={styles.timer}>
          <Clock3 />
          <strong>15</strong>
        </div>
      </div>
      <div className={styles.questionBlock} data-testid="entry-wait-choice-prompt">
        <QuestionArtwork question={question} />
        <div className={styles.questionCopy}>
          <span>{question.eyebrow}</span>
          <h2>{question.prompt}</h2>
        </div>
      </div>
      <div className={styles.answers} role="group" aria-label="Answer choices">
        {question.answers.map((answer, index) => {
          const isSelected = selectedIndex === index;
          return (
            <button
              key={answer}
              type="button"
              data-testid="arcade-answer"
              className={clsx(
                styles.answer,
                isSelected && styles.answerLocked,
                selectedIndex !== null && !isSelected && styles.answerMuted,
              )}
              onClick={() => {
                if (selectedIndex === null) setSelectedIndex(index);
              }}
              disabled={selectedIndex !== null}
              aria-pressed={isSelected}
            >
              <span className={styles.answerKey}>{LETTERS[index]}</span>
              <span className={styles.answerText}>
                {answer}
                {isSelected ? <small>Your answer · locked</small> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EntryWaitLessons() {
  const [tips] = useState(() => shuffleEntryWaitTips());
  const [tipIndex, setTipIndex] = useState(0);
  const tipCount = tips.length;
  const tip = tips[tipIndex];

  const stepTip = useCallback(
    (delta: number) => {
      setTipIndex((index) => (index + delta + tipCount) % tipCount);
    },
    [tipCount],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepTip(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        stepTip(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepTip]);

  if (!tip) return null;

  return (
    <div className={styles.entryWaitCarousel} data-testid="entry-wait-tips" data-tip-count={tipCount}>
      <button
        type="button"
        className={styles.entryWaitTipButton}
        data-testid="entry-wait-prev-tip"
        aria-label="Previous tip"
        onClick={() => stepTip(-1)}
      >
        <ChevronLeft />
      </button>
      <div className={styles.entryWaitTipBar} data-testid="entry-wait-tip-bar">
        <article className={styles.entryWaitCard} data-testid="entry-wait-tip" data-tip={tip.id}>
          <div className={styles.entryWaitCardCopy}>
            <small>{ENTRY_WAIT_TIP_LABEL}</small>
            <p>
              {tip.mark && tip.body.includes(tip.mark) ? (
                <>
                  {tip.body.slice(0, tip.body.indexOf(tip.mark))}
                  <em>{tip.mark}</em>
                  {tip.body.slice(tip.body.indexOf(tip.mark) + tip.mark.length)}
                </>
              ) : (
                tip.body
              )}
            </p>
          </div>
          <div className={styles.entryWaitStage} data-testid="entry-wait-stage">
            <div
              className={styles.entryWaitPanel}
              data-panel="keys"
              data-active={tip.id === "keys" ? "true" : "false"}
              aria-hidden={tip.id !== "keys"}
              inert={tip.id !== "keys"}
            >
              <ClassicChoiceBoard question={WAIT_CHOICE_QUESTION} active={tip.id === "keys"} />
            </div>
            <div
              className={styles.entryWaitPanel}
              data-panel="heroes"
              data-testid="entry-wait-heroes-demo"
              data-active={tip.id === "heroes" ? "true" : "false"}
              aria-hidden={tip.id !== "heroes"}
              inert={tip.id !== "heroes"}
            >
              <HeroPicker
                question={WAIT_HERO_QUESTION}
                phase="answering"
                selectedKey={null}
                crowd={EMPTY_CROWD}
                onChoose={() => undefined}
              />
            </div>
            <div
              className={styles.entryWaitPanel}
              data-panel="shop"
              data-testid="entry-wait-shop-demo"
              data-active={tip.id === "shop" ? "true" : "false"}
              aria-hidden={tip.id !== "shop"}
              inert={tip.id !== "shop"}
            >
              <ShopkeeperStore
                question={WAIT_SHOP_QUESTION}
                phase="answering"
                selectedKey={null}
                crowd={EMPTY_CROWD}
                onChoose={() => undefined}
              />
            </div>
          </div>
        </article>
      </div>
      <button
        type="button"
        className={styles.entryWaitTipButton}
        data-testid="entry-wait-next-tip"
        aria-label="Next tip"
        onClick={() => stepTip(1)}
      >
        <ChevronRight />
      </button>
    </div>
  );
}
