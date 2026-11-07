import Image from "next/image";
import { CalendarDays, Check } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useLocale } from "@/i18n/provider";
import type { CrowdResult } from "@/lib/arcade-contract";
import { crowdPercentage, keyedCrowdSplitRows } from "@/lib/crowd-split.mjs";
import { flashbackYearFromAnswerKey } from "@/lib/flashback.mjs";
import { HERO_PICKER_BY_KEY } from "@/lib/hero-picker";
import { publicCorrectIndex, type PublicArcadeQuestion } from "@/lib/public-question";
import { SHOPKEEPER_CATALOG_BY_KEY, recipeItemsFromAnswerKey } from "@/lib/shopkeeper-catalog";
import { orderCardsForAnswerKey } from "@/lib/value-order.mjs";
import { keyedAnswerLabel, LETTERS, shopkeeperReferencesForKeys } from "./shared";
import own from "./crowd-split.module.css";
import { firstPartyArtSrc } from "@/lib/steam-art.mjs";

export function CrowdSplitBar({
  marker,
  label,
  count,
  total,
  correct = false,
  selected = false,
  ordered = false,
}: {
  marker: ReactNode;
  label: string;
  count: number;
  total: number;
  correct?: boolean;
  selected?: boolean;
  /** The marker is the whole answer: four cards in order. Their names do not fit in the rail. */
  ordered?: boolean;
}) {
  const { t } = useLocale();
  const percentage = crowdPercentage(count, total);
  const rowKey =
    correct && selected
      ? "round.split.rowCorrectYours"
      : correct
        ? "round.split.rowCorrect"
        : selected
          ? "round.split.rowYours"
          : "round.split.row";

  return (
    <div
      className={own.crowdSplitRow}
      role="group"
      data-testid="crowd-split-row"
      data-count={count}
      data-percentage={percentage}
      data-correct={correct ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
      style={{ "--crowd-share": `${percentage}%` } as CSSProperties}
      aria-label={t(rowKey, { label, percentage })}
    >
      <span className={own.crowdSplitMeta} data-ordered={ordered ? "true" : undefined}>
        <i className={own.crowdSplitMarker} title={ordered ? label : undefined}>
          {marker}
        </i>
        <strong title={label}>{label}</strong>
        {selected && <em>{t("round.split.you")}</em>}
        {correct && <Check role="img" aria-label={t("round.split.correctAria")} />}
        <small>{percentage}%</small>
      </span>
      <span className={own.crowdSplitTrack} aria-hidden="true">
        <i />
      </span>
    </div>
  );
}

export function ChoiceCrowdSplit({
  question,
  crowd,
  selectedIndex,
}: {
  question: PublicArcadeQuestion;
  crowd: CrowdResult;
  selectedIndex: number | null;
}) {
  const correctIndex = publicCorrectIndex(question);

  return (
    <div className={own.crowdSplit} data-testid="crowd-split" data-split-kind="choices" data-total={crowd.total}>
      {question.answers.map((answer, index) => (
        <CrowdSplitBar
          key={`${index}:${answer}`}
          marker={LETTERS[index]}
          label={answer}
          count={crowd.counts[index]}
          total={crowd.total}
          correct={correctIndex === index}
          selected={selectedIndex === index}
        />
      ))}
    </div>
  );
}

export function KeyedCrowdSplit({
  question,
  crowd,
  selectedKey,
}: {
  question: PublicArcadeQuestion;
  crowd: CrowdResult;
  selectedKey: string | null;
}) {
  const { t } = useLocale();
  const correctKey = question.reveal?.correctAnswerKey ?? null;
  const split = keyedCrowdSplitRows(crowd.keyCounts, crowd.total, {
    correctKey,
    selectedKey,
    maxChoices: 4,
  });

  return (
    <div className={own.crowdSplit} data-testid="crowd-split" data-split-kind="open-grid" data-total={crowd.total}>
      {split.rows.map(({ answerKey, count }) => {
        const hero = HERO_PICKER_BY_KEY.get(answerKey);
        const item = SHOPKEEPER_CATALOG_BY_KEY.get(answerKey);
        const recipeKeys = recipeItemsFromAnswerKey(answerKey);
        const recipeItems = recipeKeys ? shopkeeperReferencesForKeys(recipeKeys) : [];
        const orderCards: { key: string; image: string }[] | null = orderCardsForAnswerKey(question, answerKey);
        const label = keyedAnswerLabel(answerKey, t("round.split.unknownPick"), question);
        const marker =
          hero || item ? (
            <Image src={firstPartyArtSrc((hero ?? item)?.image ?? "")} alt="" fill sizes="34px" unoptimized />
          ) : orderCards ? (
            <span className={own.crowdSplitOrder} aria-hidden="true">
              {orderCards.map((card) => (
                <Image key={card.key} src={firstPartyArtSrc(card.image)} alt="" width={22} height={22} unoptimized />
              ))}
            </span>
          ) : recipeItems.length ? (
            <span className={own.crowdSplitRecipe} aria-hidden="true">
              {recipeItems.slice(0, 3).map((recipeItem) => (
                <Image
                  key={recipeItem.key}
                  src={firstPartyArtSrc(recipeItem.image)}
                  alt=""
                  width={20}
                  height={15}
                  unoptimized
                />
              ))}
            </span>
          ) : flashbackYearFromAnswerKey(answerKey) !== null ? (
            <CalendarDays size={13} aria-hidden="true" />
          ) : (
            "?"
          );

        return (
          <CrowdSplitBar
            key={answerKey}
            marker={marker}
            label={label}
            count={count}
            total={crowd.total}
            correct={answerKey === correctKey}
            selected={answerKey === selectedKey}
            ordered={Boolean(orderCards)}
          />
        );
      })}
      {split.otherCount > 0 && (
        <CrowdSplitBar marker="…" label={t("round.split.otherPicks")} count={split.otherCount} total={crowd.total} />
      )}
    </div>
  );
}
