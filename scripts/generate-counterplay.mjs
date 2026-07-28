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
    eyebrow: "Linken's · Spell block",
    prompt: "Which spell gets blocked?",
    tool: "Linken's Sphere",
    anchor: ["item", "sphere"],
    outcome(ability) {
      const behavior = Array.isArray(ability.behavior) ? ability.behavior : [ability.behavior];
      return behavior.includes("Unit Target");
    },
    explanation(answer) {
      return `Linken's Sphere blocks ${answer}'s unit-targeted cast.`;
    },
  },
  "spell-reflect": {
    kind: "counterplay-spell-reflect",
    eyebrow: "Lotus · Spell reflect",
    prompt: "Which spell gets returned?",
    tool: "Lotus Orb",
    anchor: ["item", "lotus_orb"],
    outcome(ability) {
      const behavior = Array.isArray(ability.behavior) ? ability.behavior : [ability.behavior];
      return behavior.includes("Unit Target");
    },
    explanation(answer) {
      return `Echo Shell re-casts ${answer} at its caster. The original spell still affects the shielded hero.`;
    },
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
    correct: "doom_bringer_doom",
    distractors: ["enigma_black_hole", "magnataur_reverse_polarity", "faceless_void_chronosphere"],
  },
  {
    family: "spell-block",
    difficulty: 1,
    correct: "legion_commander_duel",
    distractors: ["tidehunter_ravage", "mars_arena_of_blood", "disruptor_static_storm"],
  },
  {
    family: "spell-block",
    difficulty: 1,
    correct: "lion_finger_of_death",
    distractors: ["kunkka_ghostship", "queenofpain_sonic_wave", "earthshaker_echo_slam"],
  },
  {
    family: "spell-block",
    difficulty: 2,
    correct: "beastmaster_primal_roar",
    distractors: ["rattletrap_hookshot", "mirana_arrow", "mars_spear"],
  },
  {
    family: "spell-block",
    difficulty: 2,
    correct: "necrolyte_reapers_scythe",
    distractors: ["witch_doctor_death_ward", "venomancer_poison_nova", "sandking_epicenter"],
  },
  {
    family: "spell-block",
    difficulty: 2,
    correct: "pudge_dismember",
    distractors: ["enigma_black_hole", "crystal_maiden_freezing_field", "phoenix_sun_ray"],
  },
  {
    family: "spell-block",
    difficulty: 3,
    correct: "winter_wyvern_winters_curse",
    distractors: ["dark_willow_terrorize", "puck_dream_coil", "naga_siren_song_of_the_siren"],
  },
  {
    family: "spell-block",
    difficulty: 3,
    correct: "terrorblade_sunder",
    distractors: ["luna_eclipse", "phoenix_supernova", "muerta_pierce_the_veil"],
  },
  {
    family: "spell-block",
    difficulty: 3,
    correct: "sniper_assassinate",
    distractors: ["hoodwink_sharpshooter", "snapfire_mortimer_kisses", "rattletrap_rocket_flare"],
  },
  {
    family: "spell-block",
    difficulty: 3,
    correct: "razor_static_link",
    distractors: ["razor_plasma_field", "razor_eye_of_the_storm", "disruptor_static_storm"],
  },

  {
    family: "spell-reflect",
    difficulty: 1,
    correct: "lina_laguna_blade",
    distractors: ["lina_light_strike_array", "windrunner_powershot", "nevermore_requiem"],
  },
  {
    family: "spell-reflect",
    difficulty: 1,
    correct: "vengefulspirit_magic_missile",
    distractors: ["vengefulspirit_wave_of_terror", "tidehunter_ravage", "earthshaker_fissure"],
  },
  {
    family: "spell-reflect",
    difficulty: 1,
    correct: "lich_frost_nova",
    distractors: ["jakiro_ice_path", "jakiro_macropyre", "crystal_maiden_crystal_nova"],
  },
  {
    family: "spell-reflect",
    difficulty: 2,
    correct: "sven_storm_bolt",
    distractors: ["centaur_hoof_stomp", "tiny_avalanche", "magnataur_reverse_polarity"],
  },
  {
    family: "spell-reflect",
    difficulty: 2,
    correct: "lion_finger_of_death",
    distractors: ["queenofpain_sonic_wave", "earthshaker_echo_slam", "sniper_shrapnel"],
  },
  {
    family: "spell-reflect",
    difficulty: 2,
    correct: "viper_viper_strike",
    distractors: ["viper_nethertoxin", "venomancer_poison_nova", "venomancer_venomous_gale"],
  },
  {
    family: "spell-reflect",
    difficulty: 3,
    correct: "doom_bringer_doom",
    distractors: ["disruptor_static_storm", "puck_dream_coil", "enigma_black_hole"],
  },
  {
    family: "spell-reflect",
    difficulty: 3,
    correct: "bane_fiends_grip",
    distractors: ["enigma_black_hole", "phoenix_sun_ray", "crystal_maiden_freezing_field"],
  },
  {
    family: "spell-reflect",
    difficulty: 3,
    correct: "legion_commander_duel",
    distractors: ["mars_arena_of_blood", "faceless_void_chronosphere", "tidehunter_ravage"],
  },
  {
    family: "spell-reflect",
    difficulty: 3,
    correct: "vengefulspirit_nether_swap",
    distractors: ["dark_seer_vacuum", "kunkka_ghostship", "earth_spirit_rolling_boulder"],
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

  const answerKeys = [...definition.distractors];
  answerKeys.splice(index % 4, 0, definition.correct);
  const answerRecords = answerKeys.map((key) => {
    const ability = abilities[key];
    if (!ability?.dname || !ability.img) throw new Error(`Missing ability ${key}.`);
    return ability;
  });
  const outcomes = answerRecords.map((ability) => family.outcome(ability));
  if (outcomes.filter(Boolean).length !== 1) {
    throw new Error(
      `${family.kind}:${definition.correct} must have exactly one valid answer (${JSON.stringify(
        answerKeys.map((key, answerIndex) => ({
          key,
          outcome: outcomes[answerIndex],
          bkbpierce: answerRecords[answerIndex].bkbpierce,
          dispellable: answerRecords[answerIndex].dispellable,
          behavior: answerRecords[answerIndex].behavior,
        })),
      )}).`,
    );
  }

  const correctIndex = outcomes.indexOf(true);
  const answers = answerRecords.map((ability) => ability.dname);
  return {
    id: `${family.kind}:${definition.correct}`,
    kind: family.kind,
    category: "Mechanics",
    difficulty: definition.difficulty,
    eyebrow: family.eyebrow,
    prompt: family.prompt,
    image: anchorImage(family.anchor),
    answers,
    answerImages: answerRecords.map((ability) => assetUrl(ability.img)),
    answerImageKind: "ability",
    correctIndex,
    explanation: family.explanation(answers[correctIndex]),
    counterplay: {
      family: definition.family,
      tool: family.tool,
      outcomes,
    },
    source: SOURCE,
    patch: metadata.patch,
  };
});

await writeFile(outputPath, `${JSON.stringify(questions, null, 2)}\n`);
console.log(
  `Generated ${questions.length} audited Counterplay questions from OpenDota's ${SNAPSHOT_DATE} game constants.`,
);
