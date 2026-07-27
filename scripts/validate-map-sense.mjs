#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const locations = JSON.parse(await readFile(join(root, "src", "data", "map-sense-locations.json"), "utf8"));
const challenges = JSON.parse(await readFile(join(root, "src", "data", "map-sense-challenges.json"), "utf8"));
const crops = JSON.parse(await readFile(join(root, "src", "data", "map-sense-crops.json"), "utf8"));
const landmarkSnapshot = JSON.parse(await readFile(join(root, "src", "data", "map-sense-landmarks.json"), "utf8"));
const mapPath = join(root, "public", "assets", "dota2", "map", "overview-7.41d.webp");
const failures = [];
const ids = new Set();
const difficultyCounts = { 1: 0, 2: 0, 3: 0 };
const challengeFamilies = ["riddle", "mirror", "relative", "scenario"];
const toleranceRanges = {
  1: [0.06, 0.12],
  2: [0.035, 0.06],
  3: [0.02, 0.035],
};

if (!Array.isArray(locations) || locations.length < 36) {
  failures.push("Map Sense needs at least 36 locations.");
}

if (!Array.isArray(challenges) || challenges.length < 48) {
  failures.push("Map Sense needs at least 48 creative challenges.");
}

if (
  !Array.isArray(crops.tricky) ||
  crops.tricky.length < 24 ||
  !Array.isArray(crops.brutal) ||
  crops.brutal.length < 36
) {
  failures.push("Map Sense needs at least 24 Tricky and 36 Brutal terrain crops.");
}

const cropDefinitions = [
  ...(crops.tricky ?? []).map((crop) => ({
    id: `tricky:${crop.id}`,
    family: "crop",
    targetLabel: "the marked terrain point",
    difficulty: 2,
    target: { x: crop.x, y: crop.y },
    tolerance: 0.042,
    eyebrow: "Map Sense · Terrain match",
    prompt: "Place this reticle.",
    explanation: "The crop center is the target.",
    zoom: 5.6,
  })),
  ...(crops.brutal ?? []).map((crop) => ({
    id: `brutal:${crop.id}`,
    family: "crop",
    targetLabel: "the marked terrain point",
    difficulty: 3,
    target: { x: crop.x, y: crop.y },
    tolerance: 0.024,
    eyebrow: "Map Sense · Terrain match",
    prompt: "Place this reticle.",
    explanation: "The crop center is the target.",
    zoom: 8.4,
  })),
];
const allDefinitions = [
  ...locations.map((location) => ({ ...location, family: "location" })),
  ...challenges,
  ...cropDefinitions,
];

function validPosition(position) {
  const { x, y } = position ?? {};
  return (
    typeof x === "number" &&
    typeof y === "number" &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= 0.02 &&
    x <= 0.98 &&
    y >= 0.02 &&
    y <= 0.98
  );
}

