import { useEffect, useState } from "react";
import { readGuestLifetimeStats } from "@/lib/guest-accuracy.mjs";
import { safeBrowserStorage } from "@/lib/browser-storage.mjs";
import { loadGuestLifetimeStats } from "@/lib/guest-lifetime-storage.mjs";
import {
  DEFAULT_GAME_VOLUME,
  EMPTY_STATS,
  LEGACY_SETTINGS_KEY,
  LEGACY_STORAGE_KEY,
  MIN_GAME_VOLUME,
  PREVIOUS_SETTINGS_KEY,
  SETTINGS_KEY,
  STORAGE_KEY,
  type LifetimeStats,
} from "./shared";

export function usePlayerSettings({ ensurePlayerId }: { ensurePlayerId: () => string }) {
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [gameVolume, setGameVolume] = useState(DEFAULT_GAME_VOLUME);

  const [lifetimeStats, setLifetimeStats] = useState<LifetimeStats>(EMPTY_STATS);

  const [statsLoaded, setStatsLoaded] = useState(false);

  useEffect(() => {
    const hydration = window.setTimeout(async () => {
      try {
        const storedStats =
          safeBrowserStorage("local").getItem(STORAGE_KEY) ?? safeBrowserStorage("local").getItem(LEGACY_STORAGE_KEY);
        const currentSettings = safeBrowserStorage("local").getItem(SETTINGS_KEY);
        const storedSettings =
          currentSettings ??
          safeBrowserStorage("local").getItem(PREVIOUS_SETTINGS_KEY) ??
          safeBrowserStorage("local").getItem(LEGACY_SETTINGS_KEY);
        if (storedStats) {
          const storage = safeBrowserStorage("local");
          const statsKey = storage.getItem(STORAGE_KEY) === null ? LEGACY_STORAGE_KEY : STORAGE_KEY;
          const loaded = readGuestLifetimeStats(storage, statsKey);
          if (statsKey === LEGACY_STORAGE_KEY) storage.setItem(STORAGE_KEY, JSON.stringify(loaded));
          setLifetimeStats(loaded);
        }
        if (storedSettings) {
          const settings = JSON.parse(storedSettings) as {
            soundEnabled?: boolean;
            gameVolume?: number;
          };
          if (typeof settings.soundEnabled === "boolean") setSoundEnabled(settings.soundEnabled);
          if (typeof settings.gameVolume === "number" && Number.isFinite(settings.gameVolume)) {
            const stored = Math.min(1, Math.max(MIN_GAME_VOLUME, settings.gameVolume));
            const fromInaudibleDefault = !currentSettings && stored <= 0.1;
            setGameVolume(fromInaudibleDefault ? DEFAULT_GAME_VOLUME : stored);
          }
        }
        ensurePlayerId();
        const { value, current } = await loadGuestLifetimeStats(safeBrowserStorage("local"));
        if (current) setLifetimeStats(value);
      } catch {
        // Corrupt local data should never stop a round from starting.
      } finally {
        setStatsLoaded(true);
      }
    }, 0);

    return () => window.clearTimeout(hydration);
  }, [ensurePlayerId]);

  useEffect(() => {
    const refreshLifetime = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        void loadGuestLifetimeStats(safeBrowserStorage("local")).then(({ value, current }) => {
          if (current) setLifetimeStats(value);
        });
      }
    };
    window.addEventListener("storage", refreshLifetime);
    return () => window.removeEventListener("storage", refreshLifetime);
  }, []);

  useEffect(() => {
    if (!statsLoaded) return;
    safeBrowserStorage("local").setItem(SETTINGS_KEY, JSON.stringify({ soundEnabled, gameVolume }));
  }, [gameVolume, soundEnabled, statsLoaded]);

  return {
    soundEnabled,
    setSoundEnabled,
    gameVolume,
    setGameVolume,
    lifetimeStats,
    setLifetimeStats,
    statsLoaded,
  };
}
