export function isDirectTowerLocation(location) {
  return (
    /\btier\s*[123]\s+tower\b/i.test(location?.targetLabel ?? "") ||
    /\bprecision tower\b/i.test(location?.eyebrow ?? "")
  );
}

export function isPlayableMapLocation(location) {
  return !isDirectTowerLocation(location);
}

const RETIRED_MAP_KINDS = new Set(["map-crop", "map-tp-in"]);

export function isKnowledgeBearingMapQuestion(question) {
  return !RETIRED_MAP_KINDS.has(question?.kind);
}
