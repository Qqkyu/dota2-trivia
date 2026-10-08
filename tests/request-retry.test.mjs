import { afterEach, describe, expect, it, vi } from "vitest";
import { requestWithRetry } from "../src/lib/request-retry.mjs";

afterEach(() => vi.useRealTimers());

describe("entry request recovery", () => {
  it("retries a transient first failure and returns the next result", async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockRejectedValueOnce(new Error("503")).mockResolvedValue("round");
    const pending = requestWithRetry(request);
    await vi.runAllTimersAsync();
    expect(await pending).toBe("round");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("replaces a hung first request after its deadline", async () => {
    vi.useFakeTimers();
    const request = vi
      .fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue("round");
    const pending = requestWithRetry(request);
    await vi.runAllTimersAsync();
    expect(await pending).toBe("round");
    expect(request.mock.calls[0][0].aborted).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("stops retrying when navigation cancels entry", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const request = vi.fn().mockImplementation(() => new Promise(() => {}));
    const pending = requestWithRetry(request, { signal: controller.signal });
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejection;
    await vi.runAllTimersAsync();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("ends after three failed attempts", async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockRejectedValue(new Error("503"));
    const pending = requestWithRetry(request);
    const rejection = expect(pending).rejects.toThrow("503");
    await vi.runAllTimersAsync();
    await rejection;
    expect(request).toHaveBeenCalledTimes(3);
  });
});
