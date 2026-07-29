// Counterplay is deliberately fail-closed. Every ability shown in a mechanics
// round must appear here with an explicitly reviewed outcome. This prevents a
// newly added option, stale API field, or targeting-mode assumption from
// silently becoming a "fact" in the game.
//
// Constant-backed facts were cross-checked on 2026-07-29 against the installed
// Dota 2 7.41d client (build 6872, VersionDate Jul 28 2026) and the current
// Liquipedia mechanics pages. The interaction scenarios below were reviewed
// against the same mechanics pages.

export const COUNTERPLAY_AUDIT = Object.freeze({
  patch: "7.41d",
  reviewedAt: "2026-07-29",
  clientBuild: "6872",
  clientVersionDate: "2026-07-28",
});

export const COUNTERPLAY_SOURCES = Object.freeze({
  "debuff-immunity": {
    label: `Liquipedia · Debuff Immunity · ${COUNTERPLAY_AUDIT.reviewedAt}`,
    url: "https://liquipedia.net/dota2/Debuff_Immunity/Enemy_Interactions",
  },
  "basic-dispel": {
    label: `Liquipedia · Dispel · ${COUNTERPLAY_AUDIT.reviewedAt}`,
    url: "https://liquipedia.net/dota2/Dispel",
  },
  "strong-dispel": {
    label: `Liquipedia · Dispel · ${COUNTERPLAY_AUDIT.reviewedAt}`,
    url: "https://liquipedia.net/dota2/Dispel",
  },
  "offensive-dispel": {
    label: `Liquipedia · Dispel · ${COUNTERPLAY_AUDIT.reviewedAt}`,
    url: "https://liquipedia.net/dota2/Dispel",
  },
  "spell-block": {
    label: `Liquipedia · Spell Block · ${COUNTERPLAY_AUDIT.reviewedAt}`,
    url: "https://liquipedia.net/dota2/Spell_Block",
  },
  "spell-reflect": {
    label: `Liquipedia · Spell Reflection · ${COUNTERPLAY_AUDIT.reviewedAt}`,
    url: "https://liquipedia.net/dota2/Spell_Reflection",
  },
});

