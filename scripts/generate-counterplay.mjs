#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = join(root, "src", "data", "counterplay-questions.json");
const metadata = JSON.parse(await readFile(join(root, "src", "data", "trivia-meta.generated.json"), "utf8"));

const SNAPSHOT_DATE = "2026-07-28";
const ASSET_ROOT = "https://cdn.cloudflare.steamstatic.com";
const SOURCE = {
  label: `OpenDota game constants · ${SNAPSHOT_DATE}`,
  url: "https://docs.opendota.com/",
};
const SPELL_BLOCK_SOURCE = {
  label: `Dota 2 Wiki · Spell Block · ${SNAPSHOT_DATE}`,
  url: "https://liquipedia.net/dota2/Spell_Block",
};
const SPELL_REFLECTION_SOURCE = {
  label: `Dota 2 Wiki · Spell Reflection · ${SNAPSHOT_DATE}`,
  url: "https://liquipedia.net/dota2/Spell_Reflection",
};

// These are current exceptions that still present as unit-targeted casts in the
// shipped constants. Keeping the allowlist here makes accidental "spot the only
// targeted spell" matchups fail generation instead of reaching the game.
const SPELL_BLOCK_BYPASSES = new Set([
  "tidehunter_gush",
  "lion_impale",
  "lina_dragon_slave",
  "death_prophet_carrion_swarm",
  "dragon_knight_breathe_fire",
  "magnataur_shockwave",
  "tiny_toss_tree",
  "troll_warlord_whirling_axes_ranged",
  "viper_poison_attack",
  "obsidian_destroyer_arcane_orb",
]);

const familyInfo = {
  "debuff-immunity": {
    kind: "counterplay-immunity",
    eyebrow: "BKB · Debuff immunity",
    prompt: "Which pierces BKB?",
    tool: "Black King Bar",
    anchor: ["item", "black_king_bar"],
    outcome(ability) {
      return ability.bkbpierce === "Yes";
    },
    explanation(answer) {
      return `${answer} pierces debuff immunity. The other three abilities do not.`;
    },
  },
  "basic-dispel": {
    kind: "counterplay-basic-dispel",
    eyebrow: "Manta · Basic dispel",
    prompt: "Which debuff gets purged?",
    tool: "Manta Style",
    anchor: ["item", "manta"],
    outcome(ability) {
      return ability.dispellable === "Yes";
    },
    explanation(answer) {
      return `Manta Style's basic dispel removes ${answer}. The other effects need a strong dispel or cannot be dispelled.`;
    },
  },
  "strong-dispel": {
    kind: "counterplay-strong-dispel",
    eyebrow: "Status · Strong dispel",
    prompt: "Which needs strong dispel?",
    tool: "Strong Dispel",
    anchor: ["ability", "oracle_false_promise"],
    outcome(ability) {
      return ability.dispellable === "Strong Dispels Only";
    },
    explanation(answer) {
      return `${answer} is removable by a strong dispel, but not by a basic dispel.`;
    },
  },
  "offensive-dispel": {
    kind: "counterplay-nullifier",
    eyebrow: "Nullifier · Enemy buff",
    prompt: "Which buff gets purged?",
    tool: "Nullifier",
    anchor: ["item", "nullifier"],
    outcome(ability) {
      return ability.dispellable === "Yes";
    },
    explanation(answer) {
      return `Nullifier's basic offensive dispel removes ${answer}. The other three buffs are undispellable.`;
    },
  },
  "spell-block": {
    kind: "counterplay-spell-block",
    eyebrow: "Linken's · Exception",
    prompt: "Which bypasses Linken's?",
    tool: "Linken's Sphere",
    anchor: ["item", "sphere"],
    format: "curated-exception",
    source: SPELL_BLOCK_SOURCE,
    outcome(_ability, key) {
      return SPELL_BLOCK_BYPASSES.has(key);
    },
  },
  "spell-reflect": {
    kind: "counterplay-spell-reflect",
    eyebrow: "Lotus · Interaction",
    prompt: "What happens?",
    tool: "Lotus Orb",
    anchor: ["item", "lotus_orb"],
    format: "interaction-scenario",
    source: SPELL_REFLECTION_SOURCE,
  },
};

