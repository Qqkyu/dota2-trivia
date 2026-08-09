#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const distDir = path.resolve(root, process.env.QUEUE_ARCADE_DIST_DIR?.trim() || ".next");
const staticDir = path.join(distDir, "static");
const serverDir = path.join(distDir, "server");
const catalogFingerprints = [
  "ability-owner:abaddon_death_coil",
  "Mist Coil belongs to Abaddon",
  "shopkeeper-build:bfury",
  "soundcheck-ability:pudge_meat_hook",
  "value-order:item-price:01",
  "Cheapest to priciest: Clarity (60 gold)",
  "value-order:ability-mana:01",
  "value-order:ability-damage:01",
  "value-order:hero-move-speed:01",
  "value-order:hero-attack-range:01",
  "Lowest to highest: Meat Hook (360 damage)",
];

async function filesInside(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? filesInside(target) : [target];
    }),
  );
  return nested.flat();
}

async function fingerprintMatches(directory) {
  const files = await filesInside(directory);
  const matches = new Map(catalogFingerprints.map((fingerprint) => [fingerprint, []]));
  await Promise.all(
    files.map(async (file) => {
      const contents = await readFile(file, "utf8").catch(() => "");
      for (const fingerprint of catalogFingerprints) {
        if (contents.includes(fingerprint)) matches.get(fingerprint).push(path.relative(root, file));
      }
    }),
  );
  return matches;
}

const [clientMatches, serverMatches] = await Promise.all([
  fingerprintMatches(staticDir),
  fingerprintMatches(serverDir),
]);
const clientLeaks = [...clientMatches].filter(([, files]) => files.length > 0);
const serverEvidence = [...serverMatches].filter(([, files]) => files.length > 0);

if (clientLeaks.length) {
  throw new Error(
    clientLeaks.map(([fingerprint, files]) => `${fingerprint} leaked into ${files.join(", ")}.`).join("\n"),
  );
}
if (!serverEvidence.length) {
  throw new Error("No private-catalog fingerprint was found in the server build; the bundle audit is inconclusive.");
}

console.log(
  `Validated ${catalogFingerprints.length} private catalog fingerprints: server build only, zero browser bundles.`,
);
