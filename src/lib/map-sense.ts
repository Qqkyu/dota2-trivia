import mapLocations from "@/data/map-sense-locations.json";
import mapChallenges from "@/data/map-sense-challenges.json";
import mapCrops from "@/data/map-sense-crops.json";
import mapLandmarks from "@/data/map-sense-landmarks.json";
import mapMechanics from "@/data/map-sense-mechanics.json";
import { isPlayableMapLocation } from "@/lib/map-sense-quality.mjs";
import type {
  MapCamp,
  MapChallenge,
  MapChoiceChallenge,
  MapChoiceOption,
  MapCrop,
  MapPosition,
  MapReference,
  MapViewport,
} from "@/lib/map-types";

export const MAP_SENSE_IMAGE = "/assets/dota2/map/overview-7.41d.webp";
export const MAP_SENSE_IMAGE_SOURCE = "https://www.dota2.com/patches/7.41";
export const MAP_SENSE_BAND_LABELS = ["On target", "Close", "Wide", "Miss"] as const;
export const MAP_SENSE_MAX_CROWD_PINS = 400;

type AnswerTuple = [string, string, string, string];

interface MapLocationDefinition {
  id: string;
  targetLabel: string;
  difficulty: 1 | 2 | 3;
  target: MapPosition;
  tolerance: number;
  eyebrow: string;
  prompt: string;
  explanation: string;
  answers?: AnswerTuple;
  correctIndex?: number;
  crop?: MapCrop;
  reference?: MapReference;
  choice?: MapChoiceChallenge;
}

type MapChallengeFamily = "riddle" | "mirror" | "relative" | "scenario";
type MapQuestionKind =
  | "map-riddle"
  | "map-mirror"
  | "map-relative"
  | "map-scenario"
  | "map-crop"
  | "map-camp-block"
  | "map-stack-route";

