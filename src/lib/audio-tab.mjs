const AUDIO_TAB_KEY = "queue-arcade:audio-tab:v1";

// The last game tab the player used owns audio. Keep ownership when it is
// hidden by another application; a second game tab must explicitly take it.
export function claimAudioTab(onLost, host = window) {
  const token = host.crypto.randomUUID();
  const document = host.document;

  function isOwner() {
    try {
      return host.localStorage.getItem(AUDIO_TAB_KEY) === token;
    } catch {
      // Storage can be disabled. Only the focused, visible page may play then.
      return !document.hidden && document.hasFocus();
    }
  }

  function claim() {
    if (document.hidden || !document.hasFocus()) return;
    try {
      if (!isOwner()) host.localStorage.setItem(AUDIO_TAB_KEY, token);
    } catch {
      // isOwner() supplies a focus-only fallback.
    }
  }

  function interact(event) {
    if (event.isTrusted) claim();
  }

  function focusChanged() {
    claim();
    if (!isOwner()) onLost();
  }

  function changed(event) {
    if ((event.key === AUDIO_TAB_KEY || event.key === null) && !isOwner()) onLost();
  }

  function release() {
    try {
      if (isOwner()) host.localStorage.removeItem(AUDIO_TAB_KEY);
    } catch {
      // No shared ownership was stored.
    }
  }

  host.addEventListener("focus", focusChanged);
  host.addEventListener("blur", focusChanged);
  host.addEventListener("pointerdown", interact, true);
  host.addEventListener("keydown", interact, true);
  host.addEventListener("storage", changed);
  host.addEventListener("pagehide", release);
  document.addEventListener("visibilitychange", focusChanged);
  claim();

  return {
    isOwner,
    dispose() {
      host.removeEventListener("focus", focusChanged);
      host.removeEventListener("blur", focusChanged);
      host.removeEventListener("pointerdown", interact, true);
      host.removeEventListener("keydown", interact, true);
      host.removeEventListener("storage", changed);
      host.removeEventListener("pagehide", release);
      document.removeEventListener("visibilitychange", focusChanged);
      release();
    },
  };
}
