import { cyrillicQueryMatches } from "@/lib/search-query.mjs";
import { HERO_SEARCH_ALIASES } from "@/lib/search-aliases";
import Image from "next/image";
import { Check, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { splitAccent } from "@/i18n/format.mjs";
import { useLocale } from "@/i18n/provider";
import { shouldHandleAnswerShortcut } from "@/lib/answer-shortcuts.mjs";
import type { CrowdResult } from "@/lib/arcade-contract";
import { revealCalloutKey } from "@/lib/dota-flavor.mjs";
import {
  HERO_GROUP_ARIA_KEYS,
  HERO_GROUP_LABEL_KEYS,
  HERO_PICKER_BY_KEY,
  HERO_PICKER_CATALOG,
  HERO_PICKER_HEROES,
  heroPickerPortraitSrc,
  type HeroPickerHero,
} from "@/lib/hero-picker";
import type { PublicArcadeQuestion } from "@/lib/public-question";
import type { GamePhase, RoundAward } from "./shared";
import styles from "../queue-arcade.module.css";
import own from "./hero-picker.module.css";
import { firstPartyArtSrc } from "@/lib/steam-art.mjs";

export const HERO_ATTRIBUTE_ICONS = {
  strength: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/hero_strength.png",
  agility: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/hero_agility.png",
  intelligence: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/hero_intelligence.png",
  universal: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons/hero_universal.png",
} satisfies Record<(typeof HERO_PICKER_CATALOG.groups)[number]["key"], string>;

export function HeroPickerPortrait({ hero }: { hero: HeroPickerHero }) {
  return <Image src={heroPickerPortraitSrc(hero.image)} alt="" fill sizes="44px" loading="eager" unoptimized />;
}

export function heroMatchesQuery(hero: HeroPickerHero, normalizedQuery: string) {
  if (!normalizedQuery) return true;
  const name = hero.name.toLocaleLowerCase("en-US");
  const slug = hero.key.replace(/^npc_dota_hero_/, "").replaceAll("_", " ");
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("");
  const matchesLatin = (query: string) => name.includes(query) || slug.includes(query) || initials.startsWith(query);
  return (
    matchesLatin(normalizedQuery) || cyrillicQueryMatches(normalizedQuery, HERO_SEARCH_ALIASES[hero.key], matchesLatin)
  );
}

export function searchHeroes(query: string) {
  const normalized = query.trim().toLocaleLowerCase("en-US");
  return normalized ? HERO_PICKER_HEROES.filter((hero) => heroMatchesQuery(hero, normalized)) : [];
}

export function HeroPicker({
  question,
  phase,
  selectedKey,
  crowd,
  showShares,
  onChoose,
  resultCallout = null,
  roundAward = null,
}: {
  question: PublicArcadeQuestion;
  phase: GamePhase;
  selectedKey: string | null;
  crowd: CrowdResult;
  /** A party has no Room split card, so the shares go on the grid. */
  showShares: boolean;
  onChoose: (heroKey: string) => void;
  /** At reveal: the verdict and gold beside the correct hero. */
  resultCallout?: Parameters<typeof revealCalloutKey>[0] | null;
  roundAward?: RoundAward | null;
}) {
  const { t, number } = useLocale();
  const [query, setQuery] = useState("");
  const [searchFlash, setSearchFlash] = useState(false);
  const queryRef = useRef(query);
  const flashTimeoutRef = useRef<number | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);
  // Briefly highlight the typed filter. Driven from the key handler so no
  // effect has to call setState on every keystroke.
  const flashSearch = useCallback((active: boolean) => {
    if (flashTimeoutRef.current !== null) window.clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = null;
    setSearchFlash(active);
    if (active) flashTimeoutRef.current = window.setTimeout(() => setSearchFlash(false), 1_500);
  }, []);
  useEffect(
    () => () => {
      if (flashTimeoutRef.current !== null) window.clearTimeout(flashTimeoutRef.current);
    },
    [],
  );
  const targetKey = question.reveal?.correctAnswerKey;
  const countByHero = new Map(crowd.keyCounts.map((entry) => [entry.answerKey, entry.count]));
  const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
  const heroMatches = (hero: HeroPickerHero) => heroMatchesQuery(hero, normalizedQuery);
  const correctHero = phase === "reveal" && targetKey ? HERO_PICKER_BY_KEY.get(targetKey) : undefined;
  const selectedHero = selectedKey ? HERO_PICKER_BY_KEY.get(selectedKey) : undefined;
  const matchCount = normalizedQuery ? HERO_PICKER_HEROES.filter(heroMatches).length : HERO_PICKER_HEROES.length;
  const resultLabel = resultCallout ? t(revealCalloutKey(resultCallout)) : null;
  const answerLine = correctHero ? splitAccent(t("round.heroPicker.answer", { name: correctHero.name })) : null;
  const lockedLine = selectedHero ? splitAccent(t("round.heroPicker.locked", { name: selectedHero.name })) : null;
  useEffect(() => {
    if (!normalizedQuery) return;
    const board = pickerRef.current?.querySelector<HTMLElement>('[data-testid="hero-picker-board"]');
    const match = board?.querySelector<HTMLElement>('[data-search-match="true"]');
    if (!board || !match) return;
    const bounds = board.getBoundingClientRect();
    const target = match.getBoundingClientRect();
    if (target.top < bounds.top || target.bottom > bounds.bottom) {
      board.scrollTop += target.top - bounds.top;
    }
  }, [normalizedQuery]);
  const chooseHero = useCallback(
    (heroKey: string) => {
      onChoose(heroKey);
      setQuery("");
      flashSearch(false);
    },
    [flashSearch, onChoose],
  );

  useEffect(() => {
    if (phase !== "answering" || selectedKey !== null) return;

    const startSearching = (event: KeyboardEvent) => {
      if (!shouldHandleAnswerShortcut(event)) return;
      if (pickerRef.current?.closest("[inert]")) return;

      if (event.key === "Enter") {
        // Enter picks the only hero the typed filter still shows.
        const matches = searchHeroes(queryRef.current);
        if (matches.length !== 1) return;
        event.preventDefault();
        chooseHero(matches[0].key);
        return;
      }
      if (event.key === "Escape") {
        setQuery("");
        flashSearch(false);
        return;
      }
      if (event.key === "Backspace" && queryRef.current) {
        event.preventDefault();
        setQuery((value) => value.slice(0, -1));
        flashSearch(queryRef.current.trim().length > 1);
        return;
      }
      if (event.key.length !== 1 || (!queryRef.current && event.key.trim() === "")) return;

      event.preventDefault();
      setQuery((value) => `${value}${event.key}`);
      flashSearch(true);
    };

    window.addEventListener("keydown", startSearching);
    return () => window.removeEventListener("keydown", startSearching);
  }, [chooseHero, flashSearch, phase, selectedKey]);

  return (
    <div
      ref={pickerRef}
      className={phase === "reveal" ? `${styles.heroPicker} ${own.compactReveal}` : styles.heroPicker}
      data-testid="hero-picker"
      data-phase={phase}
      data-locked={selectedKey ? "true" : "false"}
      data-searching={phase === "answering" && normalizedQuery ? "true" : "false"}
      style={{ "--hero-grid-columns": HERO_PICKER_CATALOG.columns } as CSSProperties}
    >
      {phase !== "reveal" && (
        <>
          <div
            className={styles.quickSearch}
            data-testid="hero-search"
            data-query={query}
            data-active={searchFlash ? "true" : "false"}
            aria-live="polite"
          >
            {query}
          </div>
          <label className={own.heroSearchField}>
            <Search aria-hidden="true" />
            <input
              className={own.heroSearchInput}
              data-testid="hero-search-input"
              aria-label={t("round.heroPicker.filterAria")}
              title={t("round.heroPicker.filterAria")}
              type="search"
              enterKeyHint="go"
              autoComplete="off"
              spellCheck={false}
              placeholder={t("round.heroPicker.placeholder")}
              value={query}
              disabled={phase !== "answering" || selectedKey !== null}
              onChange={(event) => {
                queryRef.current = event.currentTarget.value;
                setQuery(event.currentTarget.value);
                flashSearch(Boolean(event.currentTarget.value.trim()));
              }}
              onKeyDown={(event) => {
                if (!shouldHandleAnswerShortcut(event.nativeEvent, { allowedInput: event.currentTarget })) return;
                if (event.key === "Escape") {
                  event.preventDefault();
                  queryRef.current = "";
                  setQuery("");
                  flashSearch(false);
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const matches = searchHeroes(event.currentTarget.value);
                  if (matches.length === 1) chooseHero(matches[0].key);
                }
              }}
            />
          </label>
        </>
      )}
      {/* Answering and locked controls keep their positions. Reveal names the result. */}
      <p
        className={own.heroPickerStatus}
        data-testid="hero-picker-status"
        data-state={correctHero ? "reveal" : selectedHero ? "locked" : "search"}
        aria-live={correctHero ? "polite" : "off"}
      >
        {correctHero ? (
          <>
            {answerLine?.before}
            <strong>{answerLine?.accent}</strong>
            {answerLine?.after}
            {resultLabel ? (
              <span data-result={roundAward?.correct ? "scored" : "none"} data-testid="hero-picker-result">
                {roundAward?.correct
                  ? t("round.heroPicker.resultGold", { result: resultLabel, points: number(roundAward.points) })
                  : t("round.heroPicker.result", { result: resultLabel })}
              </span>
            ) : null}
            {selectedHero && selectedHero.key !== correctHero.key ? (
              <span>{t("round.heroPicker.youPicked", { name: selectedHero.name })}</span>
            ) : null}
            {!selectedHero ? <span>{t("round.heroPicker.noPick")}</span> : null}
          </>
        ) : selectedHero ? (
          <>
            {lockedLine?.before}
            <strong>{lockedLine?.accent}</strong>
            {lockedLine?.after}
          </>
        ) : normalizedQuery ? (
          t("round.heroPicker.matches", { count: matchCount, query: query.trim() })
        ) : (
          t("round.heroPicker.total", { count: HERO_PICKER_HEROES.length })
        )}
      </p>
      <div className={own.heroPickerBoard} data-testid="hero-picker-board">
        {HERO_PICKER_CATALOG.groups.map((group) => {
          const heroes = group.heroes.filter(
            (hero) =>
              phase !== "reveal" ||
              hero.key === targetKey ||
              hero.key === selectedKey ||
              (showShares && (countByHero.get(hero.key) ?? 0) > 0),
          );
          if (!heroes.length) return null;
          return (
            <section
              key={group.key}
              className={styles.heroPickerGroup}
              data-attribute={group.key}
              data-hero-count={heroes.length}
              aria-label={t(HERO_GROUP_ARIA_KEYS[group.key])}
            >
              <h3>
                <Image
                  src={firstPartyArtSrc(HERO_ATTRIBUTE_ICONS[group.key])}
                  alt=""
                  width={18}
                  height={18}
                  unoptimized
                />
                {t(HERO_GROUP_LABEL_KEYS[group.key])}
              </h3>
              <div>
                {heroes.map((hero) => {
                  const isSearchMatch = heroMatches(hero);
                  const isSelected = selectedKey === hero.key;
                  const isCorrect = phase === "reveal" && targetKey === hero.key;
                  const count = countByHero.get(hero.key) ?? 0;
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
                      key={hero.key}
                      type="button"
                      data-testid="hero-picker-hero"
                      data-hero-key={hero.key}
                      data-state={state}
                      data-search-match={isSearchMatch ? "true" : "false"}
                      title={hero.name}
                      aria-label={hero.name}
                      aria-pressed={isSelected}
                      disabled={phase !== "answering" || selectedKey !== null}
                      onClick={() => chooseHero(hero.key)}
                    >
                      <span className={own.heroPortrait}>
                        <HeroPickerPortrait hero={hero} />
                      </span>
                      {phase === "reveal" && <strong className={own.revealHeroName}>{hero.name}</strong>}
                      {showShares && phase === "reveal" && count > 0 && <i>{percentage}%</i>}
                      {phase === "reveal" && (isCorrect || isSelected) && (
                        <span className={own.heroPickerVerdict} aria-hidden="true">
                          {isCorrect ? <Check /> : <X />}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
