import { describe, expect, it } from "vitest";
import { createSafeStorage } from "../src/lib/browser-storage.mjs";

describe("optional browser persistence", () => {
  it("retains an in-memory fallback when a browser storage API is absent", () => {
    const storage = createSafeStorage(() => null);
    storage.setItem("id", "fallback-id");
    expect(storage.getItem("id")).toBe("fallback-id");
  });
  it("keeps IDs and settings in memory when the storage getter is blocked", () => {
    const storage = createSafeStorage(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(storage.getItem("id")).toBeNull();
    storage.setItem("id", "tab-player");
    expect(storage.getItem("id")).toBe("tab-player");
    storage.removeItem("id");
    expect(storage.getItem("id")).toBeNull();
  });

  it("preserves the latest value after a quota failure", () => {
    const storage = createSafeStorage(() => ({
      getItem: () => "old",
      setItem: () => {
        throw new DOMException("Full", "QuotaExceededError");
      },
    }));
    expect(storage.getItem("settings")).toBe("old");
    storage.setItem("settings", "new");
    expect(storage.getItem("settings")).toBe("new");
  });

  it("reads updates made by another tab while storage is available", () => {
    const values = new Map();
    const storage = createSafeStorage(() => ({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    }));
    storage.setItem("stats", "one answer");
    values.set("stats", "two answers");
    expect(storage.getItem("stats")).toBe("two answers");
  });
});
