export interface MapPosition {
  x: number;
  y: number;
}

export interface MapChallenge {
  target: MapPosition;
  targetLabel: string;
  tolerance: number;
}
