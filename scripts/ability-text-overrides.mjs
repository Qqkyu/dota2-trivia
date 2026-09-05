import { readFile } from "node:fs/promises";

export const ABILITY_TEXT_OVERRIDES_URL = new URL("../src/data/ability-text-overrides.json", import.meta.url);

export async function loadAbilityTextOverrides() {
  return JSON.parse(await readFile(ABILITY_TEXT_OVERRIDES_URL, "utf8"));
}

/**
 * Fill blank upstream descriptions from the hand-written file. Real OpenDota
 * text always wins; an override that is no longer needed is reported as
 * stale so the file can be trimmed. Keys starting with "$" are notes.
 */
export function applyAbilityTextOverrides(abilitiesByKey, overrides) {
  const filled = [];
  const stale = [];
  const unknown = [];
  for (const [key, text] of Object.entries(overrides)) {
    if (key.startsWith("$")) continue;
    const ability = abilitiesByKey[key];
    if (!ability) {
      unknown.push(key);
      continue;
    }
    if (String(ability.desc ?? "").trim()) {
      stale.push(key);
      continue;
    }
    ability.desc = String(text).trim();
    filled.push(key);
  }
  return { filled, stale, unknown };
}
