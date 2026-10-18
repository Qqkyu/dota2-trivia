import Image from "next/image";
import clsx from "clsx";
import { ArrowRight, Check, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { shouldHandleAnswerShortcut } from "@/lib/answer-shortcuts.mjs";
import type { CrowdResult } from "@/lib/arcade-contract";
import { DOTA_SHOP_SEARCH_PLACEHOLDER } from "@/lib/entry-wait-tips.mjs";
import { isPublicRecipeBuilderQuestion, type PublicArcadeQuestion } from "@/lib/public-question";
import {
  recipeAnswerKeyForItems,
  recipeItemsFromAnswerKey,
  SHOPKEEPER_CATALOG,
  SHOPKEEPER_CATALOG_BY_KEY,
  SHOPKEEPER_CATALOG_ITEMS,
  SHOPKEEPER_RECIPE_IMAGE,
  type ShopkeeperCatalogItem,
} from "@/lib/shopkeeper-catalog";
import type { GamePhase } from "./shared";
import { ShopkeeperPick, ShopkeeperRecipePick } from "./shopkeeper-parts";
import styles from "../queue-arcade.module.css";

export function searchShopItems(query: string) {
  const normalized = query.trim().toLocaleLowerCase("en-US");
  if (!normalized) return [];
  return SHOPKEEPER_CATALOG_ITEMS.filter(
    (item) => item.name.toLocaleLowerCase("en-US").includes(normalized) || item.key.includes(normalized),
  );
}

export function ShopkeeperStore({
  question,
  phase,
  selectedKey,
  crowd,
  onChoose,
  onPick,
}: {
  question: PublicArcadeQuestion;
  phase: GamePhase;
  selectedKey: string | null;
  crowd: CrowdResult;
  onChoose: (itemKey: string) => void;
  onPick?: () => void;
}) {
  const [section, setSection] = useState<"basics" | "upgrades">("upgrades");
  const [query, setQuery] = useState("");
  const [selectionAnnouncement, setSelectionAnnouncement] = useState("");
  const [tooltip, setTooltip] = useState<{
    item: ShopkeeperCatalogItem;
    left: number;
    top: number;
    width: number;
    placement: "above" | "below";
  } | null>(null);
  const recipeBuilder = isPublicRecipeBuilderQuestion(question);
  const recipeSize = recipeBuilder ? (question.shopkeeper?.recipeSize ?? 0) : 0;
  const recipeCost = question.shopkeeper?.recipeCost;
  const recipeIncluded = typeof recipeCost === "number" && recipeCost > 0;
  const submittedRecipeKeys = recipeItemsFromAnswerKey(selectedKey) ?? [];
  const [draftRecipeKeys, setDraftRecipeKeys] = useState<string[]>(() => submittedRecipeKeys);
  const activeRecipeKeys = selectedKey ? submittedRecipeKeys : draftRecipeKeys;
  const targetKey = question.reveal?.correctAnswerKey;
  const correctRecipeKeys = recipeItemsFromAnswerKey(targetKey) ?? [];
  const targetItem = !recipeBuilder && targetKey ? SHOPKEEPER_CATALOG_BY_KEY.get(targetKey) : undefined;
  const selectedItem = selectedKey ? SHOPKEEPER_CATALOG_BY_KEY.get(selectedKey) : undefined;
  const queryRef = useRef(query);
  const storeRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const recipeBuildRef = useRef<HTMLButtonElement | null>(null);
  const recipeFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);
  const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
  const countByItem = new Map(crowd.keyCounts.map((entry) => [entry.answerKey, entry.count]));
  const searchItems = searchShopItems(query);
  const groups = normalizedQuery
    ? [{ key: "search", label: `${searchItems.length} found`, section, items: searchItems }]
    : SHOPKEEPER_CATALOG.groups.filter((group) => group.section === section);

  const chooseItem = (itemKey: string) => {
    onChoose(itemKey);
    setQuery("");
    setTooltip(null);
  };

  const addRecipeItem = useCallback(
    (itemKey: string, restoreKeyboardFocus = false) => {
      if (phase !== "answering" || selectedKey !== null || draftRecipeKeys.length >= recipeSize) return;
      if (restoreKeyboardFocus && document.activeElement instanceof HTMLElement)
        recipeFocusRef.current = document.activeElement;
      onPick?.();
      setQuery("");
      setTooltip(null);
      setDraftRecipeKeys((itemKeys) => [...itemKeys, itemKey]);
      setSelectionAnnouncement(
        `Added ${SHOPKEEPER_CATALOG_BY_KEY.get(itemKey)?.name ?? itemKey}. ${draftRecipeKeys.length + 1} of ${recipeSize} components selected.`,
      );
    },
    [draftRecipeKeys.length, onPick, phase, recipeSize, selectedKey],
  );

  const removeRecipeItem = (slot: number, restoreKeyboardFocus = false) => {
    if (phase !== "answering" || selectedKey !== null || !draftRecipeKeys[slot]) return;
    if (restoreKeyboardFocus && document.activeElement instanceof HTMLElement)
      recipeFocusRef.current = document.activeElement;
    onPick?.();
    setTooltip(null);
    setDraftRecipeKeys((itemKeys) => itemKeys.filter((_, index) => index !== slot));
    setSelectionAnnouncement(
      `Removed ${SHOPKEEPER_CATALOG_BY_KEY.get(draftRecipeKeys[slot])?.name ?? draftRecipeKeys[slot]}. ${draftRecipeKeys.length - 1} of ${recipeSize} components selected.`,
    );
  };

  useEffect(() => {
    const previousControl = recipeFocusRef.current;
    recipeFocusRef.current = null;
    if (!previousControl || phase !== "answering" || selectedKey !== null) return;
    if (document.activeElement !== document.body && document.activeElement !== previousControl) return;
    if (previousControl.isConnected && !previousControl.matches(":disabled")) return;
    const nextControl = draftRecipeKeys.length === recipeSize ? recipeBuildRef.current : searchInputRef.current;
    nextControl?.focus({ preventScroll: true });
  }, [draftRecipeKeys, phase, recipeSize, selectedKey]);

  const submitRecipe = () => {
    if (draftRecipeKeys.length !== recipeSize) return;
    const answerKey = recipeAnswerKeyForItems(draftRecipeKeys);
    if (!answerKey) return;
    onChoose(answerKey);
    setQuery("");
    setTooltip(null);
  };

  // Enter picks the only item the search still shows. With no search and a
  // full recipe draft, Enter builds it.
  const pickSingleMatch = useCallback(() => {
    const matches = searchShopItems(queryRef.current);
    if (matches.length === 1) {
      const itemKey = matches[0].key;
      if (recipeBuilder) {
        addRecipeItem(itemKey, true);
      } else {
        onChoose(itemKey);
        setQuery("");
        setTooltip(null);
      }
      return true;
    }
    if (queryRef.current.trim() || !recipeBuilder || draftRecipeKeys.length !== recipeSize) return false;
    const answerKey = recipeAnswerKeyForItems(draftRecipeKeys);
    if (!answerKey) return false;
    onChoose(answerKey);
    setTooltip(null);
    return true;
  }, [addRecipeItem, draftRecipeKeys, onChoose, recipeBuilder, recipeSize]);

  const showItemTooltip = (item: ShopkeeperCatalogItem, button: HTMLButtonElement) => {
    const bounds = button.getBoundingClientRect();
    const viewportPadding = 8;
    const width = Math.min(190, window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      window.innerWidth - width - viewportPadding,
      Math.max(viewportPadding, bounds.left + bounds.width / 2 - width / 2),
    );
    const placement = bounds.bottom + 72 <= window.innerHeight || bounds.top < 80 ? "below" : "above";
    setTooltip({
      item,
      left,
      top: placement === "below" ? bounds.bottom + 7 : bounds.top - 7,
      width,
      placement,
    });
  };

  useEffect(() => {
    if (phase !== "answering" || selectedKey !== null) return;

    const startSearching = (event: KeyboardEvent) => {
      if (!shouldHandleAnswerShortcut(event)) return;
      if (storeRef.current?.closest("[inert]")) return;

      if (event.key === "Enter") {
        if (pickSingleMatch()) event.preventDefault();
        return;
      }
      if (event.key === "Escape") {
        setQuery("");
        setTooltip(null);
        return;
      }
      if (event.key === "Backspace" && queryRef.current) {
        event.preventDefault();
        setTooltip(null);
        setQuery((value) => value.slice(0, -1));
        return;
      }
      if (event.key.length !== 1 || (!queryRef.current && event.key.trim() === "")) return;

      event.preventDefault();
      setTooltip(null);
      setQuery((value) => `${value}${event.key}`);
    };

    window.addEventListener("keydown", startSearching);
    return () => window.removeEventListener("keydown", startSearching);
  }, [phase, pickSingleMatch, selectedKey]);

  useEffect(() => {
    if (!tooltip) return;
    const hideTooltip = () => setTooltip(null);
    window.addEventListener("resize", hideTooltip);
    window.addEventListener("scroll", hideTooltip, true);
    return () => {
      window.removeEventListener("resize", hideTooltip);
      window.removeEventListener("scroll", hideTooltip, true);
    };
  }, [tooltip]);

  return (
    <>
      <div
        ref={storeRef}
        className={styles.shopkeeperStore}
        data-testid="shopkeeper-store"
        data-phase={phase}
        data-answer-mode={question.answerMode}
        data-locked={selectedKey ? "true" : "false"}
      >
        <div className={styles.shopkeeperStoreToolbar}>
          <div className={styles.shopkeeperStoreTabs} role="group" aria-label="Shop section">
            {(["basics", "upgrades"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                aria-pressed={section === tab}
                data-testid={`shopkeeper-tab-${tab}`}
                onClick={() => {
                  setTooltip(null);
                  setSection(tab);
                }}
              >
                {tab}
              </button>
            ))}
          </div>
          <label className={styles.shopSearchBox} data-focused={normalizedQuery ? "true" : "false"}>
            <Search aria-hidden="true" />
            <input
              ref={searchInputRef}
              data-testid="shopkeeper-search-field"
              aria-label="Search shop items"
              type="text"
              value={query}
              placeholder={DOTA_SHOP_SEARCH_PLACEHOLDER}
              autoComplete="off"
              spellCheck={false}
              disabled={phase !== "answering" || selectedKey !== null}
              onChange={(event) => {
                setTooltip(null);
                setQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                if (!shouldHandleAnswerShortcut(event.nativeEvent, { allowedInput: event.currentTarget })) return;
                if (event.key === "Enter" && pickSingleMatch()) {
                  event.preventDefault();
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setQuery("");
                  setTooltip(null);
                }
              }}
            />
          </label>
        </div>
        <div
          className={styles.quickSearch}
          data-testid="shopkeeper-search"
          data-query={query}
          data-active="false"
          aria-live="polite"
        >
          {query}
        </div>

        <div
          className="sr-only"
          data-testid="shopkeeper-selection-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {selectionAnnouncement}
        </div>

        {recipeBuilder && phase === "answering" && (
          <div
            className={styles.shopkeeperRecipeBuilder}
            data-testid="shopkeeper-recipe-builder"
            data-recipe-size={recipeSize}
            data-selection-count={activeRecipeKeys.length}
          >
            <span className={styles.shopkeeperRecipeBuilderLabel}>
              <small>Shop items</small>
              <strong>
                {activeRecipeKeys.length}/{recipeSize}
              </strong>
            </span>
            <div className={styles.shopkeeperRecipeSlots}>
              {Array.from({ length: recipeSize }, (_, slot) => {
                const itemKey = activeRecipeKeys[slot];
                const item = itemKey ? SHOPKEEPER_CATALOG_BY_KEY.get(itemKey) : undefined;
                return item ? (
                  <button
                    key={`${slot}:${itemKey}`}
                    type="button"
                    data-testid="shopkeeper-recipe-slot"
                    data-item-key={item.key}
                    aria-label={`Remove ${item.name}`}
                    onClick={(event) => removeRecipeItem(slot, event.detail === 0)}
                    disabled={selectedKey !== null}
                  >
                    <Image src={item.image} alt="" fill sizes="58px" unoptimized />
                    <X aria-hidden="true" />
                  </button>
                ) : (
                  <span key={slot} data-testid="shopkeeper-recipe-slot" data-empty="true" aria-hidden="true">
                    +
                  </span>
                );
              })}
              {recipeIncluded ? (
                <span className={styles.shopkeeperRecipeIncluded} data-testid="shopkeeper-recipe-included">
                  <Image src={SHOPKEEPER_RECIPE_IMAGE} alt="" width={36} height={27} unoptimized />
                  <small>Included</small>
                </span>
              ) : recipeCost === 0 ? (
                <span className={styles.shopkeeperRecipeIncluded} data-testid="shopkeeper-no-recipe">
                  <small>No recipe required</small>
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className={styles.shopkeeperBuildButton}
              data-testid="shopkeeper-recipe-build"
              ref={recipeBuildRef}
              onClick={submitRecipe}
              disabled={selectedKey !== null || activeRecipeKeys.length !== recipeSize}
            >
              <Check aria-hidden="true" />
              {selectedKey ? "Locked" : "Build"}
            </button>
          </div>
        )}

        {phase === "reveal" && recipeBuilder ? (
          <div className={styles.shopkeeperRecipeReveal} data-testid="shopkeeper-open-reveal">
            <ShopkeeperRecipePick itemKeys={submittedRecipeKeys} label="Your items" />
            <ArrowRight aria-hidden="true" />
            <ShopkeeperRecipePick itemKeys={correctRecipeKeys} label="Correct items" recipeIncluded={recipeIncluded} />
          </div>
        ) : phase === "reveal" ? (
          <div className={styles.shopkeeperRevealPicks} data-testid="shopkeeper-open-reveal">
            <ShopkeeperPick item={selectedItem} label="Your pick" />
            <ArrowRight aria-hidden="true" />
            <ShopkeeperPick
              item={targetItem}
              label={
                question.soundcheck?.family === "item"
                  ? "Sound source"
                  : question.shopkeeper?.format === "upgrade-path"
                    ? "Direct upgrade"
                    : "Build result"
              }
            />
          </div>
        ) : null}

        <div
          className={clsx(styles.shopkeeperGroups, normalizedQuery && styles.shopkeeperSearchResults)}
          data-testid="shopkeeper-groups"
          data-shop-section={section}
          data-searching={normalizedQuery ? "true" : "false"}
          data-item-count={
            normalizedQuery ? searchItems.length : groups.reduce((count, group) => count + group.items.length, 0)
          }
          onScroll={() => setTooltip(null)}
        >
          {normalizedQuery && searchItems.length === 0 ? (
            <p className={styles.shopkeeperNoResults}>No shop item matches “{query.trim()}”.</p>
          ) : (
            groups.map((group) => (
              <section key={group.key} className={styles.shopkeeperGroup} aria-label={group.label}>
                <h3>{group.label}</h3>
                <div>
                  {group.items.map((item) => {
                    const selectedCount = recipeBuilder
                      ? activeRecipeKeys.filter((itemKey) => itemKey === item.key).length
                      : selectedKey === item.key
                        ? 1
                        : 0;
                    const correctCount = recipeBuilder
                      ? correctRecipeKeys.filter((itemKey) => itemKey === item.key).length
                      : targetKey === item.key
                        ? 1
                        : 0;
                    const isSelected = selectedCount > 0;
                    const isCorrect = phase === "reveal" && correctCount > 0;
                    const count = countByItem.get(item.key) ?? 0;
                    const percentage = crowd.total ? Math.round((count / crowd.total) * 100) : 0;
                    const state = isCorrect
                      ? "correct"
                      : phase === "reveal" && isSelected
                        ? "wrong"
                        : isSelected
                          ? "selected"
                          : "idle";

                    return (
                      <button
                        key={item.key}
                        type="button"
                        data-testid="shopkeeper-store-item"
                        data-item-key={item.key}
                        data-state={state}
                        data-pick-count={selectedCount}
                        onClick={(event) =>
                          recipeBuilder ? addRecipeItem(item.key, event.detail === 0) : chooseItem(item.key)
                        }
                        onPointerEnter={(event) => showItemTooltip(item, event.currentTarget)}
                        onPointerLeave={() => setTooltip(null)}
                        onFocus={(event) => showItemTooltip(item, event.currentTarget)}
                        onBlur={() => setTooltip(null)}
                        disabled={
                          phase !== "answering" ||
                          selectedKey !== null ||
                          (recipeBuilder && activeRecipeKeys.length >= recipeSize)
                        }
                        aria-label={`${item.name}, ${item.cost.toLocaleString("en-US")} gold`}
                        aria-describedby={tooltip?.item.key === item.key ? "shopkeeper-item-tooltip" : undefined}
                        aria-pressed={isSelected}
                      >
                        <Image src={item.image} alt="" fill sizes="48px" loading="eager" unoptimized />
                        {recipeBuilder && selectedCount > 0 ? (
                          <i>×{selectedCount}</i>
                        ) : phase === "reveal" && count > 0 ? (
                          <i>{percentage}%</i>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id="shopkeeper-item-tooltip"
            role="tooltip"
            className={styles.shopkeeperTooltip}
            data-testid="shopkeeper-item-tooltip"
            data-placement={tooltip.placement}
            style={{ left: tooltip.left, top: tooltip.top, width: tooltip.width }}
          >
            <strong>{tooltip.item.name}</strong>
            <small>{tooltip.item.cost.toLocaleString("en-US")} gold</small>
          </div>,
          document.body,
        )}
    </>
  );
}
