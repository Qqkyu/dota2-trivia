import Image from "next/image";
import { Check, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/i18n/provider";
import { shouldHandleAnswerShortcut } from "@/lib/answer-shortcuts.mjs";
import {
  flashbackYearAnswerKey,
  flashbackYearFromAnswerKey,
  isFlashbackOrderAnswerForQuestion,
} from "@/lib/flashback.mjs";
import type { PublicArcadeQuestion } from "@/lib/public-question";
import { valueOrderAnswerKey, valueOrderKeysFromAnswerKey } from "@/lib/value-order.mjs";
import { EMPTY_FLASHBACK_ORDER_CARDS, type GamePhase } from "./shared";
import styles from "../queue-arcade.module.css";
import own from "./flashback-boards.module.css";
import { firstPartyArtSrc } from "@/lib/steam-art.mjs";

export function FlashbackYearBoard({
  question,
  phase,
  selectedKey,
  onChoose,
}: {
  question: PublicArcadeQuestion;
  phase: GamePhase;
  selectedKey: string | null;
  onChoose: (answerKey: string) => void;
}) {
  const { t } = useLocale();
  const yearMin = Number(question.flashback?.yearMin);
  const yearMax = Number(question.flashback?.yearMax);
  const hasRange = Number.isInteger(yearMin) && Number.isInteger(yearMax) && yearMax >= yearMin;
  const lockedYear = selectedKey ? flashbackYearFromAnswerKey(selectedKey) : null;
  const correctYear = phase === "reveal" ? flashbackYearFromAnswerKey(question.reveal?.correctAnswerKey) : null;
  const locked = Boolean(selectedKey) || phase !== "answering";
  const midpoint = hasRange ? yearMin + Math.floor((yearMax - yearMin) / 2) : null;
  const [cursorYear, setCursorYear] = useState<number | null>(lockedYear ?? midpoint);

  const commitYear = useCallback(
    (year: number) => {
      if (locked || !Number.isInteger(year)) return;
      const answerKey = flashbackYearAnswerKey(year);
      if (!answerKey) return;
      onChoose(answerKey);
      setCursorYear(year);
    },
    [locked, onChoose],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (locked || !hasRange) return;
      if (!shouldHandleAnswerShortcut(event)) return;
      if (event.key === "Enter" || event.key === " ") {
        const year = cursorYear ?? midpoint;
        if (year === null) return;
        event.preventDefault();
        commitYear(year);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commitYear, cursorYear, hasRange, locked, midpoint]);

  const shownYear = correctYear ?? lockedYear ?? cursorYear ?? midpoint;

  return (
    <div
      className={own.flashbackYearBoard}
      data-testid="flashback-year-board"
      data-phase={phase}
      data-locked={locked ? "true" : "false"}
      data-correct-year={correctYear ?? ""}
    >
      {phase === "reveal" && (
        <span className={own.flashbackYearResultText} data-testid="flashback-year-answer-label">
          {t("round.flashback.correctYear")}
        </span>
      )}
      <strong data-testid="flashback-year-readout">{shownYear ?? t("round.flashback.year")}</strong>
      {phase === "reveal" && (
        <p className={own.flashbackYearResultText} data-testid="flashback-year-your-answer">
          {lockedYear !== null ? t("round.flashback.yourAnswer", { year: lockedYear }) : t("round.flashback.noAnswer")}
        </p>
      )}
      {hasRange && phase !== "reveal" ? (
        <>
          <input
            className={styles.flashbackYearSlider}
            type="range"
            min={yearMin}
            max={yearMax}
            step={1}
            value={shownYear ?? midpoint ?? yearMin}
            disabled={locked}
            aria-label={t("round.flashback.year")}
            data-testid="flashback-year-slider"
            onInput={(event) => setCursorYear(Number(event.currentTarget.value))}
          />
          <div className={own.flashbackYearEnds}>
            <span>{yearMin}</span>
            <span>{yearMax}</span>
          </div>
          <button
            type="button"
            className={styles.flashbackYearLock}
            data-testid="flashback-year-lock"
            disabled={locked || shownYear === null}
            onClick={() => {
              if (shownYear !== null) commitYear(shownYear);
            }}
          >
            <Check aria-hidden="true" />
            {lockedYear !== null ? t("round.flashback.locked") : t("round.flashback.lock")}
          </button>
        </>
      ) : null}
    </div>
  );
}

export function FlashbackOrderBoard({
  question,
  phase,
  selectedKey,
  onChoose,
  onPick,
}: {
  question: PublicArcadeQuestion;
  phase: GamePhase;
  selectedKey: string | null;
  onChoose: (answerKey: string) => void;
  onPick?: () => void;
}) {
  const { t } = useLocale();
  const submittedKeys = selectedKey ? valueOrderKeysFromAnswerKey(selectedKey) : null;
  const [draftKeys, setDraftKeys] = useState<string[]>(() => submittedKeys ?? []);
  const draftKeysRef = useRef(submittedKeys ?? []);
  const cards = question.flashback?.cards ?? EMPTY_FLASHBACK_ORDER_CARDS;
  const activeKeys = submittedKeys ?? draftKeys;
  const locked = Boolean(selectedKey) || phase !== "answering";

  const submitOrder = useCallback(
    (keys: string[]) => {
      const answerKey = valueOrderAnswerKey(keys);
      if (answerKey && isFlashbackOrderAnswerForQuestion(question, answerKey)) onChoose(answerKey);
    },
    [onChoose, question],
  );

  const toggleCard = useCallback(
    (cardKey: string) => {
      if (locked) return;
      const current = draftKeysRef.current;
      const next = current.includes(cardKey)
        ? current.filter((key) => key !== cardKey)
        : current.length < 4
          ? [...current, cardKey]
          : current;
      draftKeysRef.current = next;
      setDraftKeys(next);
      if (next.length === 4 && current.length === 3) submitOrder(next);
      else if (next !== current) onPick?.();
    },
    [locked, onPick, submitOrder],
  );

  const undoLastCard = useCallback(() => {
    if (locked || draftKeysRef.current.length === 0) return;
    onPick?.();
    const next = draftKeysRef.current.slice(0, -1);
    draftKeysRef.current = next;
    setDraftKeys(next);
  }, [locked, onPick]);

  useEffect(() => {
    if (phase !== "answering" || locked) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shouldHandleAnswerShortcut(event)) return;
      const letterIndex = { a: 0, b: 1, c: 2, d: 3 }[event.key.toLowerCase()];
      const cardIndex = event.key >= "1" && event.key <= "4" ? Number(event.key) - 1 : letterIndex;
      if (cardIndex !== undefined && cardIndex >= 0 && cardIndex < cards.length) {
        event.preventDefault();
        toggleCard(cards[cardIndex].key);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        undoLastCard();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cards, locked, phase, toggleCard, undoLastCard]);

  if (phase === "reveal") {
    const correctKeys = valueOrderKeysFromAnswerKey(question.reveal?.correctAnswerKey) ?? [];
    const selectedWasCorrect = Boolean(selectedKey && selectedKey === question.reveal?.correctAnswerKey);
    return (
      <div className={own.flashbackOrderBoard} data-testid="flashback-order-board" data-phase="reveal">
        <ol className={own.flashbackOrderList} data-testid="flashback-order-sequence">
          {correctKeys.map((key, index) => {
            const card = cards.find((candidate) => candidate.key === key);
            return (
              <li key={key} data-correct="true">
                <i>{index + 1}</i>
                {card?.image ? (
                  <Image src={firstPartyArtSrc(card.image)} alt="" width={36} height={36} unoptimized />
                ) : null}
                <span>
                  <strong>{card?.name ?? key}</strong>
                  {card?.context ? <small>{card.context}</small> : null}
                </span>
              </li>
            );
          })}
        </ol>
        {submittedKeys && !selectedWasCorrect && (
          <ol className={own.flashbackOrderList} data-yours="true">
            {submittedKeys.map((key, index) => {
              const card = cards.find((candidate) => candidate.key === key);
              return (
                <li key={key}>
                  <i>{index + 1}</i>
                  {card?.image ? (
                    <Image src={firstPartyArtSrc(card.image)} alt="" width={36} height={36} unoptimized />
                  ) : null}
                  <span>
                    <strong>{card?.name ?? key}</strong>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    );
  }

  return (
    <div
      className={own.flashbackOrderBoard}
      data-testid="flashback-order-board"
      data-phase="answering"
      data-locked={selectedKey ? "true" : "false"}
    >
      <div className={own.flashbackOrderSlots} role="group" aria-label={t("round.order.yours")}>
        {Array.from({ length: 4 }, (_, index) => {
          const key = activeKeys[index];
          const card = cards.find((candidate) => candidate.key === key);
          return (
            <span key={index} data-filled={card ? "true" : "false"}>
              <i>{index + 1}</i>
              {card?.image ? (
                <Image src={firstPartyArtSrc(card.image)} alt="" width={28} height={28} unoptimized />
              ) : (
                <span className={own.flashbackOrderSlotArt} aria-hidden="true" />
              )}
              {card ? <strong>{card.name}</strong> : <em>—</em>}
            </span>
          );
        })}
      </div>
      <div className={own.flashbackOrderCards} role="group" aria-label={t("round.order.eventsAria")}>
        {cards.map((card) => {
          const position = activeKeys.indexOf(card.key);
          return (
            <button
              key={card.key}
              type="button"
              data-testid="flashback-order-card"
              data-selected={position >= 0 ? "true" : "false"}
              disabled={locked}
              onClick={() => toggleCard(card.key)}
              aria-pressed={position >= 0}
            >
              <i data-empty={position < 0 ? "true" : "false"}>{position >= 0 ? position + 1 : ""}</i>
              {card.image ? (
                <span className={own.flashbackOrderCardArt}>
                  <Image src={firstPartyArtSrc(card.image)} alt="" width={72} height={72} unoptimized />
                </span>
              ) : null}
              <strong>{card.name}</strong>
              {card.context ? <small>{card.context}</small> : null}
            </button>
          );
        })}
      </div>
      <div className={styles.valueOrderControls}>
        <button
          type="button"
          onClick={undoLastCard}
          disabled={locked || draftKeys.length === 0}
          aria-label={t("round.order.undoAria")}
        >
          <RotateCcw />
          {t("round.order.undo")}
        </button>
      </div>
    </div>
  );
}
