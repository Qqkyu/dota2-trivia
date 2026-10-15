import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const STATS_KEY = "queue-arcade:stats:v2";
function legacyStorage() {
  const values = new Map([[STATS_KEY, JSON.stringify({ runs: 1, answered: 4, correct: 2, bestScore: 300 })]]);
  return { getItem: (key) => values.get(key) ?? null, setItem: vi.fn((key, value) => values.set(key, value)) };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("indexedDB", {
    open() {
      throw new Error("Denied");
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("guest lifetime fallback", () => {
  it("serializes page-local updates without writing shared legacy storage", async () => {
    const { updateGuestLifetimeStorage, loadGuestLifetimeStats } = await import(
      "../src/lib/guest-lifetime-storage.mjs"
    );
    const storage = legacyStorage();
    const increment = (snapshot) => {
      const stats = JSON.parse(snapshot.getItem(STATS_KEY));
      stats.answered += 1;
      snapshot.setItem(STATS_KEY, JSON.stringify(stats));
      return stats;
    };
    const [first, second] = await Promise.all([
      updateGuestLifetimeStorage(storage, increment),
      updateGuestLifetimeStorage(storage, increment),
    ]);
    expect(first.value.answered).toBe(5);
    expect(second.value.answered).toBe(6);
    expect(second.persisted).toBe(false);
    expect((await loadGuestLifetimeStats(storage)).value.answered).toBe(6);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(JSON.parse(storage.getItem(STATS_KEY)).answered).toBe(4);
  });

  it("discards partial fallback changes when the callback throws a falsy value", async () => {
    const { updateGuestLifetimeStorage, loadGuestLifetimeStats } = await import(
      "../src/lib/guest-lifetime-storage.mjs"
    );
    const storage = legacyStorage();
    await expect(
      updateGuestLifetimeStorage(storage, (snapshot) => {
        snapshot.setItem(STATS_KEY, JSON.stringify({ runs: 1, answered: 999, correct: 2, bestScore: 300 }));
        throw null;
      }),
    ).rejects.toBeNull();
    expect((await loadGuestLifetimeStats(storage)).value.answered).toBe(4);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
