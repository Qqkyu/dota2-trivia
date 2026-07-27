#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const locationPath = join(root, "src", "data", "map-sense-locations.json");
const challengePath = join(root, "src", "data", "map-sense-challenges.json");
const landmarkPath = join(root, "src", "data", "map-sense-landmarks.json");

const [locations, challenges, snapshot] = await Promise.all(
  [locationPath, challengePath, landmarkPath].map(async (path) => JSON.parse(await readFile(path, "utf8"))),
);
const landmarks = snapshot.landmarks;
const byLabel = new Map(Object.values(landmarks).map((landmark) => [landmark.label, landmark]));
const coordinateKey = (position) => `${position.x.toFixed(6)}:${position.y.toFixed(6)}`;
const oldLandmarkCoordinates = new Map(
  locations
    .filter((location) => landmarks[location.id])
    .map((location) => [coordinateKey(location.target), landmarks[location.id]]),
);

for (const location of locations) {
  const landmark = landmarks[location.id];
  if (landmark) location.target = landmark.position;
}

const currentLandmarkCoordinates = new Map(
  Object.values(landmarks).map((landmark) => [coordinateKey(landmark.position), landmark]),
);
for (const challenge of challenges) {
  const target = byLabel.get(challenge.targetLabel);
  if (target) challenge.target = target.position;

  if (challenge.reference) {
    const key = coordinateKey(challenge.reference.position);
    const reference = oldLandmarkCoordinates.get(key) ?? currentLandmarkCoordinates.get(key);
    if (reference) challenge.reference.position = reference.position;
  }
}

function formatDefinitions(definitions) {
  return `${JSON.stringify(definitions, null, 2)
    .replace(/\{\n\s+"x": (-?\d+(?:\.\d+)?),\n\s+"y": (-?\d+(?:\.\d+)?)\n\s+\}/g, '{ "x": $1, "y": $2 }')
    .replace(
      /"reference": \{\n\s+"position": (\{ "x": -?\d+(?:\.\d+)?, "y": -?\d+(?:\.\d+)? \}),\n\s+"label": ("[^"]+")\n\s+\}/g,
      '"reference": { "position": $1, "label": $2 }',
    )}\n`;
}

await Promise.all([
  writeFile(locationPath, formatDefinitions(locations)),
  writeFile(challengePath, formatDefinitions(challenges)),
]);

console.log(
  `Synchronized ${Object.keys(landmarks).length} entity-backed landmarks from Dota build ${snapshot.snapshot.steamBuildId}.`,
);
