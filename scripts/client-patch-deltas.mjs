export function clientNumericValues(value) {
  const raw = value && typeof value === "object" ? value.value : value;
  return String(raw ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);
}

// These deltas come from the published patch notes. They deliberately do not
// import the generator's OpenDota overrides: that would compare data to itself.
export function applyClientPatchDeltas(catalogs, deltas) {
  for (const change of deltas.changes) {
    const entry = catalogs[change.catalog]?.[change.key];
    const values = entry?.AbilityValues?.[change.field] ?? entry?.[change.field];
    if (JSON.stringify(clientNumericValues(values)) !== JSON.stringify(change.before)) {
      throw new Error(
        `Patch delta base mismatch for ${change.key}.${change.field}; expected ${change.before.join(" / ")}.`,
      );
    }
    const target = entry.AbilityValues?.[change.field] !== undefined ? entry.AbilityValues : entry;
    const after = change.after.join(" ");
    target[change.field] = typeof values === "object" ? { ...values, value: after } : after;
  }
  return deltas.changes.length;
}
