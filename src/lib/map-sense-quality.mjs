export function isDirectTowerLocation(location) {
  return (
    /\btier\s*[123]\s+tower\b/i.test(location?.targetLabel ?? "") ||
    /\bprecision tower\b/i.test(location?.eyebrow ?? "")
  );
}

export function isPlayableMapLocation(location) {
  return !isDirectTowerLocation(location);
}
