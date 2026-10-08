import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedRoundImage } from "../src/lib/round-image-cache.mjs";

afterEach(() => vi.unstubAllGlobals());

describe("portrait clue processing", () => {
  it("shares source downloads and transformations during a clue burst", async () => {
    const original = await sharp({
      create: { width: 512, height: 288, channels: 3, background: { r: 80, g: 140, b: 210 } },
    })
      .png()
      .toBuffer();
    const fetch = vi.fn(async () => new Response(original, { headers: { "Content-Type": "image/png" } }));
    vi.stubGlobal("fetch", fetch);
    const source = `https://cdn.steamstatic.com/portrait-${Date.now()}.png`;
    const results = await Promise.all(Array.from({ length: 20 }, () => cachedRoundImage(source, 1)));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(results.every((result) => result === results[0])).toBe(true);
    const finalClue = await cachedRoundImage(source, 3);
    expect(fetch).toHaveBeenCalledTimes(1);
    const metadata = await sharp(finalClue.bytes).metadata();
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(288);
    expect(metadata.format).toBe("png");
    expect(finalClue.bytes.equals(results[0].bytes)).toBe(false);
  });

  it("rejects too many distinct image jobs before more downloads start", async () => {
    const fetch = vi.fn(async () => new Response("invalid image", { headers: { "Content-Type": "image/png" } }));
    vi.stubGlobal("fetch", fetch);
    const results = await Promise.allSettled(
      Array.from({ length: 11 }, (_, index) =>
        cachedRoundImage(`https://cdn.steamstatic.com/burst-${Date.now()}-${index}.png`, 1),
      ),
    );
    expect(
      results.filter((result) => result.status === "rejected" && result.reason.name === "MediaBusyError"),
    ).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(10);
  });

  it("rejects a local path outside the public asset directory", async () => {
    await expect(cachedRoundImage("/../package.json", 1)).rejects.toThrow("outside public");
  });
});
