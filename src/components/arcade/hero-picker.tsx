import Image from "next/image";
import { Check, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { shouldHandleAnswerShortcut } from "@/lib/answer-shortcuts.mjs";
import type { CrowdResult } from "@/lib/arcade-contract";
import {
  HERO_PICKER_BY_KEY,
  HERO_PICKER_CATALOG,
  HERO_PICKER_HEROES,
  heroPickerPortraitSrc,
  type HeroPickerHero,
} from "@/lib/hero-picker";
import type { PublicArcadeQuestion } from "@/lib/public-question";
import type { GamePhase } from "./shared";
import styles from "../queue-arcade.module.css";
import own from "./hero-picker.module.css";

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
  return name.includes(normalizedQuery) || slug.includes(normalizedQuery) || initials.startsWith(normalizedQuery);
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
  onChoose,
}: {
  question: PublicArcadeQuestion;
  phase: GamePhase;
  selectedKey: string | null;
  crowd: CrowdResult;
  onChoose: (heroKey: string) => void;
}) {
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
      className={styles.heroPicker}
      data-testid="hero-picker"
      data-phase={phase}
      data-locked={selectedKey ? "true" : "false"}
      data-searching={normalizedQuery ? "true" : "false"}
      style={{ "--hero-grid-columns": HERO_PICKER_CATALOG.columns } as CSSProperties}
    >
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
          aria-label="Filter heroes"
          type="search"
          enterKeyHint="go"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search heroes"
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
      {/* Fixed-height status line: the filter count while answering, the lock,
          then the correct hero's name on reveal. Nothing below it moves. */}
      <p
        className={own.heroPickerStatus}
        data-testid="hero-picker-status"
        data-state={correctHero ? "reveal" : selectedHero ? "locked" : "search"}
        aria-live={correctHero ? "polite" : "off"}
      >
        {correctHero ? (
          <>
            Answer: <strong>{correctHero.name}</strong>
            {selectedHero && selectedHero.key !== correctHero.key ? (
              <span>· You picked {selectedHero.name}</span>
            ) : null}
            {!selectedHero ? <span>· No pick</span> : null}
          </>
        ) : selectedHero ? (
          <>
            Locked: <strong>{selectedHero.name}</strong>
          </>
        ) : normalizedQuery ? (
          `${matchCount} ${matchCount === 1 ? "hero matches" : "heroes match"} “${query.trim()}”`
        ) : (
          `${HERO_PICKER_HEROES.length} heroes · type to filter`
        )}
      </p>
      <div className={own.heroPickerBoard} data-testid="hero-picker-board">
        {HERO_PICKER_CATALOG.groups.map((group) => (
          <section
            key={group.key}
            className={styles.heroPickerGroup}
            data-attribute={group.key}
            data-hero-count={group.heroes.length}
            aria-label={`${group.label} heroes`}
          >
            <h3>
              <Image src={HERO_ATTRIBUTE_ICONS[group.key]} alt="" width={18} height={18} unoptimized />
              {group.label}
            </h3>
            <div>
              {group.heroes.map((hero) => {
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
                    <HeroPickerPortrait hero={hero} />
                    {phase === "reveal" && count > 0 && <i>{percentage}%</i>}
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
        ))}
      </div>
    </div>
  );
}
