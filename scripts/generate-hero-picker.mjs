#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { CLIENT_CONSTANT_AUDIT } from "./client-constant-audit.mjs";
import { parseValveKeyValues } from "./valve-keyvalues.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "src", "data", "hero-picker.json");
const clientRootArgument = process.argv.find((argument) => argument.startsWith("--client-root="));
const CLIENT_ROOT = resolve(
  clientRootArgument?.slice("--client-root=".length) ??
    process.env.DOTA_CLIENT_AUDIT_ROOT ??
    `/tmp/queue-arcade-live${CLIENT_CONSTANT_AUDIT.clientBuild}`,
);
const HEROES_PATH = join(CLIENT_ROOT, "core", "scripts", "npc", "npc_heroes.txt");
const CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes";

const GROUPS = [
  { key: "strength", label: "Strength", attribute: "DOTA_ATTRIBUTE_STRENGTH" },
  { key: "agility", label: "Agility", attribute: "DOTA_ATTRIBUTE_AGILITY" },
  { key: "intelligence", label: "Intelligence", attribute: "DOTA_ATTRIBUTE_INTELLECT" },
  { key: "universal", label: "Universal", attribute: "DOTA_ATTRIBUTE_ALL" },
];

const definitions = parseValveKeyValues(await readFile(HEROES_PATH, "utf8")).DOTAHeroes;
if (!definitions) throw new Error(`Dota hero definitions are missing from ${HEROES_PATH}.`);

function displayName(key, definition) {
  if (key === "npc_dota_hero_ringmaster") return "Ringmaster";
  return definition.workshop_guide_name;
}

const enabledHeroes = Object.entries(definitions).filter(
  ([key, definition]) => key !== "npc_dota_hero_base" && definition?.Enabled === "1",
);

const catalog = {
  patch: CLIENT_CONSTANT_AUDIT.patch,
  clientBuild: CLIENT_CONSTANT_AUDIT.clientBuild,
  source: "scripts/npc/npc_heroes.txt",
  columns: 11,
  groups: GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    heroes: enabledHeroes
      .filter(([, definition]) => definition.AttributePrimary === group.attribute)
      .map(([key, definition]) => ({
        key,
        name: displayName(key, definition),
        image: `${CDN}/${key.replace("npc_dota_hero_", "")}.png`,
      }))
      .sort((left, right) => left.name.localeCompare(right.name, "en-US")),
  })),
};

const total = catalog.groups.reduce((count, group) => count + group.heroes.length, 0);
if (total !== enabledHeroes.length) {
  throw new Error(`Only ${total} of ${enabledHeroes.length} enabled heroes have a supported primary attribute.`);
}

await writeFile(OUTPUT, await format(`${JSON.stringify(catalog, null, 2)}\n`, { parser: "json" }));
console.log(
  `Generated Dota hero picker (${catalog.groups.map((group) => `${group.label} ${group.heroes.length}`).join(", ")}; ${total} total).`,
);
