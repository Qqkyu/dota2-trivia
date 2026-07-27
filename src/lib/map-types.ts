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

export interface MapVector {
  dx: number;
  dy: number;
  gridSize: number;
}

export interface MapRadarBeacon {
  position: MapPosition;
  distance: number;
}

export interface MapRadar {
  beacons: MapRadarBeacon[];
}

export interface MapChallenge {
  target: MapPosition;
  targetLabel: string;
  tolerance: number;
  reference?: MapReference;
  crop?: MapCrop;
  vector?: MapVector;
  radar?: MapRadar;
}