interface MapChallengeDefinition extends MapLocationDefinition {
  family: MapChallengeFamily;
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

const mechanicsCamps = mapMechanics.camps as MapCamp[];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
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

function boxCenter(camp: MapCamp): MapPosition {
  return {
    x: (camp.spawnBox.min.x + camp.spawnBox.max.x) / 2,
    y: (camp.spawnBox.min.y + camp.spawnBox.max.y) / 2,
  };
}

function campViewport(camp: MapCamp, zoom: number): MapViewport {
  const center = boxCenter(camp);
  const halfViewport = 0.5 / zoom;
  return {
    center: {
      x: clamp(center.x, halfViewport, 1 - halfViewport),
      y: clamp(center.y, halfViewport, 1 - halfViewport),
    },
    zoom,
  };
}

function fittedViewport(
  positions: MapPosition[],
  preferredCenter: MapPosition,
  maximumZoom: number,
  markerMargin: number,
): MapViewport {
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

  return { center: { x: 0.5, y: 0.5 }, zoom: 1 };
}

function positionAt(position: MapPosition, direction: number, distance: number): MapPosition {
  const radians = (direction * Math.PI) / 180;
  return {
    x: position.x + Math.cos(radians) * distance,
    y: position.y - Math.sin(radians) * distance,
  };
}

function campBlockQuestion(camp: MapCamp, seedIndex: number): MapLocationDefinition {
  const center = boxCenter(camp);
  const halfWidth = (camp.spawnBox.max.x - camp.spawnBox.min.x) / 2;
  const halfHeight = (camp.spawnBox.max.y - camp.spawnBox.min.y) / 2;
  const correctIndex = (seedIndex * 3 + 1) % 4;
  const startAngle = 22 + (seedIndex % 4) * 9;
  const positions = Array.from({ length: 4 }, (_, index) => {
    const angle = startAngle + index * 90;
    const radians = (angle * Math.PI) / 180;
    const boundaryDistance =
      1 / Math.max(Math.abs(Math.cos(radians)) / halfWidth, Math.abs(Math.sin(radians)) / halfHeight);
    return positionAt(center, angle, boundaryDistance * (index === correctIndex ? 0.87 : 1.14));
  });
  const options = positions.map(
    (position, index) =>
      ({
        position,
        label: `Ward ${String.fromCharCode(65 + index)}`,
        marker: "ward",
      }) satisfies MapChoiceOption,
  ) as MapChoiceChallenge["options"];

  return {
    id: camp.id,
    targetLabel: options[correctIndex].label,
    difficulty: 3,
    target: options[correctIndex].position,
    tolerance: 0.024,
    eyebrow: "Map Sense · Camp block",
    prompt: "Which ward blocks?",
    answers: options.map((option) => option.label) as AnswerTuple,
    correctIndex,
    explanation: `${options[correctIndex].label} sits inside this ${camp.tier} camp's current spawn box, so it blocks the next neutral spawn.`,
    choice: {
      kind: "camp-block",
      viewport: campViewport(camp, 8.2),
      options,
      camp,
    },
  };
}

function stackRouteQuestion(camp: MapCamp, seedIndex: number): MapLocationDefinition {
  const boxWidth = camp.spawnBox.max.x - camp.spawnBox.min.x;
  const boxHeight = camp.spawnBox.max.y - camp.spawnBox.min.y;
  const edgeDistance = Math.min(camp.position.x, 1 - camp.position.x, camp.position.y, 1 - camp.position.y);
  const routeDistance = Math.max(0.028, Math.min(Math.max(boxWidth, boxHeight) * 1.45, edgeDistance * 0.72));
  const directionOrder = [0, 90, 180, 270].map((offset) => (camp.stack.direction + offset) % 360);
  const shift = (seedIndex * 3 + 2) % 4;
  const directions = [...directionOrder.slice(shift), ...directionOrder.slice(0, shift)];
  const correctIndex = directions.indexOf(camp.stack.direction);
  const options = directions.map(
    (angle, index) =>
      ({
        position: positionAt(camp.position, angle, routeDistance),
        label: `Path ${String.fromCharCode(65 + index)}`,
        angle,
        marker: "route",
      }) satisfies MapChoiceOption,
  ) as MapChoiceChallenge["options"];
  const viewport = fittedViewport(
    [camp.position, camp.spawnBox.min, camp.spawnBox.max, ...options.map((option) => option.position)],
    boxCenter(camp),
    6.2,
    0.085,
  );

  return {
    id: camp.id,
    targetLabel: options[correctIndex].label,
    difficulty: 3,
    target: options[correctIndex].position,
    tolerance: 0.024,
    eyebrow: "Map Sense · Stack route",
    prompt: "Which stack path?",
    answers: options.map((option) => option.label) as AnswerTuple,
    correctIndex,
    explanation: `The current in-game camp guide marks ${options[correctIndex].label} with a :${camp.stack.start}–:${camp.stack.end} stack window.`,
    choice: {
      kind: "stack-route",
      viewport,
      options,
      camp,
    },
  };
}

const campBlockDefinitions = mechanicsCamps.map(campBlockQuestion);
const stackRouteDefinitions = mechanicsCamps.map(stackRouteQuestion);

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
  answers: location.answers ?? ([...MAP_SENSE_BAND_LABELS] as AnswerTuple),
  correctIndex: location.correctIndex ?? 0,
  explanation: location.explanation,
  map: {
    target: location.target,
    targetLabel: location.targetLabel,
    tolerance: location.tolerance,
    ...(location.reference ? { reference: location.reference } : {}),
    ...(location.crop ? { crop: location.crop } : {}),
    ...(location.choice ? { choice: location.choice } : {}),
  },
  source: {
    label: `Dota 2 build ${mapLandmarks.snapshot.steamBuildId}`,
    url: "https://www.dota2.com/patches/7.41",
  },
  patch: "7.41d",
});

export const mapSenseQuestions = [
  ...(mapLocations as MapLocationDefinition[])
    .filter(isPlayableMapLocation)
    .map((location) => mapQuestion(location, "map-location")),
  ...(mapChallenges as MapChallengeDefinition[]).map((challenge) =>
    mapQuestion(challenge, familyKinds[challenge.family]),
  ),
  ...cropDefinitions.map((crop) => mapQuestion(crop, "map-crop")),
  ...campBlockDefinitions.map((camp) => mapQuestion(camp, "map-camp-block")),
  ...stackRouteDefinitions.map((camp) => mapQuestion(camp, "map-stack-route")),
];
