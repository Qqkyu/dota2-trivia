import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const catalog = JSON.parse(readFileSync(new URL("../src/data/hero-picker.json", import.meta.url), "utf8"));
const heroes = catalog.groups.flatMap((group) => group.heroes);

// Valve's English herolist, checked 2026-10-06. Internal workshop names can be stale.
// https://www.dota2.com/datafeed/herolist?language=english
it.each([
  ["npc_dota_hero_obsidian_destroyer", "Outworld Destroyer"],
  ["npc_dota_hero_ringmaster", "Ringmaster"],
])("shows the current Valve name for %s", (key, name) => {
  expect(heroes.find((hero) => hero.key === key)?.name).toBe(name);
});
