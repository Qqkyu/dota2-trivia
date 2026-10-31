import { useEffect, useRef } from "react";
import { HERO_PICKER_HEROES, heroPickerPortraitSrc } from "@/lib/hero-picker";
import { SHOPKEEPER_CATALOG_ITEMS } from "@/lib/shopkeeper-catalog";
import { HERO_ATTRIBUTE_ICONS } from "./hero-picker";

/**
 * Three in flight at a time. Firing all 300 icons at once saturated a 500 kbps
 * link for close to a minute, starved the room snapshot past its timeout and
 * left the client stuck on the entry wait.
 */
const PRELOAD_CONCURRENCY = 3;

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

/**
 * Warms the browser cache for the two grids a round can open at any moment:
 * the hero portraits first, then the shop item icons. Paced, low priority,
 * and the item icons only on connections the browser reports as 4G, so a slow
 * link keeps its bandwidth for the room sync.
 */
export function useHeroPreload() {
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (connection?.saveData) return;
    const fastEnough = !connection?.effectiveType || connection.effectiveType === "4g";
    const queue = [
      ...Object.values(HERO_ATTRIBUTE_ICONS),
      ...HERO_PICKER_HEROES.map((hero) => heroPickerPortraitSrc(hero.image)),
      ...(fastEnough ? SHOPKEEPER_CATALOG_ITEMS.map((item) => item.image) : []),
    ];
    const next = () => {
      if (stoppedRef.current) return;
      const src = queue.shift();
      if (!src) return;
      const image = new window.Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.onload = next;
      image.onerror = next;
      image.src = src;
    };
    for (let lane = 0; lane < PRELOAD_CONCURRENCY; lane += 1) next();

    return () => {
      stoppedRef.current = true;
    };
  }, []);
}
