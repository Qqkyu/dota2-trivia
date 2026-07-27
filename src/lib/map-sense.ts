import mapLocations from "@/data/map-sense-locations.json";
import mapChallenges from "@/data/map-sense-challenges.json";
import mapCrops from "@/data/map-sense-crops.json";
import mapLandmarks from "@/data/map-sense-landmarks.json";
import mapSpatial from "@/data/map-sense-spatial.json";
import type { MapChallenge, MapCrop, MapPosition, MapRadar, MapReference, MapVector } from "@/lib/map-types";

export const MAP_SENSE_IMAGE = "/assets/dota2/map/overview-7.41d.webp";
export const MAP_SENSE_IMAGE_SOURCE = "https://www.dota2.com/patches/7.41";
export const MAP_SENSE_BAND_LABELS = ["On target", "Close", "Wide", "Miss"] as const;
export const MAP_SENSE_MAX_CROWD_PINS = 400;

interface MapLocationDefinition {
  id: string;
  targetLabel: string;
  difficulty: 1 | 2 | 3;
  target: MapPosition;
  tolerance: number;
  eyebrow: string;
  prompt: string;
  explanation: string;
  crop?: MapCrop;
  reference?: MapReference;
  vector?: MapVector;
  radar?: MapRadar;
}

type MapChallengeFamily = "riddle" | "mirror" | "relative" | "scenario";
type MapQuestionKind =
  | "map-riddle"
  | "map-mirror"
  | "map-relative"
  | "map-scenario"
  | "map-crop"
  | "map-vector"
  | "map-radar";

interface MapChallengeDefinition extends MapLocationDefinition {
  family: MapChallengeFamily;
  reference?: {
    position: MapPosition;
    label: string;
  };
}

const familyKinds = {
  riddle: "map-riddle",
  mirror: "map-mirror",
  relative: "map-relative",
  scenario: "map-scenario",
} as const satisfies Record<MapChallengeFamily, MapQuestionKind>;

interface MapCropSeed {
  id: string;
  x: number;
  y: number;
}

function cropQuestion(seed: MapCropSeed, difficulty: 2 | 3): MapLocationDefinition {
  const center = { x: seed.x, y: seed.y };
  return {
    id: `${difficulty === 3 ? "brutal" : "tricky"}:${seed.id}`,
    targetLabel: "the marked terrain point",
    difficulty,
    target: center,
    tolerance: difficulty === 3 ? 0.024 : 0.042,
    eyebrow: "Map Sense · Terrain match",
    prompt: "Place this reticle.",
    explanation: "The reticle was centered on this exact point of the current battlefield overview.",
    crop: {
      center,
      zoom: difficulty === 3 ? 8.4 : 5.6,
      treatment: difficulty === 3 ? "mono" : "color",
    },
  };
}

const cropDefinitions = [
  ...mapCrops.tricky.map((seed) => cropQuestion(seed, 2)),
  ...mapCrops.brutal.map((seed) => cropQuestion(seed, 3)),
];

interface AuditedLandmark {
  label: string;
  position: MapPosition;
}

interface MapVectorSeed {
  target: string;
  start: string;
}

interface MapRadarSeed {
  target: string;
  beacons: string[];
}

const auditedLandmarks = mapLandmarks.landmarks as Record<string, AuditedLandmark>;
const brutalCropById = new Map(mapCrops.brutal.map((crop) => [crop.id, crop]));

function spatialTarget(id: string) {
  const seed = brutalCropById.get(id);
  if (!seed) throw new Error(`Unknown Map Sense spatial target: ${id}`);
  return { x: seed.x, y: seed.y };
}

function auditedLandmark(id: string) {
  const landmark = auditedLandmarks[id];
  if (!landmark) throw new Error(`Unknown audited Map Sense landmark: ${id}`);
  return landmark;
}

