import { useCallback, useEffect, useRef } from "react";

export function useAlphaSession({ ensurePlayerId }: { ensurePlayerId: () => string }) {
  const alphaSessionIdRef = useRef("");

  const alphaSessionFinishedRef = useRef(false);

  const sendAlphaSessionEvent = useCallback(
    async (action: "start" | "finish", sessionId: string) => {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: action === "finish",
        body: JSON.stringify({ action, sessionId, voterId: ensurePlayerId() }),
      });
      if (!response.ok) throw new Error("Alpha session unavailable.");
    },
    [ensurePlayerId],
  );

  const finishAlphaSession = useCallback(() => {
    const sessionId = alphaSessionIdRef.current;
    if (!sessionId || alphaSessionFinishedRef.current) return;
    alphaSessionFinishedRef.current = true;
    void sendAlphaSessionEvent("finish", sessionId).catch(() => undefined);
  }, [sendAlphaSessionEvent]);

  useEffect(() => {
    const handlePageHide = () => finishAlphaSession();
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [finishAlphaSession]);

  return {
    alphaSessionIdRef,
    alphaSessionFinishedRef,
    sendAlphaSessionEvent,
    finishAlphaSession,
  };
}
