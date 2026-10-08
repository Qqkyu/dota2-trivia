// Valve's English herolist, checked 2026-10-06:
// https://www.dota2.com/datafeed/herolist?language=english
// The older client workshop names are not always the current public names.
const CURRENT_NAMES = {
  npc_dota_hero_obsidian_destroyer: "Outworld Destroyer",
  npc_dota_hero_ringmaster: "Ringmaster",
};

export function heroDisplayName(key, fallback) {
  return CURRENT_NAMES[key] ?? fallback;
}
