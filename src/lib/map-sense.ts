import mapLocations from "@/data/map-sense-locations.json";
import mapChallenges from "@/data/map-sense-challenges.json";
import type { MapChallenge, MapPosition } from "@/lib/map-types";

export const MAP_SENSE_IMAGE = "/assets/dota2/map/detailed-7.40.webp";
export const MAP_SENSE_IMAGE_SOURCE =
  "https://github.com/odota/web/blob/master/public/assets/images/dota2/map/detailed_740.webp";
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
}

type MapChallengeFamily = "riddle" | "mirror" | "relative" | "scenario";
type MapQuestionKind = "map-riddle" | "map-mirror" | "map-relative" | "map-scenario";

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
  },
  source: {
    label: "Dota 2 7.41 terrain",
    url: "https://www.dota2.com/patches/7.41",
  },
  patch: "7.41d",
});

export const mapSenseQuestions = [
  ...(mapLocations as MapLocationDefinition[]).map((location) => mapQuestion(location, "map-location")),
  ...(mapChallenges as MapChallengeDefinition[]).map((challenge) =>
    mapQuestion(challenge, familyKinds[challenge.family]),
  ),
];
