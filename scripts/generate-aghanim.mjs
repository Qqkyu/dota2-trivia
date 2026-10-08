#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const SOURCE_PATH = join(ROOT, "src", "data", "aghanim-upgrades.json");
const HERO_PICKER_PATH = join(ROOT, "src", "data", "hero-picker.json");
const OUTPUT_PATH = join(ROOT, "src", "data", "aghanim-questions.json");

const [source, heroPicker] = await Promise.all(
  [SOURCE_PATH, HERO_PICKER_PATH].map((path) => readFile(path, "utf8").then(JSON.parse)),
);
const heroes = heroPicker.groups.flatMap((group) => group.heroes);
const heroesByKey = new Map(heroes.map((hero) => [hero.key, hero]));
const groupByHeroKey = new Map(
  heroPicker.groups.flatMap((group) => group.heroes.map((hero) => [hero.key, group.heroes])),
);

function answerChoices(record, recordIndex) {
  const hero = heroesByKey.get(record.heroKey);
  const group = groupByHeroKey.get(record.heroKey);
  if (!hero || !group) throw new Error(`${record.heroKey} is missing from the audited hero picker.`);

  const heroIndex = group.findIndex((candidate) => candidate.key === record.heroKey);
  const chosen = [hero];
  for (const offset of [3, 9, 17, 5, 13, 21]) {
    const candidate = group[(heroIndex + offset + recordIndex) % group.length];
    if (candidate && !chosen.some((entry) => entry.key === candidate.key)) chosen.push(candidate);
    if (chosen.length === 4) break;
  }
  if (chosen.length !== 4) throw new Error(`${record.heroKey} could not build four private fallback choices.`);

  const correctIndex = (recordIndex * 3 + 1) % 4;
  const distractors = chosen.slice(1);
  const ordered = [...distractors];
  ordered.splice(correctIndex, 0, hero);
  return { ordered, correctIndex };
}

const questions = source.upgrades.map((record, index) => {
  if (!record.source?.url || !record.sourceSha256 || !record.sourceRetrievedAt) {
    throw new Error(`${record.heroKey} is missing its reviewed Valve source.`);
  }
  const hero = heroesByKey.get(record.heroKey);
  const { ordered, correctIndex } = answerChoices(record, index);
  const upgradeLabel = record.upgradeType === "scepter" ? "Aghanim's Scepter" : "Aghanim's Shard";
  const action = record.upgradeMode === "new" ? "grants" : "upgrades";

  return {
    id: `aghanim-upgrade:${record.heroKey.replace(/^npc_dota_hero_/, "")}:${record.upgradeType}`,
    kind: "aghanim-upgrade",
    varietyKey: `aghanim:${record.upgradeType}:${record.upgradeMode}`,
    category: "Abilities",
    difficulty: 2,
    eyebrow: "Upgrade effect",
    prompt: "Whose upgrade is this?",
    answers: ordered.map((answer) => answer.name),
    answerImages: ordered.map((answer) => answer.image),
    answerImageKind: "hero",
    correctIndex,
    explanation: `${hero.name}'s ${upgradeLabel} ${action} ${record.abilityName}. ${record.effect}`,
    aghanim: {
      effect: record.effect,
      upgradeType: record.upgradeType,
      upgradeMode: record.upgradeMode,
      abilityName: record.abilityName,
      audit: {
        clientAbilityKey: record.clientAbilityKey,
        clientBuild: source.clientBuild,
        reviewedAt: source.reviewedAt,
      },
    },
    source: record.source,
    patch: source.patch,
  };
});

await writeFile(OUTPUT_PATH, `${JSON.stringify(questions, null, 2)}\n`);
console.log(`Generated ${questions.length} audited Aghanim's Lab questions.`);