function vectorQuestion(seed: MapVectorSeed): MapLocationDefinition {
  const target = spatialTarget(seed.target);
  const start = auditedLandmark(seed.start);
  return {
    id: seed.target,
    targetLabel: "the vector endpoint",
    difficulty: 3,
    target,
    tolerance: 0.024,
    eyebrow: "Map Sense · Vector run",
    prompt: "Plot the vector.",
    explanation: "The horizontal and vertical grid offsets from the marked start end at this exact point.",
    reference: {
      position: start.position,
      label: "Start",
    },
    vector: {
      dx: target.x - start.position.x,
      dy: target.y - start.position.y,
      gridSize: 8,
    },
  };
}

function radarQuestion(seed: MapRadarSeed): MapLocationDefinition {
  const target = spatialTarget(seed.target);
  return {
    id: seed.target,
    targetLabel: "the signal intersection",
    difficulty: 3,
    target,
    tolerance: 0.024,
    eyebrow: "Map Sense · Signal lock",
    prompt: "Find the intersection.",
    explanation: "All three beacon ranges intersect at this exact point.",
    radar: {
      beacons: seed.beacons.map((id) => {
        const position = auditedLandmark(id).position;
        return {
          position,
          distance: mapDistance(position, target),
        };
      }),
    },
  };
}

const vectorDefinitions = (mapSpatial.vectors as MapVectorSeed[]).map(vectorQuestion);
const radarDefinitions = (mapSpatial.radar as MapRadarSeed[]).map(radarQuestion);

export function isMapPosition(value: unknown): value is MapPosition {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MapPosition>;
  return (
    typeof candidate.x === "number" &&
    Number.isFinite(candidate.x) &&
    candidate.x >= 0 &&
    candidate.x <= 1 &&
    typeof candidate.y === "number" &&
    Number.isFinite(candidate.y) &&
    candidate.y >= 0 &&
    candidate.y <= 1
  );
}

export function mapDistance(left: MapPosition, right: MapPosition) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function mapAccuracyBand(distance: number, tolerance: number) {
  if (distance <= tolerance) return 0;
  if (distance <= tolerance * 1.8) return 1;
  if (distance <= tolerance * 3) return 2;
  return 3;
}

export function mapAnswerIndex(challenge: MapChallenge, position: MapPosition) {
  return mapAccuracyBand(mapDistance(challenge.target, position), challenge.tolerance);
}

const mapQuestion = (location: MapLocationDefinition, kind: "map-location" | MapQuestionKind) => ({
  id: `${kind}:${location.id}`,
  kind,
  category: "Map" as const,
  difficulty: location.difficulty,
  eyebrow: location.eyebrow,
  prompt: location.prompt,
  answers: [...MAP_SENSE_BAND_LABELS] as [string, string, string, string],
  correctIndex: 0,
  explanation: location.explanation,
  map: {
    target: location.target,
    targetLabel: location.targetLabel,
    tolerance: location.tolerance,
    ...("reference" in location && location.reference ? { reference: location.reference } : {}),
    ...(location.crop ? { crop: location.crop } : {}),
    ...(location.vector ? { vector: location.vector } : {}),
    ...(location.radar ? { radar: location.radar } : {}),
  },
  source: {
    label: `Dota 2 build ${mapLandmarks.snapshot.steamBuildId}`,
    url: "https://www.dota2.com/patches/7.41",
  },
  patch: "7.41d",
});

export const mapSenseQuestions = [
  ...(mapLocations as MapLocationDefinition[]).map((location) => mapQuestion(location, "map-location")),
  ...(mapChallenges as MapChallengeDefinition[]).map((challenge) =>
    mapQuestion(challenge, familyKinds[challenge.family]),
  ),
  ...cropDefinitions.map((crop) => mapQuestion(crop, "map-crop")),
  ...vectorDefinitions.map((vector) => mapQuestion(vector, "map-vector")),
  ...radarDefinitions.map((radar) => mapQuestion(radar, "map-radar")),
];