const auditedFacts = {
  "debuff-immunity": {
    yes: [
      "axe_berserkers_call",
      "beastmaster_primal_roar",
      "bloodseeker_rupture",
      "enigma_black_hole",
      "faceless_void_chronosphere",
      "legion_commander_duel",
      "magnataur_reverse_polarity",
      "primal_beast_pulverize",
      "pudge_dismember",
      "rattletrap_hookshot",
      "slardar_amplify_damage",
      "winter_wyvern_winters_curse",
    ],
    no: [
      "abyssal_underlord_pit_of_malice",
      "bane_enfeeble",
      "centaur_hoof_stomp",
      "chaos_knight_chaos_bolt",
      "crystal_maiden_freezing_field",
      "dark_willow_terrorize",
      "disruptor_glimpse",
      "disruptor_static_storm",
      "earth_spirit_rolling_boulder",
      "earthshaker_echo_slam",
      "lich_sinister_gaze",
      "lina_laguna_blade",
      "lion_voodoo",
      "mars_arena_of_blood",
      "mars_spear",
      "mirana_arrow",
      "naga_siren_ensnare",
      "necrolyte_reapers_scythe",
      "puck_dream_coil",
      "pugna_life_drain",
      "rubick_telekinesis",
      "shadow_shaman_shackles",
      "slardar_slithereen_crush",
      "storm_spirit_electric_vortex",
      "terrorblade_sunder",
      "tidehunter_gush",
      "tidehunter_ravage",
      "vengefulspirit_wave_of_terror",
      "warlock_upheaval",
      "witch_doctor_maledict",
    ],
  },
  "basic-dispel": {
    yes: [
      "axe_battle_hunger",
      "bane_enfeeble",
      "crystal_maiden_crystal_nova",
      "dazzle_poison_touch",
      "drow_ranger_wave_of_silence",
      "pugna_decrepify",
      "silencer_curse_of_the_silent",
      "silencer_last_word",
      "slardar_amplify_damage",
      "warlock_fatal_bonds",
    ],
    no: [
      "bane_fiends_grip",
      "batrider_flaming_lasso",
      "beastmaster_primal_roar",
      "bloodseeker_rupture",
      "disruptor_glimpse",
      "disruptor_static_storm",
      "doom_bringer_doom",
      "legion_commander_duel",
      "lion_voodoo",
      "magnataur_reverse_polarity",
      "necrolyte_reapers_scythe",
      "puck_dream_coil",
      "pudge_dismember",
      "pugna_life_drain",
      "razor_static_link",
      "tidehunter_ravage",
      "viper_viper_strike",
      "witch_doctor_maledict",
    ],
  },
  "strong-dispel": {
    yes: [
      "bane_fiends_grip",
      "batrider_flaming_lasso",
      "beastmaster_primal_roar",
      "chaos_knight_chaos_bolt",
      "lion_voodoo",
      "magnataur_reverse_polarity",
      "mirana_arrow",
      "pudge_dismember",
      "sven_storm_bolt",
      "tidehunter_ravage",
    ],
    no: [
      "axe_battle_hunger",
      "bane_enfeeble",
      "bloodseeker_rupture",
      "dazzle_poison_touch",
      "disruptor_glimpse",
      "disruptor_static_storm",
      "doom_bringer_doom",
      "drow_ranger_wave_of_silence",
      "faceless_void_chronosphere",
      "legion_commander_duel",
      "necrolyte_reapers_scythe",
      "puck_dream_coil",
      "pugna_decrepify",
      "razor_static_link",
      "silencer_curse_of_the_silent",
      "silencer_last_word",
      "slardar_amplify_damage",
      "viper_viper_strike",
      "warlock_fatal_bonds",
      "witch_doctor_maledict",
    ],
  },
  "offensive-dispel": {
    yes: [
      "dark_seer_surge",
      "ember_spirit_flame_guard",
      "grimstroke_spirit_walk",
      "lich_frost_shield",
      "magnataur_empower",
      "necrolyte_ghost_shroud",
      "ogre_magi_bloodlust",
      "sven_warcry",
      "treant_living_armor",
      "windrunner_windrun",
    ],
    no: [
      "abaddon_borrowed_time",
      "centaur_stampede",
      "clinkz_wind_walk",
      "dark_willow_shadow_realm",
      "dazzle_shallow_grave",
      "dragon_knight_elder_dragon_form",
      "juggernaut_blade_fury",
      "life_stealer_rage",
      "lina_flame_cloak",
      "lone_druid_true_form",
      "lycan_shapeshift",
      "muerta_pierce_the_veil",
      "omniknight_guardian_angel",
      "oracle_false_promise",
      "primal_beast_uproar",
      "slark_shadow_dance",
      "sven_gods_strength",
      "templar_assassin_refraction",
      "terrorblade_metamorphosis",
      "windrunner_focusfire",
      "winter_wyvern_cold_embrace",
    ],
  },
  "spell-block": {
    yes: [
      "death_prophet_carrion_swarm",
      "dragon_knight_breathe_fire",
      "jakiro_dual_breath",
      "lina_dragon_slave",
      "lion_impale",
      "magnataur_shockwave",
      "obsidian_destroyer_arcane_orb",
      "tiny_toss_tree",
      "troll_warlord_whirling_axes_ranged",
      "viper_poison_attack",
    ],
    no: [
      "bane_fiends_grip",
      "beastmaster_primal_roar",
      "doom_bringer_doom",
      "dragon_knight_dragon_tail",
      "huskar_life_break",
      "legion_commander_duel",
      "lich_frost_nova",
      "lina_laguna_blade",
      "lion_finger_of_death",
      "lion_voodoo",
      "necrolyte_reapers_scythe",
      "pudge_dismember",
      "razor_static_link",
      "shadow_shaman_shackles",
      "sniper_assassinate",
      "sven_storm_bolt",
      "terrorblade_sunder",
      "tiny_toss",
      "vengefulspirit_magic_missile",
      "viper_viper_strike",
      "winter_wyvern_winters_curse",
    ],
  },
};

