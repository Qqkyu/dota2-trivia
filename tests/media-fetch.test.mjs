import { afterEach, describe, expect, it, vi } from "vitest";
import { AUDIO_HOSTS, AUDIO_TYPES, fetchMedia } from "../src/lib/media-fetch.mjs";

const source = "https://dotabase.dillerm.io/vpk/test.mp3";
const options = { hosts: AUDIO_HOSTS, types: AUDIO_TYPES, maxBytes: 8, timeoutMs: 100 };
const response = (bytes, headers = {}) =>
  new Response(Uint8Array.from(bytes), { headers: { "Content-Type": "audio/mpeg", ...headers } });
afterEach(() => vi.unstubAllGlobals());

describe("bounded remote media", () => {
  it.each([
    "http://dotabase.dillerm.io/vpk/test.mp3",
    "https://127.0.0.1/private",
    "https://dotabase.dillerm.io.evil.invalid/test.mp3",
    "https://user:password@dotabase.dillerm.io/test.mp3",
    "https://dotabase.dillerm.io:8443/test.mp3",
  ])("rejects an unsafe source before fetching %s", async (url) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(fetchMedia(url, options)).rejects.toThrow("host is not allowed");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("checks every redirect and does not contact an unapproved target", async () => {
    const fetch = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(fetchMedia(source, options)).rejects.toThrow("host is not allowed");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("accepts a relative allowlisted redirect and canonicalizes the MIME type", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "/next.wav" } }))
      .mockResolvedValueOnce(response([1, 2], { "Content-Type": "audio/x-wav; charset=binary" }));
    vi.stubGlobal("fetch", fetch);
    const result = await fetchMedia(source, options);
    expect(result.contentType).toBe("audio/wav");
    expect([...new Uint8Array(result.bytes)]).toEqual([1, 2]);
    expect(fetch.mock.calls[1][0].href).toBe("https://dotabase.dillerm.io/next.wav");
  });

  it("limits redirect chains", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 302, headers: { location: "/loop" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchMedia(source, options)).rejects.toThrow("redirect limit");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each(["text/html", "application/octet-stream", "image/svg+xml", ""])(
    "rejects unsupported MIME %s",
    async (mime) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => response([1], { "Content-Type": mime })),
      );
      await expect(fetchMedia(source, options)).rejects.toThrow("type is not allowed");
    },
  );

  it("rejects advertised oversized media before reading its body", async () => {
    const pull = vi.fn();
    const cancel = vi.fn();
    const stream = new ReadableStream({ pull, cancel }, { highWaterMark: 0 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(stream, { headers: { "Content-Type": "audio/mpeg", "Content-Length": "9" } })),
    );
    await expect(fetchMedia(source, options)).rejects.toThrow("size limit");
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("stops a headerless stream at the byte cap and cancels it", async () => {
    let chunks = 0;
    const cancel = vi.fn();
    const stream = new ReadableStream(
      {
        pull(controller) {
          chunks += 1;
          controller.enqueue(new Uint8Array(4));
        },
        cancel,
      },
      { highWaterMark: 0 },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(stream, { headers: { "Content-Type": "audio/mpeg" } })),
    );
    await expect(fetchMedia(source, options)).rejects.toThrow("size limit");
    expect(chunks).toBe(3);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("times out a stalled body even when its reader ignores the fetch signal", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ pull() {}, cancel }, { highWaterMark: 0 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(stream, { headers: { "Content-Type": "audio/mpeg" } })),
    );
    await expect(fetchMedia(source, { ...options, timeoutMs: 10 })).rejects.toThrow("timed out");
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels an in-progress body on abort", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new ReadableStream({ pull() {} }), { headers: { "Content-Type": "audio/mpeg" } })),
    );
    const pending = fetchMedia(source, { ...options, signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 1));
    controller.abort(new Error("disconnected"));
    await expect(pending).rejects.toThrow("disconnected");
  });
});
