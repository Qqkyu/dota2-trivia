import { describe, expect, it, vi } from "vitest";
import { cachedAudioCut } from "../src/lib/round-audio-cache.mjs";
import { createMediaCache, createMediaQueue, MediaBusyError, waitForMedia } from "../src/lib/media-work.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const audio = (size) => ({ bytes: new ArrayBuffer(size), contentType: "audio/wav" });
const cache = (options = {}) =>
  createMediaCache({ maxEntries: 2, maxBytes: 10, maxPending: 2, ttlMs: 1_000, ...options });

describe("media admission and caching", () => {
  it("bounds active and queued work and releases capacity after errors", async () => {
    const queue = createMediaQueue(1, 1);
    const first = deferred();
    const secondWork = vi.fn(() => "second");
    const one = queue(() => first.promise);
    const two = queue(secondWork);
    await expect(queue(() => "excess")).rejects.toBeInstanceOf(MediaBusyError);
    expect(secondWork).not.toHaveBeenCalled();
    first.reject(new Error("encoder failed"));
    await expect(one).rejects.toThrow("encoder failed");
    await expect(two).resolves.toBe("second");
    await expect(queue(() => "later")).resolves.toBe("later");
  });

  it("shares pending cuts for a real clue burst and retains the completed result", async () => {
    const source = `test:${Date.now()}`;
    const bytes = new ArrayBuffer(4);
    const cut = vi.fn(async () => bytes);
    const responses = await Promise.all(
      Array.from({ length: 65 }, () => cachedAudioCut(source, 0.24, "audio/mpeg", cut)),
    );
    expect(cut).toHaveBeenCalledTimes(1);
    expect(responses.every((response) => response.bytes === bytes)).toBe(true);
    await cachedAudioCut(source, 0.24, "audio/mpeg", cut);
    expect(cut).toHaveBeenCalledTimes(1);
    await cachedAudioCut(source, 0.56, "audio/mpeg", cut);
    expect(cut).toHaveBeenCalledTimes(2);
  });

  it("bounds pending keys without evicting duplicate work", async () => {
    const store = cache({ maxPending: 1 });
    const work = deferred();
    const original = store.load("one", () => work.promise);
    expect(
      store.load("one", () => {
        throw new Error("duplicate");
      }),
    ).toBe(original);
    await expect(store.load("two", () => audio(2))).rejects.toBeInstanceOf(MediaBusyError);
    work.resolve(audio(2));
    await original;
    await expect(store.load("two", () => audio(2))).resolves.toMatchObject({ bytes: expect.any(ArrayBuffer) });
  });

  it("evicts by total bytes and least recent access without exceeding entry count", async () => {
    const store = cache();
    await store.load("one", () => audio(4));
    await store.load("two", () => audio(4));
    await store.get("one");
    await store.load("three", () => audio(4));
    expect(store.get("two")).toBeNull();
    expect(store.get("one")).not.toBeNull();
    await store.load("large", () => audio(8));
    expect(store.get("one")).toBeNull();
    expect(store.get("three")).toBeNull();
    await store.load("oversized", () => audio(11));
    expect(store.get("oversized")).toBeNull();
  });

  it("expires successful entries and retries failed work", async () => {
    vi.useFakeTimers();
    try {
      const store = cache();
      await store.load("one", () => audio(1));
      vi.advanceTimersByTime(1_001);
      expect(store.get("one")).toBeNull();
      await expect(
        store.load("one", () => {
          throw new Error("broken");
        }),
      ).rejects.toThrow("broken");
      await expect(store.load("one", () => audio(1))).resolves.toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets a disconnected caller leave shared work without cancelling another caller", async () => {
    const job = deferred();
    const controller = new AbortController();
    const caller = waitForMedia(job.promise, controller.signal);
    const other = waitForMedia(job.promise, new AbortController().signal);
    controller.abort(new Error("disconnected"));
    await expect(caller).rejects.toThrow("disconnected");
    job.resolve(audio(2));
    await expect(other).resolves.toBeDefined();
  });

  it("observes a shared job rejection when its caller was already disconnected", async () => {
    const controller = new AbortController();
    controller.abort(new Error("already disconnected"));
    const job = deferred();
    await expect(waitForMedia(job.promise, controller.signal)).rejects.toThrow("already disconnected");
    job.reject(new Error("job failed later"));
    // Vitest fails this test run if the original promise has no rejection handler.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
