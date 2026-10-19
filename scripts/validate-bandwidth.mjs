#!/usr/bin/env node

import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOM_SYNC_HEARTBEAT_MS } from "../src/lib/room-sync.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const read = (path) => readFile(join(root, path), "utf8");

const [profile, steamAvatar, nextConfig, roundsRoute, roundAudioRoute, roundAudioCache] = await Promise.all([
  read("src/app/profile/page.tsx"),
  read("src/components/steam-avatar.tsx"),
  read("next.config.mjs"),
  read("src/app/api/rounds/route.ts"),
  read("src/app/api/round-audio/route.ts"),
  read("src/lib/round-audio-cache.mjs"),
]);

if (ROOM_SYNC_HEARTBEAT_MS !== 5_000) {
  failures.push("The public room returned to a one-second polling cadence.");
}

for (const [label, source, pattern] of [
  ["profile Steam avatar", profile, /<SteamAvatar[\s\S]*?src=\{user\.avatarUrl\}/],
  ["Steam avatar stays unproxied", steamAvatar, /unoptimized/],
]) {
  if (!pattern.test(source)) failures.push(`The ${label} is being proxied through Next Image again.`);
}

const iconPath = join(root, "src", "app", "icon.png");
const icon = await readFile(iconPath);
const iconBytes = (await stat(iconPath)).size;
if (iconBytes > 32_000 || icon.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
  failures.push(`The app icon is no longer a compact PNG (found ${iconBytes.toLocaleString()} bytes).`);
}

try {
  await access(join(root, "src", "app", "favicon.ico"), constants.F_OK);
  failures.push("The former 348 KB multi-size favicon returned alongside the compact app icon.");
} catch {
  // The compact app icon intentionally replaces it.
}

if (
  !nextConfig.includes('source: "/icon.png"') ||
  !nextConfig.includes('value: "public, max-age=31536000, immutable"') ||
  !nextConfig.includes('source: "/assets/dota2/sounds/:path*"') ||
  !nextConfig.includes('value: "public, max-age=2592000, stale-while-revalidate=86400"')
) {
  failures.push("Stable local Dota feedback sounds lost their browser-cache policy.");
}

if (!roundsRoute.includes('"Cache-Control": "no-store"')) {
  failures.push("Player-specific live-round snapshots must remain uncacheable.");
}

if (
  !roundAudioRoute.includes('"Cache-Control": "private, max-age=60"') ||
  !roundAudioCache.includes('"Cache-Control": "private, max-age=60"')
) {
  failures.push("Answer-sensitive round audio must remain private rather than entering a shared cache.");
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(
  `Validated a ${ROOM_SYNC_HEARTBEAT_MS}ms room heartbeat, deadline-driven clues, direct remote images, a ${iconBytes.toLocaleString()} byte app icon, and safe cache boundaries.`,
);
