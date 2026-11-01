import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern.js";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config.mjs";
import { safeAvatarUrl } from "../src/lib/steam-profile.mjs";

const patterns = nextConfig.images.remotePatterns;
const allowed = (href) => hasRemoteMatch([], patterns, new URL(href));
const ART_URL = /https:\/\/cdn(?:\.cloudflare)?\.steamstatic\.com\/[^"'\s)`]+/g;

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

describe("image optimizer remote patterns", () => {
  it("allow every Steam art URL the app ships", async () => {
    const urls = new Set();
    for (const file of await sourceFiles("src")) {
      for (const match of (await readFile(file, "utf8")).matchAll(ART_URL)) urls.add(match[0]);
    }
    expect(urls.size).toBeGreaterThan(100);
    expect([...urls].filter((href) => !allowed(href))).toEqual([]);
  });

  it("refuse other query strings, so callers cannot mint new optimizer work", () => {
    const art = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/axe.png";
    expect(allowed(art)).toBe(true);
    expect(allowed(`${art}?t=1593393829403`)).toBe(true);
    expect(allowed(`${art}?a=1`)).toBe(false);
    expect(allowed(`${art}?t=1`)).toBe(false);
    expect(allowed("https://avatars.steamstatic.com/abc_full.jpg")).toBe(true);
    expect(allowed("https://avatars.steamstatic.com/abc_full.jpg?x=1")).toBe(false);
  });

  it("store Steam avatars without a query string", () => {
    expect(safeAvatarUrl("https://avatars.steamstatic.com/abc_full.jpg?x=1#y")).toBe(
      "https://avatars.steamstatic.com/abc_full.jpg",
    );
    expect(safeAvatarUrl("https://evil.example/abc_full.jpg")).toBe(null);
  });
});
