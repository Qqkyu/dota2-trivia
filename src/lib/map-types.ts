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

export interface MapChallenge {
  target: MapPosition;
  targetLabel: string;
  tolerance: number;
  reference?: MapReference;
  crop?: MapCrop;
}
