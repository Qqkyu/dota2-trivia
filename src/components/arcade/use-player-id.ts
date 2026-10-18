import { useCallback, useRef } from "react";
import { safeBrowserStorage } from "@/lib/browser-storage.mjs";
import { PLAYER_KEY } from "./shared";

export function usePlayerId() {
  const playerIdRef = useRef("");

  const ensurePlayerId = useCallback(() => {
    if (playerIdRef.current) return playerIdRef.current;

    const tabKey = `${PLAYER_KEY}:tab`;
    const stored = safeBrowserStorage("session").getItem(tabKey);
    const id = stored ?? window.crypto.randomUUID();
    safeBrowserStorage("session").setItem(tabKey, id);
    playerIdRef.current = id;
    return id;
  }, []);

  return { playerIdRef, ensurePlayerId };
}
