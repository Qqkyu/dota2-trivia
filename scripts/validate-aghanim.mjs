#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { containsAbilityLeak, containsAnswerLeak } from "./spell-hints.mjs";
import { join, resolve } from "node:path";
import { CLIENT_CONSTANT_AUDIT } from "./client-constant-audit.mjs";
import { reportMissingClientSource } from "./client-audit-requirement.mjs";
import { parseValveKeyValues } from "./valve-keyvalues.mjs";
import { readArcadeSource, readArcadeStyles } from "./lib/arcade-sources.mjs";

const ROOT = process.cwd();
const [source, questions, heroPicker, component, styles, serializer, scoring] = await Promise.all([
  ...["aghanim-upgrades.json", "aghanim-questions.json", "hero-picker.json"].map((file) =>
    readFile(join(ROOT, "src", "data", file), "utf8").then(JSON.parse),
  ),
  readArcadeSource(ROOT),
  readArcadeStyles(ROOT),
  readFile(join(ROOT, "src", "lib", "public-question.mjs"), "utf8"),
  readFile(join(ROOT, "src", "lib", "scoring.mjs"), "utf8"),
]);
const failures = [];
const heroes = heroPicker.groups.flatMap((group) => group.heroes);
const heroesByKey = new Map(heroes.map((hero) => [hero.key, hero]));

function record(condition, message) {
  if (!condition) failures.push(message);
}

function words(value) {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function exactPhrase(value, phrase) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[’']/g, "[’']");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(value);
}

record(source.patch === CLIENT_CONSTANT_AUDIT.patch, "The Aghanim catalog patch drifted from the client audit.");
record(
  source.clientBuild === CLIENT_CONSTANT_AUDIT.clientBuild,
  "The Aghanim catalog build drifted from the client audit.",
);
record(/^\d{4}-\d{2}-\d{2}$/.test(source.reviewedAt), "The Aghanim catalog needs an editorial review date.");
record(
  source.sourceSnapshot?.latestPublishedPatch === source.patch,
  "The Aghanim review needs the latest published patch from its Valve source snapshot.",
);
record(
  source.upgrades.length >= 80,
  `Aghanim's Lab needs at least 80 reviewed upgrades (found ${source.upgrades.length}).`,
);
record(questions.length === source.upgrades.length, "The generated Aghanim question count does not match its source.");

const heroKeys = new Set();
const questionIds = new Set();
const effectSignatures = new Set();
const typeCounts = { scepter: 0, shard: 0 };
const modeCounts = { new: 0, existing: 0 };

for (const [index, upgrade] of source.upgrades.entries()) {
  const label = `${upgrade.heroKey}:${upgrade.upgradeType}`;
  const hero = heroesByKey.get(upgrade.heroKey);
  const question = questions[index];
  const effectWords = words(upgrade.effect);
  const signature = upgrade.effect
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  record(Boolean(hero), `${label}: hero is missing from the audited picker.`);
  record(!heroKeys.has(upgrade.heroKey), `${label}: the initial batch repeats a hero.`);
  heroKeys.add(upgrade.heroKey);
  record(["scepter", "shard"].includes(upgrade.upgradeType), `${label}: invalid upgrade type.`);
  record(["new", "existing"].includes(upgrade.upgradeMode), `${label}: invalid upgrade mode.`);
  if (upgrade.upgradeType in typeCounts) typeCounts[upgrade.upgradeType] += 1;
  if (upgrade.upgradeMode in modeCounts) modeCounts[upgrade.upgradeMode] += 1;
  record(effectWords.length >= 10 && effectWords.length <= 22, `${label}: opening clue must contain 10–22 words.`);
  record(!effectSignatures.has(signature), `${label}: duplicate opening clue.`);
  effectSignatures.add(signature);
  record(!/\b(?:aghanim|scepter|shard)\b/i.test(upgrade.effect), `${label}: opening clue reveals the upgrade item.`);
  record(
    !/[<>]|%[a-z_]+%|(?:^|\s)=\d/i.test(upgrade.effect),
    `${label}: opening clue contains raw localization markup.`,
  );
  record(hero ? !exactPhrase(upgrade.effect, hero.name) : true, `${label}: opening clue reveals the hero name.`);
  record(
    hero ? !containsAnswerLeak(upgrade.effect, hero.name) : true,
    `${label}: opening clue contains a word from the hero name (${hero?.name}).`,
  );
  record(!exactPhrase(upgrade.effect, upgrade.abilityName), `${label}: opening clue reveals ${upgrade.abilityName}.`);
  record(
    !containsAbilityLeak(upgrade.effect, upgrade.abilityName),
    `${label}: opening clue conjugates the ability name ${upgrade.abilityName}.`,
  );
  record(
    typeof upgrade.clientAbilityKey === "string" && upgrade.clientAbilityKey.length > 3,
    `${label}: missing client ability key.`,
  );
  record(
    /^https:\/\/www\.dota2\.com\/datafeed\/herodata\?language=english&hero_id=\d+$/.test(upgrade.source?.url ?? ""),
    `${label}: missing direct Valve hero source.`,
  );
  record(/^[a-f0-9]{64}$/.test(upgrade.sourceSha256 ?? ""), `${label}: missing Valve response hash.`);
  record(upgrade.sourceRetrievedAt === source.reviewedAt, `${label}: source retrieval and review dates differ.`);

  record(Boolean(question), `${label}: generated question is missing.`);
  if (!question || !hero) continue;
  record(!questionIds.has(question.id), `${question.id}: duplicate generated question ID.`);
  questionIds.add(question.id);
  record(question.kind === "aghanim-upgrade", `${question.id}: wrong question kind.`);
  record(question.prompt === "Whose upgrade is this?", `${question.id}: prompt drifted.`);
  record(question.difficulty === 2, `${question.id}: hidden scoring tier drifted.`);
  record(question.patch === source.patch, `${question.id}: patch stamp drifted.`);
  record(question.source?.url === upgrade.source?.url, `${question.id}: source stamp drifted.`);
  record(question.answers?.length === 4 && new Set(question.answers).size === 4, `${question.id}: invalid fallbacks.`);
  record(question.answerImages?.length === 4, `${question.id}: missing hero artwork fallbacks.`);
  record(question.answers?.[question.correctIndex] === hero.name, `${question.id}: correct hero name drifted.`);
  record(
    question.answerImages?.[question.correctIndex] === hero.image,
    `${question.id}: correct hero artwork does not resolve into the hero grid.`,
  );
  record(
    JSON.stringify(question.aghanim) ===
      JSON.stringify({
        effect: upgrade.effect,
        upgradeType: upgrade.upgradeType,
        upgradeMode: upgrade.upgradeMode,
        abilityName: upgrade.abilityName,
        audit: {
          clientAbilityKey: upgrade.clientAbilityKey,
          clientBuild: source.clientBuild,
          reviewedAt: source.reviewedAt,
        },
      }),
    `${question.id}: generated private clue data drifted from the reviewed source.`,
  );
}