for (const [index, location] of allDefinitions.entries()) {
  const label = location?.id ?? `definition ${index}`;
  const scopedId = `${location.family}:${location.id}`;
  if (!location?.id || ids.has(scopedId)) failures.push(`${label}: missing or duplicate family-scoped id.`);
  ids.add(scopedId);

  if (![1, 2, 3].includes(location.difficulty)) {
    failures.push(`${label}: invalid difficulty.`);
    continue;
  }
  difficultyCounts[location.difficulty] += 1;

  if (!validPosition(location.target)) {
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

for (const family of challengeFamilies) {
  const familyQuestions = challenges.filter((challenge) => challenge.family === family);
  const trickyCount = familyQuestions.filter((challenge) => challenge.difficulty === 2).length;
  const brutalCount = familyQuestions.filter((challenge) => challenge.difficulty === 3).length;
  if (familyQuestions.length < 12 || trickyCount < 6 || brutalCount < 6) {
    failures.push(
      `${family}: needs 12 questions split across Tricky and Brutal (found ${familyQuestions.length}, ${trickyCount}/${brutalCount}).`,
    );
  }
}

for (const challenge of challenges) {
  if (!challengeFamilies.includes(challenge.family)) {
    failures.push(`${challenge.id}: unknown Map Sense family.`);
    continue;
  }

  if (challenge.family === "riddle") continue;
  if (
    !challenge.reference ||
    !validPosition(challenge.reference.position) ||
    typeof challenge.reference.label !== "string" ||
    !challenge.reference.label.trim()
  ) {
    failures.push(`${challenge.id}: ${challenge.family} challenges need a labeled normalized reference pin.`);
    continue;
  }

  const referenceDistance = Math.hypot(
    challenge.reference.position.x - challenge.target.x,
    challenge.reference.position.y - challenge.target.y,
  );
  if (referenceDistance < challenge.tolerance * 2) {
    failures.push(`${challenge.id}: reference and target are too close to read as separate calls.`);
  }
}

const cropIds = new Set();
for (const crop of cropDefinitions) {
  if (cropIds.has(crop.id)) failures.push(`${crop.id}: duplicate terrain crop.`);
  cropIds.add(crop.id);

  const halfCrop = 0.5 / crop.zoom;
  if (
    crop.target.x - halfCrop < 0.02 ||
    crop.target.x + halfCrop > 0.98 ||
    crop.target.y - halfCrop < 0.02 ||
    crop.target.y + halfCrop > 0.98
  ) {
    failures.push(`${crop.id}: crop would expose the edge of the overview.`);
  }
}

const landmarks = landmarkSnapshot.landmarks ?? {};
const overview = landmarkSnapshot.snapshot?.overview;
const worldSpan = overview?.scale * overview?.coordinateSize;
const samePosition = (left, right, epsilon = 0.0000011) =>
  Math.abs(left.x - right.x) <= epsilon && Math.abs(left.y - right.y) <= epsilon;

if (
  landmarkSnapshot.snapshot?.steamBuildId !== "24383975" ||
  !overview ||
  !Number.isFinite(worldSpan) ||
  worldSpan <= 0
) {
  failures.push("The authoritative Dota map snapshot metadata is incomplete.");
} else {
  for (const [id, landmark] of Object.entries(landmarks)) {
    const calculated = {
      x: (landmark.world.x - overview.posX) / worldSpan,
      y: (overview.posY - landmark.world.y) / worldSpan,
    };
    if (!samePosition(calculated, landmark.position)) {
      failures.push(`${id}: normalized pin does not match its Dota world entity origin.`);
    }

    const location = locations.find((candidate) => candidate.id === id);
    if (!location || !samePosition(location.target, landmark.position)) {
      failures.push(`${id}: entity-backed location drifted from the audited map snapshot.`);
    }
  }

  const landmarkByLabel = new Map(Object.values(landmarks).map((landmark) => [landmark.label, landmark.position]));
  for (const challenge of challenges) {
    const position = landmarkByLabel.get(challenge.targetLabel);
    if (position && !samePosition(challenge.target, position)) {
      failures.push(`${challenge.id}: challenge target drifted from its audited landmark.`);
    }
  }
}

const creativePromptWordCounts = challenges.map(
  (challenge) =>
    challenge.prompt
      .trim()
      .split(/\s+/)
      .filter((word) => word !== "→").length,
);
const longestCreativePrompt = Math.max(...creativePromptWordCounts);
const averageCreativePrompt =
  creativePromptWordCounts.reduce((total, wordCount) => total + wordCount, 0) / creativePromptWordCounts.length;
if (longestCreativePrompt > 7 || averageCreativePrompt > 5.5) {
  failures.push(
    `Creative Map Sense calls must stay scan-friendly (found ${longestCreativePrompt} words max, ${averageCreativePrompt.toFixed(1)} average).`,
  );
}

const learningCount = allDefinitions.filter((location) => location.difficulty <= 2).length;
const veteranCount = allDefinitions.filter((location) => location.difficulty === 3).length;
const veteranTerrainCount = cropDefinitions.filter((location) => location.difficulty === 3).length;
if (learningCount < 24 || veteranCount < 24 || veteranTerrainCount < 24) {
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
    `Validated ${allDefinitions.length} Map Sense questions across six families and ${Object.keys(landmarks).length} entity-backed pins (${difficultyCounts[1]} warm-up, ${difficultyCounts[2]} tricky, ${difficultyCounts[3]} brutal).`,
  );
}
