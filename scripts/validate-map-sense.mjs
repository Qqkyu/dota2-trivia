#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const locations = JSON.parse(await readFile(join(root, "src", "data", "map-sense-locations.json"), "utf8"));
const mapPath = join(root, "public", "assets", "dota2", "map", "detailed-7.40.webp");
const failures = [];
const ids = new Set();
const prompts = new Set();
const difficultyCounts = { 1: 0, 2: 0, 3: 0 };
const toleranceRanges = {
  1: [0.06, 0.12],
  2: [0.035, 0.06],
  3: [0.02, 0.035],
};

if (!Array.isArray(locations) || locations.length < 36) {
  failures.push("Map Sense needs at least 36 locations.");
}

for (const [index, location] of locations.entries()) {
  const label = location?.id ?? `location ${index}`;
  if (!location?.id || ids.has(location.id)) failures.push(`${label}: missing or duplicate id.`);
  if (!location?.prompt || prompts.has(location.prompt)) failures.push(`${label}: missing or duplicate prompt.`);
  ids.add(location.id);
  prompts.add(location.prompt);

  if (![1, 2, 3].includes(location.difficulty)) {
    failures.push(`${label}: invalid difficulty.`);
    continue;
  }
  difficultyCounts[location.difficulty] += 1;

  const { x, y } = location.target ?? {};
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0.02 ||
    x > 0.98 ||
    y < 0.02 ||
    y > 0.98
  ) {
    failures.push(`${label}: target must be a normalized on-map coordinate.`);
  }

  const [minimumTolerance, maximumTolerance] = toleranceRanges[location.difficulty];
  if (
    typeof location.tolerance !== "number" ||
    location.tolerance < minimumTolerance ||
    location.tolerance > maximumTolerance
  ) {
    failures.push(
      `${label}: difficulty ${location.difficulty} tolerance must be ${minimumTolerance}–${maximumTolerance}.`,
    );
  }

  for (const field of ["targetLabel", "eyebrow", "prompt", "explanation"]) {
    if (typeof location[field] !== "string" || !location[field].trim()) {
      failures.push(`${label}: ${field} is required.`);
    }
  }
}

const learningCount = locations.filter((location) => location.difficulty <= 2).length;
const veteranCount = locations.filter((location) => location.difficulty === 3).length;
if (learningCount < 24 || veteranCount < 24) {
  failures.push(`Map Sense needs 24-round Learning and Veteran pools (found ${learningCount} and ${veteranCount}).`);
}

try {
  const [mapBuffer, mapStats] = await Promise.all([readFile(mapPath), stat(mapPath)]);
  if (mapBuffer.subarray(0, 4).toString("ascii") !== "RIFF" || mapBuffer.subarray(8, 12).toString("ascii") !== "WEBP") {
    failures.push("Map Sense artwork is not a valid WebP container.");
  }
  if (mapStats.size < 50_000) failures.push("Map Sense artwork is unexpectedly small.");
} catch {
  failures.push("Map Sense artwork is missing.");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${locations.length} Map Sense locations (${difficultyCounts[1]} warm-up, ${difficultyCounts[2]} tricky, ${difficultyCounts[3]} brutal).`,
  );
}
