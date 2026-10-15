import { describe, expect, it, vi, afterEach } from "vitest";
import { auditImageAssets, questionImageUrls } from "../scripts/image-assets.mjs";

afterEach(() => vi.unstubAllGlobals());

describe("content asset coverage", () => {
  it("checks images on Flashback cards and in the reveal", () => {
    expect(
      questionImageUrls({
        flashback: {
          cards: [{ image: "https://example.com/card.png" }],
          revealMedia: { src: "/arcade/flashback/reveal.jpg" },
        },
      }),
    ).toEqual(["https://example.com/card.png", "/arcade/flashback/reveal.jpg"]);
  });

  it("rejects an HTML error page returned with HTTP 200 for an image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>Denied</html>", { headers: { "content-type": "text/html" } })),
    );
    const result = await auditImageAssets([{ image: { src: "https://example.com/missing.png" } }]);
    expect(result.availability.get("https://example.com/missing.png")).toBe(false);
  });
});
