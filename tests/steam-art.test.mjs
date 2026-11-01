import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import nextConfig from "../next.config.mjs";
import { ART_ROUTE, firstPartyArtSrc, steamArtTarget } from "../src/lib/steam-art.mjs";
import { artCacheStatsForTests, cachedSteamArt, resetArtCacheForTests } from "../src/lib/steam-art-cache.mjs";
import { safeAvatarUrl } from "../src/lib/steam-profile.mjs";

const ART_URL = /https:\/\/cdn(?:\.cloudflare)?\.steamstatic\.com\/[^"'\s)`]+/g;
const roundTrip = (local) => {
  const [host, ...segments] = local
    .slice(ART_ROUTE.length + 1)
    .split("?")[0]
    .split("/");
  const search = local.includes("?") ? `?${local.split("?")[1]}` : "";
  return steamArtTarget(host, segments, search);
};

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? sourceFiles(join(directory, entry.name))
        : /\.(?:json|mjs|ts|tsx)$/.test(entry.name)
          ? [join(directory, entry.name)]
          : [],
    ),
  );
  return nested.flat();
}

describe("first-party Steam art", () => {
  it("serves every Valve art URL the app ships from this site", async () => {
    const urls = new Set();
    for (const file of await sourceFiles("src")) {
      for (const match of (await readFile(file, "utf8")).matchAll(ART_URL)) {
        if (!match[0].includes("${")) urls.add(match[0]);
      }
    }
    expect(urls.size).toBeGreaterThan(100);
    const unmapped = [...urls].filter((url) => {
      const local = firstPartyArtSrc(url);
      return !local.startsWith(`${ART_ROUTE}/`) || roundTrip(local) !== url;
    });
    expect(unmapped).toEqual([]);
  });

  it("maps Steam avatars and leaves local sources alone", () => {
    expect(firstPartyArtSrc("https://avatars.steamstatic.com/abc123_full.jpg")).toBe(
      "/api/art/avatars.steamstatic.com/abc123_full.jpg",
    );
    expect(firstPartyArtSrc("/api/round-image?roundId=x")).toBe("/api/round-image?roundId=x");
    expect(firstPartyArtSrc("/arcade/first-blood-splash.png")).toBe("/arcade/first-blood-splash.png");
    expect(firstPartyArtSrc(null)).toBe(null);
  });

  it("refuses anything outside the Dota art folder, the shipped queries and the avatar hosts", () => {
    const art = ["apps", "dota2", "images", "dota_react", "heroes", "axe.png"];
    expect(steamArtTarget("cdn.cloudflare.steamstatic.com", art)).toBe(
      "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/axe.png",
    );
    expect(steamArtTarget("cdn.cloudflare.steamstatic.com", art, "?t=1593393829403")).not.toBe(null);
    expect(steamArtTarget("cdn.cloudflare.steamstatic.com", art, "?a=1")).toBe(null);
    expect(steamArtTarget("evil.example", art)).toBe(null);
    expect(steamArtTarget("cdn.steamstatic.com", ["apps", "570", "header.jpg"])).toBe(null);
    expect(steamArtTarget("cdn.steamstatic.com", ["apps", "dota2", "images", "..", "secret.png"])).toBe(null);
    expect(steamArtTarget("cdn.steamstatic.com", ["apps", "dota2", "images", "a%2Fb.png"])).toBe(null);
    expect(steamArtTarget("avatars.steamstatic.com", ["abc_full.jpg"], "?size=1")).toBe(null);
    expect(steamArtTarget("cdn.steamstatic.com", [])).toBe(null);
  });

  it("keeps the image optimizer off, so it cannot fetch on request", () => {
    expect(nextConfig.images.unoptimized).toBe(true);
    expect(nextConfig.images.remotePatterns).toBeUndefined();
  });

  it("stores Steam avatars without a query string", () => {
    expect(safeAvatarUrl("https://avatars.steamstatic.com/abc_full.jpg?x=1#y")).toBe(
      "https://avatars.steamstatic.com/abc_full.jpg",
    );
    expect(safeAvatarUrl("https://evil.example/abc_full.jpg")).toBe(null);
  });
});

describe("Steam art cache", () => {
  afterEach(() => resetArtCacheForTests());
  const png = (size) => ({ bytes: new Uint8Array(size).buffer, contentType: "image/png" });

  it("downloads each URL once, even for concurrent requests", async () => {
    let downloads = 0;
    const fetcher = async () => {
      downloads += 1;
      return png(1_000);
    };
    const url = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/axe.png";
    await Promise.all([cachedSteamArt(url, { fetcher }), cachedSteamArt(url, { fetcher })]);
    await cachedSteamArt(url, { fetcher });
    expect(downloads).toBe(1);
  });

  it("refetches after twelve hours and stays inside its memory limit", async () => {
    let downloads = 0;
    const fetcher = async () => {
      downloads += 1;
      return png(5 * 1024 * 1024);
    };
    const base = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/hero";
    for (let index = 0; index < 20; index += 1) await cachedSteamArt(`${base}${index}.png`, { fetcher, now: 0 });
    expect(artCacheStatsForTests().bytes).toBeLessThanOrEqual(48 * 1024 * 1024);
    await cachedSteamArt(`${base}19.png`, { fetcher, now: 13 * 60 * 60 * 1000 });
    expect(downloads).toBe(21);
  });
});

describe("round payload art", () => {
  it("rewrites every Valve address in a nested payload and leaves the rest", async () => {
    const { firstPartyArtTree } = await import("../src/lib/steam-art.mjs");
    const payload = {
      prompt: "Which hero?",
      answerImages: [
        "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/axe.png",
        "/arcade/x.svg",
      ],
      valueOrder: {
        cards: [{ key: "a", image: "https://cdn.steamstatic.com/apps/dota2/images/dota_react/items/blink.png" }],
      },
      count: 3,
      empty: null,
    };
    const mapped = firstPartyArtTree(payload);
    expect(JSON.stringify(mapped)).not.toContain("https://");
    expect(mapped.answerImages[1]).toBe("/arcade/x.svg");
    expect(mapped.count).toBe(3);
    expect(payload.answerImages[0]).toContain("https://");
  });
});
