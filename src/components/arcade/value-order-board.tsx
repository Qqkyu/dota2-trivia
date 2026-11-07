import Image from "next/image";
import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/i18n/provider";
import { shouldHandleAnswerShortcut } from "@/lib/answer-shortcuts.mjs";
import type { PublicArcadeQuestion } from "@/lib/public-question";
import { isValueOrderAnswerForQuestion, valueOrderAnswerKey, valueOrderKeysFromAnswerKey } from "@/lib/value-order.mjs";
import { EMPTY_VALUE_ORDER_CARDS, type GamePhase, type PublicValueOrderCard } from "./shared";
import styles from "../queue-arcade.module.css";
import own from "./value-order-board.module.css";
import { firstPartyArtSrc } from "@/lib/steam-art.mjs";

export function ValueOrderSequence({
  question,
  cardKeys,
  label,
  showValues = false,
}: {
  question: PublicArcadeQuestion;
  cardKeys: string[];
  label: string;
  showValues?: boolean;
}) {
  const cardByKey = new Map(question.valueOrder?.cards.map((card) => [card.key, card]) ?? []);
  const valueByKey = new Map(question.reveal?.orderValues?.map((entry) => [entry.key, entry.label]) ?? []);

  return (
    <div className={own.valueOrderSequence} data-testid="value-order-sequence">
      <small>{label}</small>
      <div>
        {cardKeys.map((key, index) => {
          const card = cardByKey.get(key);
          if (!card) return null;
          return (
            <span key={key} className={own.valueOrderSequenceCard} data-card-kind={card.kind}>
              <i>{index + 1}</i>
              <Image src={firstPartyArtSrc(card.image)} alt="" width={46} height={46} unoptimized />
              <strong>{card.name}</strong>
              {showValues && <em>{valueByKey.get(key) ?? "—"}</em>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function ValueOrderBoard({
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
  const cards = question.valueOrder?.cards ?? EMPTY_VALUE_ORDER_CARDS;
  const activeKeys = submittedKeys ?? draftKeys;
  const locked = Boolean(selectedKey) || phase !== "answering";

  const submitOrder = useCallback(
    (keys: string[]) => {
      const answerKey = valueOrderAnswerKey(keys);
      if (answerKey && isValueOrderAnswerForQuestion(question, answerKey)) onChoose(answerKey);
    },
    [onChoose, question],
  );

  const toggleCard = useCallback(
    (card: PublicValueOrderCard) => {
      if (locked) return;
      const current = draftKeysRef.current;
      const next = current.includes(card.key)
        ? current.filter((key) => key !== card.key)
        : current.length < 4
          ? [...current, card.key]
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
      const cardIndex = Number(event.key) - 1;
      if (cardIndex >= 0 && cardIndex < cards.length) {
        event.preventDefault();
        toggleCard(cards[cardIndex]);
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
      <div className={own.valueOrderReveal} data-testid="value-order-board" data-phase="reveal">
        <ValueOrderSequence question={question} cardKeys={correctKeys} label={t("round.order.correct")} showValues />
        {submittedKeys && !selectedWasCorrect && (
          <ValueOrderSequence question={question} cardKeys={submittedKeys} label={t("round.order.yours")} />
        )}
      </div>
    );
  }

  return (
    <div
      className={own.valueOrderBoard}
      data-testid="value-order-board"
      data-phase="answering"
      data-locked={selectedKey ? "true" : "false"}
    >
      <div className={own.valueOrderSlots} role="group" aria-label={t("round.order.yours")}>
        {Array.from({ length: 4 }, (_, index) => {
          const key = activeKeys[index];
          const card = cards.find((candidate) => candidate.key === key);
          return (
            <span key={index} data-filled={card ? "true" : "false"} data-card-kind={card?.kind}>
              <i>{index + 1}</i>
              {card ? (
                <>
                  <Image src={firstPartyArtSrc(card.image)} alt="" width={42} height={42} unoptimized />
                  <strong>{card.name}</strong>
                </>
              ) : (
                <em>—</em>
              )}
            </span>
          );
        })}
      </div>

      <div className={own.valueOrderCards} role="group" aria-label={t("round.order.cardsAria")}>
        {cards.map((card, cardIndex) => {
          const position = activeKeys.indexOf(card.key);
          return (
            <button
              key={card.key}
              type="button"
              data-testid="value-order-card"
              data-card-kind={card.kind}
              data-selected={position >= 0 ? "true" : "false"}
              disabled={locked}
              onClick={() => toggleCard(card)}
              aria-label={`${cardIndex + 1}. ${card.context ? `${card.context}, ` : ""}${card.name}`}
              aria-pressed={position >= 0}
            >
              {position >= 0 && <i>{position + 1}</i>}
              <Image src={firstPartyArtSrc(card.image)} alt="" width={72} height={72} unoptimized />
              <span>
                {card.context && <small>{card.context}</small>}
                <strong>{card.name}</strong>
              </span>
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