const definitions = [
  {
    family: "debuff-immunity",
    difficulty: 1,
    correct: "axe_berserkers_call",
    distractors: ["tidehunter_ravage", "slardar_slithereen_crush", "earthshaker_echo_slam"],
  },
  {
    family: "debuff-immunity",
    difficulty: 1,
    correct: "pudge_dismember",
    distractors: ["shadow_shaman_shackles", "lich_sinister_gaze", "pugna_life_drain"],
  },
  {
    family: "debuff-immunity",
    difficulty: 1,
    correct: "enigma_black_hole",
    distractors: ["disruptor_static_storm", "crystal_maiden_freezing_field", "warlock_upheaval"],
  },
  {
    family: "debuff-immunity",
    difficulty: 2,
    correct: "beastmaster_primal_roar",
    distractors: ["necrolyte_reapers_scythe", "lina_laguna_blade", "lion_voodoo"],
  },
  {
    family: "debuff-immunity",
    difficulty: 2,
    correct: "faceless_void_chronosphere",
    distractors: ["puck_dream_coil", "mars_arena_of_blood", "abyssal_underlord_pit_of_malice"],
  },
  {
    family: "debuff-immunity",
    difficulty: 2,
    correct: "magnataur_reverse_polarity",
    distractors: ["tidehunter_ravage", "centaur_hoof_stomp", "slardar_slithereen_crush"],
  },
  {
    family: "debuff-immunity",
    difficulty: 2,
    correct: "legion_commander_duel",
    distractors: ["terrorblade_sunder", "disruptor_glimpse", "necrolyte_reapers_scythe"],
  },
  {
    family: "debuff-immunity",
    difficulty: 3,
    correct: "slardar_amplify_damage",
    distractors: ["tidehunter_gush", "vengefulspirit_wave_of_terror", "bane_enfeeble"],
  },
  {
    family: "debuff-immunity",
    difficulty: 3,
    correct: "bloodseeker_rupture",
    distractors: ["witch_doctor_maledict", "disruptor_static_storm", "puck_dream_coil"],
  },
  {
    family: "debuff-immunity",
    difficulty: 3,
    correct: "rattletrap_hookshot",
    distractors: ["mirana_arrow", "mars_spear", "earth_spirit_rolling_boulder"],
  },
  {
    family: "debuff-immunity",
    difficulty: 3,
    correct: "winter_wyvern_winters_curse",
    distractors: ["dark_willow_terrorize", "necrolyte_reapers_scythe", "naga_siren_ensnare"],
  },
  {
    family: "debuff-immunity",
    difficulty: 3,
    correct: "primal_beast_pulverize",
    distractors: ["rubick_telekinesis", "chaos_knight_chaos_bolt", "storm_spirit_electric_vortex"],
  },

  {
    family: "basic-dispel",
    difficulty: 1,
    correct: "crystal_maiden_crystal_nova",
    distractors: ["bane_fiends_grip", "bloodseeker_rupture", "witch_doctor_maledict"],
  },
  {
    family: "basic-dispel",
    difficulty: 1,
    correct: "axe_battle_hunger",
    distractors: ["pudge_dismember", "doom_bringer_doom", "puck_dream_coil"],
  },
  {
    family: "basic-dispel",
    difficulty: 1,
    correct: "drow_ranger_wave_of_silence",
    distractors: ["tidehunter_ravage", "disruptor_static_storm", "disruptor_glimpse"],
  },
  {
    family: "basic-dispel",
    difficulty: 2,
    correct: "slardar_amplify_damage",
    distractors: ["beastmaster_primal_roar", "viper_viper_strike", "necrolyte_reapers_scythe"],
  },
  {
    family: "basic-dispel",
    difficulty: 2,
    correct: "dazzle_poison_touch",
    distractors: ["batrider_flaming_lasso", "witch_doctor_maledict", "bloodseeker_rupture"],
  },
  {
    family: "basic-dispel",
    difficulty: 2,
    correct: "silencer_curse_of_the_silent",
    distractors: ["legion_commander_duel", "lion_voodoo", "doom_bringer_doom"],
  },
  {
    family: "basic-dispel",
    difficulty: 3,
    correct: "warlock_fatal_bonds",
    distractors: ["bane_fiends_grip", "razor_static_link", "witch_doctor_maledict"],
  },
  {
    family: "basic-dispel",
    difficulty: 3,
    correct: "silencer_last_word",
    distractors: ["magnataur_reverse_polarity", "puck_dream_coil", "disruptor_static_storm"],
  },
  {
    family: "basic-dispel",
    difficulty: 3,
    correct: "pugna_decrepify",
    distractors: ["pudge_dismember", "pugna_life_drain", "necrolyte_reapers_scythe"],
  },
  {
    family: "basic-dispel",
    difficulty: 3,
    correct: "bane_enfeeble",
    distractors: ["batrider_flaming_lasso", "disruptor_static_storm", "witch_doctor_maledict"],
  },

  {
    family: "strong-dispel",
    difficulty: 1,
    correct: "sven_storm_bolt",
    distractors: ["axe_battle_hunger", "bloodseeker_rupture", "witch_doctor_maledict"],
  },
  {
    family: "strong-dispel",
    difficulty: 1,
    correct: "lion_voodoo",
    distractors: ["bane_enfeeble", "doom_bringer_doom", "disruptor_glimpse"],
  },
  {
    family: "strong-dispel",
    difficulty: 2,
    correct: "mirana_arrow",
    distractors: ["drow_ranger_wave_of_silence", "puck_dream_coil", "disruptor_static_storm"],
  },
  {
    family: "strong-dispel",
    difficulty: 2,
    correct: "beastmaster_primal_roar",
    distractors: ["slardar_amplify_damage", "viper_viper_strike", "legion_commander_duel"],
  },
  {
    family: "strong-dispel",
    difficulty: 2,
    correct: "bane_fiends_grip",
    distractors: ["warlock_fatal_bonds", "bloodseeker_rupture", "witch_doctor_maledict"],
  },
  {
    family: "strong-dispel",
    difficulty: 3,
    correct: "magnataur_reverse_polarity",
    distractors: ["silencer_curse_of_the_silent", "faceless_void_chronosphere", "doom_bringer_doom"],
  },
  {
    family: "strong-dispel",
    difficulty: 3,
    correct: "batrider_flaming_lasso",
    distractors: ["dazzle_poison_touch", "razor_static_link", "puck_dream_coil"],
  },
  {
    family: "strong-dispel",
    difficulty: 3,
    correct: "chaos_knight_chaos_bolt",
    distractors: ["pugna_decrepify", "necrolyte_reapers_scythe", "disruptor_glimpse"],
  },
  {
    family: "strong-dispel",
    difficulty: 3,
    correct: "pudge_dismember",
    distractors: ["silencer_last_word", "bloodseeker_rupture", "witch_doctor_maledict"],
  },
  {
    family: "strong-dispel",
    difficulty: 3,
    correct: "tidehunter_ravage",
    distractors: ["slardar_amplify_damage", "disruptor_static_storm", "doom_bringer_doom"],
  },

  {
    family: "offensive-dispel",
    difficulty: 1,
    correct: "windrunner_windrun",
    distractors: ["sven_gods_strength", "juggernaut_blade_fury", "life_stealer_rage"],
  },
  {
    family: "offensive-dispel",
    difficulty: 1,
    correct: "necrolyte_ghost_shroud",
    distractors: ["dazzle_shallow_grave", "templar_assassin_refraction", "dark_willow_shadow_realm"],
  },
  {
    family: "offensive-dispel",
    difficulty: 2,
    correct: "sven_warcry",
    distractors: ["omniknight_guardian_angel", "abaddon_borrowed_time", "terrorblade_metamorphosis"],
  },
  {
    family: "offensive-dispel",
    difficulty: 2,
    correct: "ember_spirit_flame_guard",
    distractors: ["juggernaut_blade_fury", "muerta_pierce_the_veil", "slark_shadow_dance"],
  },
  {
    family: "offensive-dispel",
    difficulty: 2,
    correct: "ogre_magi_bloodlust",
    distractors: ["sven_gods_strength", "windrunner_focusfire", "dragon_knight_elder_dragon_form"],
  },
  {
    family: "offensive-dispel",
    difficulty: 3,
    correct: "dark_seer_surge",
    distractors: ["lycan_shapeshift", "centaur_stampede", "clinkz_wind_walk"],
  },
  {
    family: "offensive-dispel",
    difficulty: 3,
    correct: "treant_living_armor",
    distractors: ["dazzle_shallow_grave", "winter_wyvern_cold_embrace", "oracle_false_promise"],
  },
  {
    family: "offensive-dispel",
    difficulty: 3,
    correct: "lich_frost_shield",
    distractors: ["templar_assassin_refraction", "lina_flame_cloak", "omniknight_guardian_angel"],
  },
  {
    family: "offensive-dispel",
    difficulty: 3,
    correct: "grimstroke_spirit_walk",
    distractors: ["dark_willow_shadow_realm", "primal_beast_uproar", "slark_shadow_dance"],
  },
  {
    family: "offensive-dispel",
    difficulty: 3,
    correct: "magnataur_empower",
    distractors: ["sven_gods_strength", "terrorblade_metamorphosis", "lone_druid_true_form"],
  },

  {
    family: "spell-block",
    difficulty: 1,
    correct: "tidehunter_gush",
    distractors: ["doom_bringer_doom", "legion_commander_duel", "pudge_dismember"],
    explanation:
      "Gush bypasses Linken's Sphere because its hybrid unit-or-ground targeting does not trigger Spell Block.",
  },
  {
    family: "spell-block",
    difficulty: 1,
    correct: "lion_impale",
    distractors: ["lion_voodoo", "lion_finger_of_death", "beastmaster_primal_roar"],
    explanation:
      "Earth Spike bypasses Linken's Sphere. Since 7.37, its hybrid unit-or-ground cast no longer triggers Spell Block.",
  },
  {
    family: "spell-block",
    difficulty: 2,
    correct: "lina_dragon_slave",
    distractors: ["lina_laguna_blade", "necrolyte_reapers_scythe", "viper_viper_strike"],
    explanation:
      "Dragon Slave bypasses Linken's Sphere because its hybrid unit-or-ground targeting does not trigger Spell Block.",
  },
  {
    family: "spell-block",
    difficulty: 2,
    correct: "death_prophet_carrion_swarm",
    distractors: ["terrorblade_sunder", "winter_wyvern_winters_curse", "sniper_assassinate"],
    explanation:
      "Crypt Swarm bypasses Linken's Sphere because its hybrid unit-or-ground targeting does not trigger Spell Block.",
  },
  {
    family: "spell-block",
    difficulty: 2,
    correct: "dragon_knight_breathe_fire",
    distractors: ["dragon_knight_dragon_tail", "lich_frost_nova", "bane_fiends_grip"],
    explanation:
      "Breathe Fire bypasses Linken's Sphere because its hybrid unit-or-ground targeting does not trigger Spell Block.",
  },
  {
    family: "spell-block",
    difficulty: 2,
    correct: "magnataur_shockwave",
    distractors: ["razor_static_link", "doom_bringer_doom", "legion_commander_duel"],
    explanation:
      "Shockwave bypasses Linken's Sphere because its hybrid unit-or-ground targeting does not trigger Spell Block.",
  },
  {
    family: "spell-block",
    difficulty: 3,
    correct: "tiny_toss_tree",
    distractors: ["tiny_toss", "sven_storm_bolt", "vengefulspirit_magic_missile"],
    explanation:
      "Tree Throw bypasses Linken's Sphere because its hybrid unit-or-ground targeting does not trigger Spell Block.",
  },
  {
    family: "spell-block",
    difficulty: 3,
    correct: "troll_warlord_whirling_axes_ranged",
    distractors: ["shadow_shaman_shackles", "pudge_dismember", "terrorblade_sunder"],
    explanation:
      "Whirling Axes (Ranged) bypasses Linken's Sphere because its hybrid unit-or-ground targeting does not trigger Spell Block.",
  },
  {
    family: "spell-block",
    difficulty: 3,
    correct: "viper_poison_attack",
    distractors: ["viper_viper_strike", "huskar_life_break", "necrolyte_reapers_scythe"],
    explanation: "Poison Attack bypasses Linken's Sphere because active attack modifiers do not trigger Spell Block.",
  },
  {
    family: "spell-block",
    difficulty: 3,
    correct: "obsidian_destroyer_arcane_orb",
    distractors: ["lion_finger_of_death", "lina_laguna_blade", "doom_bringer_doom"],
    explanation: "Arcane Orb bypasses Linken's Sphere because active attack modifiers do not trigger Spell Block.",
  },

  {
    family: "spell-reflect",
    difficulty: 1,
    id: "nether-swap",
    subject: "vengefulspirit_nether_swap",
    eyebrow: "Nether Swap → Lotus Orb",
    prompt: "Swap sequence:",
    correctAnswer: "There and back",
    distractors: ["One swap", "Blocked", "No cast"],
    explanation: "There and back. Echo Shell reflects Nether Swap after the original move, immediately reversing it.",
  },
  {
    family: "spell-reflect",
    difficulty: 1,
    id: "doom",
    subject: "doom_bringer_doom",
    eyebrow: "Doom → Lotus Orb",
    prompt: "Doomed heroes:",
    correctAnswer: "Both",
    distractors: ["Target only", "Caster only", "Neither"],
    explanation: "Both heroes are Doomed. Echo Shell does not block the original cast; it re-casts Doom at its caster.",
  },
  {
    family: "spell-reflect",
    difficulty: 2,
    id: "lotus-linkens-order",
    subject: "doom_bringer_doom",
    eyebrow: "Doom → Lotus + Linken's",
    prompt: "Defense result:",
    tool: "Lotus + Linken's",
    correctAnswer: "Blocked + reflected",
    distractors: ["Blocked only", "Both Dooms land", "Original Doom lands"],
    explanation:
      "Blocked + reflected. Spell Reflection triggers before Spell Block, so Doom returns while the original is blocked.",
  },
  {
    family: "spell-reflect",
    difficulty: 2,
    id: "chaos-bolt-roll",
    subject: "chaos_knight_chaos_bolt",
    eyebrow: "Chaos Bolt → Lotus Orb",
    prompt: "Reflected roll:",
    correctAnswer: "New roll",
    distractors: ["Same roll", "Damage only", "No reflection"],
    explanation: "New roll. Chaos Bolt calculates fresh damage and stun values instead of copying the original roll.",
  },
  {
    family: "spell-reflect",
    difficulty: 2,
    id: "fireblast-multicast",
    subject: "ogre_magi_fireblast",
    eyebrow: "Fireblast Multicast → Lotus",
    prompt: "Reflected casts:",
    correctAnswer: "Every cast",
    distractors: ["First only", "Last only", "None"],
    explanation: "Every cast is reflected. Echo Shell re-casts each Fireblast instance generated by Multicast.",
  },
  {
    family: "spell-reflect",
    difficulty: 2,
    id: "storm-hammer-mid-flight",
    subject: "sven_storm_bolt",
    eyebrow: "Storm Hammer → Mid-flight Lotus",
    prompt: "On impact:",
    correctAnswer: "Still reflects",
    distractors: ["Too late", "Gets blocked", "Splash only"],
    explanation: "Still reflects. Most targeted projectiles check Spell Reflection when they hit, not when cast.",
  },
  {
    family: "spell-reflect",
    difficulty: 3,
    id: "charge-timing",
    subject: "spirit_breaker_charge_of_darkness",
    eyebrow: "Charge → Lotus Orb",
    prompt: "Reflects:",
    correctAnswer: "On cast",
    distractors: ["On impact", "After Bash", "Never"],
    explanation: "On cast. Charge of Darkness reflects before impact, and its reflected cast does not Greater Bash.",
  },
  {
    family: "spell-reflect",
    difficulty: 3,
    id: "freezing-field-frostbite",
    subject: "crystal_maiden_freezing_field",
    eyebrow: "Upgraded Freezing Field → Lotus",
    prompt: "Frostbite reflections:",
    correctAnswer: "None",
    distractors: ["Every proc", "First only", "Last only"],
    explanation: "None. Lotus only reflects manually cast Frostbite, not Frostbite applied by upgraded Freezing Field.",
  },
  {
    family: "spell-reflect",
    difficulty: 3,
    id: "fiends-grip-channel",
    subject: "bane_fiends_grip",
    eyebrow: "Fiend's Grip → Lotus Orb",
    prompt: "Copy channeler:",
    correctAnswer: "Echo Shell target",
    distractors: ["Original Bane", "Lotus caster", "Nobody"],
    explanation: "Echo Shell target channels the reflected Fiend's Grip and must stand still to keep the copy going.",
  },
  {
    family: "spell-reflect",
    difficulty: 3,
    id: "reflected-upgrades",
    subject: "lion_finger_of_death",
    eyebrow: "Finger → Lotus Orb",
    prompt: "Whose upgrades?",
    correctAnswer: "Original caster",
    distractors: ["Echo Shell target", "Lotus Orb owner", "Nobody"],
    explanation:
      "Original caster upgrades are retained by the reflected spell, including talents, facet, Scepter, and Shard.",
  },
];