const factIndexes = Object.fromEntries(
  Object.entries(auditedFacts).map(([family, facts]) => {
    const yes = new Set(facts.yes);
    const no = new Set(facts.no);
    const overlap = facts.yes.filter((key) => no.has(key));
    if (overlap.length) throw new Error(`${family} audit contains conflicting facts: ${overlap.join(", ")}.`);
    return [family, { yes, no }];
  }),
);

export function auditedCounterplayOutcome(family, abilityKey) {
  const facts = factIndexes[family];
  if (!facts) throw new Error(`No constant audit exists for Counterplay family ${family}.`);
  if (facts.yes.has(abilityKey)) return true;
  if (facts.no.has(abilityKey)) return false;
  throw new Error(`${family}:${abilityKey} has not been explicitly audited.`);
}

export const SPELL_REFLECTION_SCENARIOS = Object.freeze({
  "nether-swap": {
    prompt: "Swap sequence:",
    correctAnswer: "There and back",
    distractors: ["One swap", "Blocked", "No cast"],
    explanation: "There and back. Echo Shell reflects Nether Swap and the two swaps return both heroes to their start.",
  },
  doom: {
    prompt: "Doomed heroes:",
    correctAnswer: "Both",
    distractors: ["Target only", "Caster only", "Neither"],
    explanation:
      "Both heroes are Doomed. Echo Shell creates a second cast; it does not redirect or block the original.",
  },
  "lotus-linkens-order": {
    prompt: "Who gets Doom?",
    correctAnswer: "Doom caster",
    distractors: ["Protected hero", "Both heroes", "Neither"],
    explanation:
      "Doom caster only. Echo Shell creates the reflected Doom first; Linken's then blocks the original on the protected hero.",
  },
  "chaos-bolt-roll": {
    prompt: "Reflected roll:",
    correctAnswer: "New roll",
    distractors: ["Same roll", "Damage only", "No reflection"],
    explanation: "New roll. Chaos Bolt calculates fresh damage and stun values instead of copying the original roll.",
  },
  "fireblast-multicast": {
    prompt: "Reflected casts:",
    correctAnswer: "Every cast",
    distractors: ["First only", "Last only", "None"],
    explanation: "Every cast is reflected. Echo Shell re-casts each Fireblast instance generated by Multicast.",
  },
  "storm-hammer-mid-flight": {
    prompt: "On impact:",
    correctAnswer: "Still reflects",
    distractors: ["Too late", "Gets blocked", "Splash only"],
    explanation:
      "Still reflects. Targeted projectiles normally check Spell Reflection when they hit, not when launched.",
  },
  "charge-timing": {
    prompt: "Reflects:",
    correctAnswer: "On cast",
    distractors: ["On impact", "After Bash", "Never"],
    explanation: "On cast. Charge of Darkness reflects before impact, and its reflected cast does not Greater Bash.",
  },
  "freezing-field-frostbite": {
    prompt: "Frostbite reflections:",
    correctAnswer: "None",
    distractors: ["Every proc", "First only", "Last only"],
    explanation: "None. Lotus only reflects manually cast Frostbite, not Frostbite applied by upgraded Freezing Field.",
  },
  "fiends-grip-channel": {
    prompt: "Copy channeler:",
    correctAnswer: "Echo Shell target",
    distractors: ["Original Bane", "Lotus caster", "Nobody"],
    explanation: "Echo Shell target channels the reflected Fiend's Grip and must stand still to keep the copy going.",
  },
  "reflected-upgrades": {
    prompt: "Whose upgrades?",
    correctAnswer: "Original caster",
    distractors: ["Echo Shell target", "Lotus Orb owner", "Nobody"],
    explanation:
      "Original caster upgrades are retained by the reflected spell, including talents, facet, Scepter, and Shard.",
  },
});
