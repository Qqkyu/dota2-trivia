#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const locations = JSON.parse(await readFile(join(root, "src", "data", "map-sense-locations.json"), "utf8"));
const challenges = JSON.parse(await readFile(join(root, "src", "data", "map-sense-challenges.json"), "utf8"));
const crops = JSON.parse(await readFile(join(root, "src", "data", "map-sense-crops.json"), "utf8"));
const landmarkSnapshot = JSON.parse(await readFile(join(root, "src", "data", "map-sense-landmarks.json"), "utf8"));
const mechanics = JSON.parse(await readFile(join(root, "src", "data", "map-sense-mechanics.json"), "utf8"));
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

if (!Array.isArray(mechanics.camps) || mechanics.camps.length < 24) {
  failures.push("Map Sense needs at least 24 audited neutral camps.");
}

const landmarks = landmarkSnapshot.landmarks ?? {};
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
const teleportCandidates = ["radiant", "dire"].flatMap((side) => {
  const anchors = Object.entries(landmarks)
    .filter(([id]) => id.startsWith(`${side}-`) && id.includes("-tier-"))
    .map(([id, landmark]) => ({ id, position: landmark.position }));
  return (crops.brutal ?? [])
    .map((target) => {
      const ranked = anchors
        .map((anchor) => ({
          ...anchor,
          distance: Math.hypot(anchor.position.x - target.x, anchor.position.y - target.y),
        }))
        .sort((left, right) => left.distance - right.distance);
      return { side, target, ranked, gap: ranked[1].distance - ranked[0].distance };
    })
    .filter(
      (candidate) =>
        candidate.ranked[0].distance > 0.05 &&
        candidate.ranked[0].distance < 0.38 &&
        candidate.gap > 0.025 &&
        candidate.gap < 0.12,
    )
    .sort((left, right) => Math.abs(left.gap - 0.07) - Math.abs(right.gap - 0.07))
    .slice(0, 12);
});
const mechanicDefinitions = [
  ...(mechanics.camps ?? []).map((camp) => ({
    id: camp.id,
    family: "camp-block",
    targetLabel: "the blocking ward",
    difficulty: 3,
    target: camp.position,
    tolerance: 0.024,
    eyebrow: "Map Sense · Camp block",
    prompt: "Which ward blocks?",
    explanation: "One ward is inside the spawn box.",
  })),
  ...(mechanics.camps ?? []).map((camp) => ({
    id: camp.id,
    family: "stack-route",
    targetLabel: "the stack route",
    difficulty: 3,
    target: camp.position,
    tolerance: 0.024,
    eyebrow: "Map Sense · Stack route",
    prompt: "Which stack path?",
    explanation: "The in-game camp guide marks one route.",
  })),
  ...teleportCandidates.map(({ side, target, ranked }) => ({
    id: `${side}:${target.id}`,
    family: "tp-in",
    targetLabel: ranked[0].id,
    difficulty: 3,
    target: ranked[0].position,
    tolerance: 0.024,
    eyebrow: "Map Sense · TP in",
    prompt: "Nearest TP?",
    explanation: "One live tower is nearest the fight.",
  })),
];
const allDefinitions = [
  ...locations.map((location) => ({ ...location, family: "location" })),
  ...challenges,
  ...cropDefinitions,
  ...mechanicDefinitions,
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

function validNormalizedPosition(position) {
  const { x, y } = position ?? {};
  return (
    typeof x === "number" &&
    typeof y === "number" &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= 0 &&
    x <= 1 &&
    y >= 0 &&
    y <= 1
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

const overview = landmarkSnapshot.snapshot?.overview;
const worldSpan = overview?.scale * overview?.coordinateSize;
const samePosition = (left, right, epsilon = 0.0000011) =>
  Math.abs(left.x - right.x) <= epsilon && Math.abs(left.y - right.y) <= epsilon;

if (
  landmarkSnapshot.snapshot?.steamBuildId !== "24383975" ||
  landmarkSnapshot.snapshot?.verifiedAgainstSteamBuildId !== "24442265" ||
  landmarkSnapshot.snapshot?.verifiedAt !== "2026-07-29" ||
  landmarkSnapshot.snapshot?.mapResourceCrc !== "02e59797" ||
  landmarkSnapshot.snapshot?.overviewResourceCrc !== "490b9ecd" ||
  landmarkSnapshot.snapshot?.overviewTextureCrc !== "d9e2fc78" ||
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

if (
  mechanics.snapshot?.patch !== landmarkSnapshot.snapshot?.patch ||
  mechanics.snapshot?.steamBuildId !== landmarkSnapshot.snapshot?.steamBuildId ||
  mechanics.snapshot?.verifiedAgainstSteamBuildId !== landmarkSnapshot.snapshot?.verifiedAgainstSteamBuildId ||
  mechanics.snapshot?.verifiedAt !== landmarkSnapshot.snapshot?.verifiedAt ||
  mechanics.snapshot?.entityResourceCrc !== landmarkSnapshot.snapshot?.mapResourceCrc ||
  mechanics.snapshot?.timingResource !== "pak01_dir.vpk:scripts/creep_pull_timings.txt" ||
  mechanics.snapshot?.timingCrc !== "00e3848198"
) {
  failures.push("Map mechanics must match the audited Dota build and current in-game pull-timing resource.");
}

const campIds = new Set();
const insideBounds = (position, bounds) =>
  position.x >= bounds.min.x && position.x <= bounds.max.x && position.y >= bounds.min.y && position.y <= bounds.max.y;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const markerFitsViewport = (position, center, zoom) => {
  const epsilon = 0.000001;
  const viewportPosition = {
    x: 0.5 + (position.x - center.x) * zoom,
    y: 0.5 + (position.y - center.y) * zoom,
  };
  return (
    viewportPosition.x >= 0.085 - epsilon &&
    viewportPosition.x <= 0.915 + epsilon &&
    viewportPosition.y >= 0.085 - epsilon &&
    viewportPosition.y <= 0.915 + epsilon
  );
};
const fittedViewport = (positions, preferredCenter, maximumZoom, markerMargin) => {
  for (let zoomStep = Math.round(maximumZoom * 100); zoomStep >= 300; zoomStep -= 1) {
    const zoom = zoomStep / 100;
    const halfViewport = 0.5 / zoom;
    const markerReach = (0.5 - markerMargin) / zoom;
    const minimumCenterX = Math.max(halfViewport, ...positions.map((position) => position.x - markerReach));
    const maximumCenterX = Math.min(1 - halfViewport, ...positions.map((position) => position.x + markerReach));
    const minimumCenterY = Math.max(halfViewport, ...positions.map((position) => position.y - markerReach));
    const maximumCenterY = Math.min(1 - halfViewport, ...positions.map((position) => position.y + markerReach));

    if (minimumCenterX <= maximumCenterX && minimumCenterY <= maximumCenterY) {
      return {
        center: {
          x: clamp(preferredCenter.x, minimumCenterX, maximumCenterX),
          y: clamp(preferredCenter.y, minimumCenterY, maximumCenterY),
        },
        zoom,
      };
    }
  }
  return null;
};
const campViewportCenter = (center, zoom) => {
  const halfViewport = 0.5 / zoom;
  return {
    x: clamp(center.x, halfViewport, 1 - halfViewport),
    y: clamp(center.y, halfViewport, 1 - halfViewport),
  };
};
for (const [index, camp] of (mechanics.camps ?? []).entries()) {
  if (typeof camp.id !== "string" || campIds.has(camp.id)) failures.push(`${camp.id}: duplicate neutral camp.`);
  campIds.add(camp.id);

  if (
    !validPosition(camp.position) ||
    !validPosition(camp.spawnBox?.min) ||
    !validPosition(camp.spawnBox?.max) ||
    camp.spawnBox.min.x >= camp.spawnBox.max.x ||
    camp.spawnBox.min.y >= camp.spawnBox.max.y ||
    !insideBounds(camp.position, camp.spawnBox)
  ) {
    failures.push(`${camp.id}: invalid current-map camp position or spawn box.`);
    continue;
  }
  if (
    !["small", "medium", "large", "ancient"].includes(camp.tier) ||
    !["radiant", "dire"].includes(camp.side) ||
    (camp.id.includes("_good_") ? camp.side !== "radiant" : camp.side !== "dire")
  ) {
    failures.push(`${camp.id}: invalid camp tier or side.`);
  }
  if (
    !Number.isInteger(camp.stack?.start) ||
    !Number.isInteger(camp.stack?.end) ||
    camp.stack.start < 52 ||
    camp.stack.end > 57 ||
    camp.stack.end <= camp.stack.start ||
    typeof camp.stack.direction !== "number" ||
    camp.stack.direction < 0 ||
    camp.stack.direction >= 360
  ) {
    failures.push(`${camp.id}: invalid Valve stack window or arrow direction.`);
  }

  const center = {
    x: (camp.spawnBox.min.x + camp.spawnBox.max.x) / 2,
    y: (camp.spawnBox.min.y + camp.spawnBox.max.y) / 2,
  };
  const halfWidth = (camp.spawnBox.max.x - camp.spawnBox.min.x) / 2;
  const halfHeight = (camp.spawnBox.max.y - camp.spawnBox.min.y) / 2;
  const correctIndex = (index * 3 + 1) % 4;
  const startAngle = 22 + (index % 4) * 9;
  const wardOptions = Array.from({ length: 4 }, (_, optionIndex) => {
    const radians = ((startAngle + optionIndex * 90) * Math.PI) / 180;
    const boundaryDistance =
      1 / Math.max(Math.abs(Math.cos(radians)) / halfWidth, Math.abs(Math.sin(radians)) / halfHeight);
    const distance = boundaryDistance * (optionIndex === correctIndex ? 0.87 : 1.14);
    return {
      x: center.x + Math.cos(radians) * distance,
      y: center.y - Math.sin(radians) * distance,
    };
  });
  if (
    wardOptions.some((position) => !validPosition(position)) ||
    wardOptions.filter((position) => insideBounds(position, camp.spawnBox)).length !== 1 ||
    !insideBounds(wardOptions[correctIndex], camp.spawnBox) ||
    wardOptions.some((position) => !markerFitsViewport(position, campViewportCenter(center, 8.2), 8.2))
  ) {
    failures.push(`${camp.id}: Camp Block must expose one blocking ward and keep all markers in view.`);
  }

  const boxWidth = camp.spawnBox.max.x - camp.spawnBox.min.x;
  const boxHeight = camp.spawnBox.max.y - camp.spawnBox.min.y;
  const edgeDistance = Math.min(camp.position.x, 1 - camp.position.x, camp.position.y, 1 - camp.position.y);
  const routeDistance = Math.max(0.028, Math.min(Math.max(boxWidth, boxHeight) * 1.45, edgeDistance * 0.72));
  const routeOptions = [0, 90, 180, 270].map((offset) => {
    const routeRadians = (((camp.stack.direction + offset) % 360) * Math.PI) / 180;
    return {
      x: camp.position.x + Math.cos(routeRadians) * routeDistance,
      y: camp.position.y - Math.sin(routeRadians) * routeDistance,
    };
  });
  const routeViewport = fittedViewport(
    [camp.position, camp.spawnBox.min, camp.spawnBox.max, ...routeOptions],
    center,
    6.2,
    0.085,
  );
  if (
    routeOptions.some((position) => !validNormalizedPosition(position)) ||
    insideBounds(routeOptions[0], camp.spawnBox) ||
    !routeViewport ||
    routeOptions.some((position) => !markerFitsViewport(position, routeViewport.center, routeViewport.zoom))
  ) {
    failures.push(`${camp.id}: Stack Route must clear the spawn box and keep all four paths in view.`);
  }
}

if (teleportCandidates.length !== 24) {
  failures.push(`TP In needs 24 unambiguous entity-backed scenarios (found ${teleportCandidates.length}).`);
}
for (const candidate of teleportCandidates) {
  if (
    candidate.ranked.length !== 9 ||
    candidate.ranked.slice(0, 4).some((anchor) => !validPosition(anchor.position)) ||
    candidate.gap <= 0.025 ||
    candidate.gap >= 0.12
  ) {
    failures.push(`${candidate.side}:${candidate.target.id}: ambiguous or invalid TP In scenario.`);
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
const veteranFamilyCounts = {
  crop: cropDefinitions.filter((location) => location.difficulty === 3).length,
  block: mechanics.camps?.length ?? 0,
  stack: mechanics.camps?.length ?? 0,
  tp: teleportCandidates.length,
};
if (learningCount < 24 || veteranCount < 96 || Object.values(veteranFamilyCounts).some((count) => count < 24)) {
  failures.push(
    `Map Sense needs viable approachable and demanding tiers (found ${learningCount} and ${veteranCount}).`,
  );
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
    `Validated ${allDefinitions.length} Map Sense questions across nine families, ${mechanics.camps.length} current neutral camps, and ${Object.keys(landmarks).length} entity-backed pins (${difficultyCounts[1]} approachable, ${difficultyCounts[2]} tricky, ${difficultyCounts[3]} brutal; hard mechanics ${JSON.stringify(veteranFamilyCounts)}).`,
  );
}
