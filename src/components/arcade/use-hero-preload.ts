import { useEffect, useRef } from "react";
import { HERO_PICKER_HEROES, heroPickerPortraitSrc } from "@/lib/hero-picker";
import { HERO_ATTRIBUTE_ICONS } from "./hero-picker";

export function useHeroPreload() {
  const heroPreloadsRef = useRef<HTMLImageElement[]>([]);

  useEffect(() => {
    const sources = [
      ...Object.values(HERO_ATTRIBUTE_ICONS),
      ...HERO_PICKER_HEROES.map((hero) => heroPickerPortraitSrc(hero.image)),
    ];
    heroPreloadsRef.current = sources.map((src) => {
      const image = new window.Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.src = src;
      return image;
    });

    return () => {
      heroPreloadsRef.current = [];
    };
  }, []);
}
