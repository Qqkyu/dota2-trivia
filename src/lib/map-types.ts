export interface MapPosition {
  x: number;
  y: number;
}

export interface MapReference {
  position: MapPosition;
  label: string;
}

export interface MapCrop {
  center: MapPosition;
  zoom: number;
  treatment: "color" | "mono";
}

export interface MapBounds {
  min: MapPosition;
  max: MapPosition;
}

export interface MapViewport {
  center: MapPosition;
  zoom: number;
}

export interface MapCamp {
  id: string;
  position: MapPosition;
  tier: "small" | "medium" | "large" | "ancient";
  side: "radiant" | "dire";
  spawnBox: MapBounds;
  stack: {
    start: number;
    end: number;
    direction: number;
  };
}

export interface MapChoiceOption {
  position: MapPosition;
  label: string;
  angle?: number;
  marker: "ward" | "route" | "tower";
  side?: "radiant" | "dire";
}

export interface MapChoiceChallenge {
  kind: "camp-block" | "stack-route" | "tp-in";
  viewport: MapViewport;
  options: [MapChoiceOption, MapChoiceOption, MapChoiceOption, MapChoiceOption];
  camp?: MapCamp;
  fight?: MapReference;
}

export interface MapChallenge {
  target: MapPosition;
  targetLabel: string;
  tolerance: number;
  reference?: MapReference;
  crop?: MapCrop;
  choice?: MapChoiceChallenge;
}