record(
  typeCounts.scepter >= 35 && typeCounts.shard >= 35,
  `Upgrade types are unbalanced: ${JSON.stringify(typeCounts)}.`,
);
record(
  modeCounts.new >= 30 && modeCounts.existing >= 40,
  `Upgrade modes are unbalanced: ${JSON.stringify(modeCounts)}.`,
);
for (const currentHero of [
  "npc_dota_hero_ringmaster",
  "npc_dota_hero_muerta",
  "npc_dota_hero_kez",
  "npc_dota_hero_largo",
]) {
  record(heroKeys.has(currentHero), `${currentHero}: current hero is absent from the initial Aghanim batch.`);
}

record(
  component.includes('data-testid="aghanim-clue-1"') &&
    component.includes('data-testid="aghanim-clue-2"') &&
    component.includes('data-testid="aghanim-clue-3"') &&
    component.includes('currentGame === "aghanim-lab"') &&
    component.includes("<HeroPicker"),
  "Aghanim's Lab lost its three-stage hero-picker presentation.",
);
record(
  styles.includes(".aghanimQuestion") && styles.includes(".aghanimClues") && styles.includes(".aghanimArtwork"),
  "Aghanim's Lab lost its fixed progressive layout.",
);
record(
  serializer.includes("aghanim-lab") &&
    serializer.includes("STAGED_CLUE_GAMES") &&
    serializer.includes("clueStage >= 2") &&
    serializer.includes("clueStage >= 3"),
  "Aghanim's Lab clues are no longer staged by the server.",
);
record(
  scoring.includes('["spell-link", "aghanim-lab"]') && scoring.includes("PROGRESSIVE_CLUE_PENALTY"),
  "Aghanim's Lab no longer pays the progressive clue penalty.",
);

const clientRootArgument = process.argv.find((argument) => argument.startsWith("--client-root="));
const clientRoot = resolve(
  clientRootArgument?.slice("--client-root=".length) ??
    process.env.DOTA_CLIENT_AUDIT_ROOT ??
    `/tmp/queue-arcade-live${CLIENT_CONSTANT_AUDIT.clientBuild}`,
);
try {
  for (const upgrade of source.upgrades) {
    const heroFile = join(clientRoot, "npc", "scripts", "npc", "heroes", `${upgrade.heroKey}.txt`);
    const definitions = parseValveKeyValues(await readFile(heroFile, "utf8")).DOTAAbilities ?? {};
    const ability = definitions[upgrade.clientAbilityKey];
    const flag =
      upgrade.upgradeMode === "new"
        ? upgrade.upgradeType === "scepter"
          ? "IsGrantedByScepter"
          : "IsGrantedByShard"
        : upgrade.upgradeType === "scepter"
          ? "HasScepterUpgrade"
          : "HasShardUpgrade";
    record(String(ability?.[flag] ?? "") === "1", `${upgrade.heroKey}:${upgrade.clientAbilityKey} lacks ${flag}.`);
  }
} catch (error) {
  reportMissingClientSource(error, "Aghanim upgrade flags");
}

if (failures.length) throw new Error(failures.join("\n"));
console.log(
  `Validated ${source.upgrades.length} answer-safe Aghanim upgrades (${typeCounts.scepter} Scepter / ${typeCounts.shard} Shard; ${modeCounts.new} new / ${modeCounts.existing} existing).`,
);
