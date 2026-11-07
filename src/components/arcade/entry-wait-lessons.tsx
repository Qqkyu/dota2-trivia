import { categoryLabel } from "@/i18n/category";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { splitAccent } from "@/i18n/format.mjs";
import { useLocale } from "@/i18n/provider";
import { shouldHandleAnswerShortcut } from "@/lib/answer-shortcuts.mjs";
import { shuffleEntryWaitTips } from "@/lib/entry-wait-tips.mjs";
import type { PublicArcadeQuestion } from "@/lib/public-question";
import { RoundMark } from "@/components/round-mark";
import { QuestionArtwork } from "./artwork";
import { HeroPicker } from "./hero-picker";
import { EMPTY_CROWD, LETTERS, WAIT_HERO_QUESTION, WAIT_SHOP_QUESTION, waitChoiceQuestion } from "./shared";
import { ShopkeeperStore } from "./shopkeeper-store";
import styles from "../queue-arcade.module.css";
import own from "./entry-wait-lessons.module.css";

export function ClassicChoiceBoard({ question, active }: { question: PublicArcadeQuestion; active: boolean }) {
  const { t } = useLocale();
  const [pick, setPick] = useState<{ index: number; active: boolean } | null>(null);
  // A pick made while this tip was active clears itself when the tip changes or after a short beat.
  const selectedIndex = pick && pick.active === active ? pick.index : null;
  const setSelectedIndex = useCallback(
    (index: number | null) => setPick(index === null ? null : { index, active }),
    [active],
  );

  useEffect(() => {
    if (selectedIndex === null) return;
    const reset = window.setTimeout(() => setPick(null), 1_800);
    return () => window.clearTimeout(reset);
  }, [selectedIndex]);

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
  }, [active, selectedIndex, setSelectedIndex]);

  return (
    <div className={styles.entryWaitChoiceBoard} data-testid="entry-wait-keys-demo" data-practice="true">
      <div className={styles.roundHeader}>
        <div>
          <span className={own.practiceLabel}>{t("wait.practice")}</span>
          <i />
          <span className={styles.roundGameLabel}>
            <RoundMark game="trivia" />
            {t("game.trivia.label")}
          </span>
          <i />
          <span>{categoryLabel(t, question.category)}</span>
        </div>
        <div className={own.practiceTag} data-testid="entry-wait-practice-tag">
          <Clock3 />
          {t("wait.notLive")}
        </div>
      </div>
      <div className={styles.questionBlock} data-testid="entry-wait-choice-prompt">
        <QuestionArtwork question={question} />
        <div className={styles.questionCopy}>
          <span>{question.eyebrow}</span>
          <h2>{question.prompt}</h2>
        </div>
      </div>
      <div className={styles.answers} role="group" aria-label={t("wait.practiceChoices")}>
        {question.answers.map((answer, index) => {
          const isSelected = selectedIndex === index;
          return (
            <button
              key={answer}
              type="button"
              data-testid="practice-answer"
              className={clsx(
                styles.answer,
                isSelected && own.practicePicked,
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
                {isSelected ? <small>{t("wait.picked")}</small> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EntryWaitLessons() {
  const { t, number } = useLocale();
  const choiceQuestion = useMemo(() => waitChoiceQuestion(t, number), [t, number]);
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

  const body = splitAccent(t(tip.body, { field: t("round.shop.searchPlaceholder") }));

  return (
    <div className={own.entryWaitCarousel} data-testid="entry-wait-tips" data-tip-count={tipCount}>
      <button
        type="button"
        className={own.entryWaitTipButton}
        data-testid="entry-wait-prev-tip"
        aria-label={t("wait.previousTip")}
        onClick={() => stepTip(-1)}
      >
        <ChevronLeft />
      </button>
      <div className={own.entryWaitTipBar} data-testid="entry-wait-tip-bar">
        <article className={own.entryWaitCard} data-testid="entry-wait-tip" data-tip={tip.id}>
          <div className={own.entryWaitCardCopy}>
            <small>{t("wait.tipLabel")}</small>
            <p>
              {body.before}
              {body.accent ? <em>{body.accent}</em> : null}
              {body.after}
            </p>
          </div>
          <div className={own.entryWaitStage} data-testid="entry-wait-stage">
            <div
              className={styles.entryWaitPanel}
              data-panel="keys"
              data-active={tip.id === "keys" ? "true" : "false"}
              aria-hidden={tip.id !== "keys"}
              inert={tip.id !== "keys"}
            >
              <ClassicChoiceBoard question={choiceQuestion} active={tip.id === "keys"} />
            </div>
            <div
              className={styles.entryWaitPanel}
              data-panel="heroes"
              data-testid="entry-wait-heroes-demo"
              data-active={tip.id === "heroes" ? "true" : "false"}
              aria-hidden={tip.id !== "heroes"}
              inert={tip.id !== "heroes"}
            >
              {/* Mounted only while shown: both grids at once put 238 images on
                  the wire during the wait and starved the room sync on 3G. */}
              {tip.id === "heroes" && (
                <HeroPicker
                  question={WAIT_HERO_QUESTION}
                  phase="answering"
                  selectedKey={null}
                  crowd={EMPTY_CROWD}
                  onChoose={() => undefined}
                />
              )}
            </div>
            <div
              className={styles.entryWaitPanel}
              data-panel="shop"
              data-testid="entry-wait-shop-demo"
              data-active={tip.id === "shop" ? "true" : "false"}
              aria-hidden={tip.id !== "shop"}
              inert={tip.id !== "shop"}
            >
              {tip.id === "shop" && (
                <ShopkeeperStore
                  question={WAIT_SHOP_QUESTION}
                  phase="answering"
                  selectedKey={null}
                  crowd={EMPTY_CROWD}
                  onChoose={() => undefined}
                />
              )}
            </div>
          </div>
        </article>
      </div>
      <button
        type="button"
        className={own.entryWaitTipButton}
        data-testid="entry-wait-next-tip"
        aria-label={t("wait.nextTip")}
        onClick={() => stepTip(1)}
      >
        <ChevronRight />
      </button>
    </div>
  );
}
