/** Keep the current tab usable when browser storage is blocked or full. */
export function createSafeStorage(resolveStorage) {
  const fallback = new Map();
  let unavailable = false;
  const storage = () => {
    const value = resolveStorage();
    if (!value) throw new Error("Browser storage unavailable");
    return value;
  };
  return {
    getItem(key) {
      if (!unavailable) {
        try {
          const value = storage().getItem(key) ?? null;
          if (value === null) fallback.delete(key);
          else fallback.set(key, value);
          return value;
        } catch {
          unavailable = true;
        }
      }
      return fallback.get(key) ?? null;
    },
    setItem(key, value) {
      fallback.set(key, String(value));
      if (!unavailable) {
        try {
          storage().setItem(key, String(value));
        } catch {
          unavailable = true;
        }
      }
    },
    removeItem(key) {
      fallback.delete(key);
      if (!unavailable) {
        try {
          storage().removeItem(key);
        } catch {
          unavailable = true;
        }
      }
    },
  };
}

const stores = new Map();

/** @param {"local" | "session"} kind */
export function safeBrowserStorage(kind = "local") {
  if (!stores.has(kind)) {
    stores.set(
      kind,
      createSafeStorage(() => (typeof window === "undefined" ? null : window[`${kind}Storage`])),
    );
  }
  return stores.get(kind);
}