const [abilitiesResponse, itemsResponse] = await Promise.all([
  fetch("https://api.opendota.com/api/constants/abilities"),
  fetch("https://api.opendota.com/api/constants/items"),
]);

if (!abilitiesResponse.ok || !itemsResponse.ok) {
  throw new Error(`Could not load OpenDota constants (${abilitiesResponse.status}, ${itemsResponse.status}).`);
}

const [abilities, items] = await Promise.all([abilitiesResponse.json(), itemsResponse.json()]);

function assetUrl(path) {
  if (typeof path !== "string" || !path.startsWith("/apps/dota2/images/")) {
    throw new Error(`Invalid Dota asset path: ${String(path)}`);
  }
  return `${ASSET_ROOT}${path.split("?")[0]}`;
}

function anchorImage([type, key]) {
  const record = type === "item" ? items[key] : abilities[key];
  if (!record?.dname || !record.img) throw new Error(`Missing ${type} anchor ${key}.`);
  return {
    src: assetUrl(record.img),
    alt: `${record.dname} ${type} icon`,
    kind: type,
  };
}

const questions = definitions.map((definition, index) => {
  const family = familyInfo[definition.family];
  if (!family) throw new Error(`Unknown Counterplay family ${definition.family}.`);

  const isScenario = family.format === "interaction-scenario";
  const correctSlot = index % 4;
  const answerKeys = isScenario ? null : [...definition.distractors];
  answerKeys?.splice(correctSlot, 0, definition.correct);
  const answerRecords = answerKeys?.map((key) => {
    const ability = abilities[key];
    if (!ability?.dname || !ability.img) throw new Error(`Missing ability ${key}.`);
    return ability;
  });
  const answers = isScenario ? [...definition.distractors] : answerRecords.map((ability) => ability.dname);
  if (isScenario) answers.splice(correctSlot, 0, definition.correctAnswer);
  const outcomes = isScenario
    ? answers.map((_answer, answerIndex) => answerIndex === correctSlot)
    : answerRecords.map((ability, answerIndex) => family.outcome(ability, answerKeys[answerIndex]));
  const targetedOptions = answerRecords?.map((ability) => {
    const behavior = Array.isArray(ability.behavior) ? ability.behavior : [ability.behavior];
    return behavior.includes("Unit Target");
  });

  if (family.format === "curated-exception") {
    if (targetedOptions.some((isTargeted) => !isTargeted)) {
      throw new Error(
        `${family.kind}:${definition.correct} includes a visually eliminable non-targeted option: ${answerRecords
          .filter((_ability, answerIndex) => !targetedOptions[answerIndex])
          .map((ability) => ability.dname)
          .join(", ")}.`,
      );
    }
  }

  if (outcomes.filter(Boolean).length !== 1) {
    throw new Error(
      `${family.kind}:${definition.correct ?? definition.id} must have exactly one valid answer (${JSON.stringify(
        answers.map((answer, answerIndex) => ({
          answer,
          outcome: outcomes[answerIndex],
          ...(answerRecords
            ? {
                key: answerKeys[answerIndex],
                bkbpierce: answerRecords[answerIndex].bkbpierce,
                dispellable: answerRecords[answerIndex].dispellable,
                behavior: answerRecords[answerIndex].behavior,
              }
            : {}),
        })),
      )}).`,
    );
  }

  const correctIndex = outcomes.indexOf(true);
  const questionImage = isScenario ? anchorImage(["ability", definition.subject]) : anchorImage(family.anchor);
  return {
    id: `${family.kind}:${definition.correct ?? definition.id}`,
    kind: family.kind,
    category: "Mechanics",
    difficulty: definition.difficulty,
    eyebrow: definition.eyebrow ?? family.eyebrow,
    prompt: definition.prompt ?? family.prompt,
    image: questionImage,
    answers,
    ...(answerRecords
      ? {
          answerImages: answerRecords.map((ability) => assetUrl(ability.img)),
          answerImageKind: "ability",
        }
      : {}),
    correctIndex,
    explanation: definition.explanation ?? family.explanation(answers[correctIndex]),
    counterplay: {
      family: definition.family,
      tool: definition.tool ?? family.tool,
      outcomes,
      format: family.format ?? "constant-matchup",
      ...(definition.note
        ? { note: definition.note }
        : isScenario
          ? {}
          : { note: "Base abilities · no talents or upgrades" }),
      ...(targetedOptions && family.format === "curated-exception" ? { targetedOptions } : {}),
    },
    source: family.source ?? SOURCE,
    patch: metadata.patch,
  };
});

await writeFile(outputPath, `${JSON.stringify(questions, null, 2)}\n`);
console.log(
  `Generated ${questions.length} audited Counterplay questions from ${SNAPSHOT_DATE} constants and interaction tables.`,
);
