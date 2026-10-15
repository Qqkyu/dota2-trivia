// `DAMAGE:` is only a display header in Valve/OpenDota data. It can mean
// direct damage, DPS, bonus attack damage, a percentage, or damage from one
// part of a multi-part spell. Keep this list explicit so a new tooltip field
// can never silently become a misleading trivia question.
export const DAMAGE_QUESTION_FACTS = Object.freeze({
  ancient_apparition_chilling_touch: {
    attributeKey: "damage",
    measure: "bonus damage per attack",
    note: "This is the magical bonus on the empowered attack.",
  },
  axe_culling_blade: {
    attributeKey: "damage",
    measure: "damage",
    note: "Culling Blade deals this amount as pure damage.",
  },
  bane_enfeeble: {
    attributeKey: "enfeeble_tick_damage",
    measure: "damage per second",
    note: "Enfeeble applies this amount every second.",
  },
  bane_fiends_grip: {
    attributeKey: "fiend_grip_damage",
    measure: "damage per second",
    note: "Fiend's Grip applies this amount each second while channeling.",
  },
  brewmaster_thunder_clap: {
    attributeKey: "damage",
    measure: "damage",
  },
  dark_seer_vacuum: {
    attributeKey: "damage",
    measure: "damage",
  },
  dazzle_shadow_wave: {
    attributeKey: "damage",
    measure: "damage per healing pulse",
    note: "Each healed unit creates one damaging pulse around itself.",
  },
  death_prophet_carrion_swarm: {
    attributeKey: "damage",
    measure: "damage",
  },
  dragon_knight_breathe_fire: {
    attributeKey: "damage",
    measure: "damage",
  },
  dragon_knight_dragon_tail: {
    attributeKey: "damage",
    measure: "damage",
  },
  earth_spirit_boulder_smash: {
    attributeKey: "rock_damage",
    measure: "damage",
  },
  earth_spirit_rolling_boulder: {
    attributeKey: "damage",
    measure: "base damage",
    orderCondition: "no Strength bonus",
    note: "Rolling Boulder also adds 100% of Earth Spirit's Strength.",
  },
  furion_sprout: {
    attributeKey: "sprout_damage",
    measure: "damage",
  },
  kez_talon_toss: {
    attributeKey: "damage",
    measure: "damage",
  },
  kunkka_torrent: {
    attributeKey: "torrent_damage",
    measure: "damage",
  },
  lina_laguna_blade: {
    attributeKey: "damage",
    measure: "damage",
  },
  lion_finger_of_death: {
    attributeKey: "damage",
    measure: "base damage",
    orderCondition: "no kill stacks",
    note: "Permanent kill stacks and upgrades add damage on top.",
  },
  magnataur_reverse_polarity: {
    attributeKey: "polarity_damage",
    measure: "damage",
  },
  magnataur_skewer: {
    attributeKey: "skewer_damage",
    measure: "base damage",
    orderCondition: "no distance bonus",
    note: "Skewer adds more damage based on distance traveled.",
  },
  mars_spear: {
    attributeKey: "damage",
    measure: "damage",
  },
  mirana_starfall: {
    attributeKey: "damage",
    measure: "primary-meteor damage",
    note: "Without facet bonuses, the secondary meteor deals 80% of this amount.",
  },
  monkey_king_primal_spring: {
    attributeKey: "impact_damage",
    measure: "full-channel damage",
    note: "A shorter channel deals proportionally less damage.",
  },
  muerta_dead_shot: {
    attributeKey: "damage",
    measure: "damage",
  },
  obsidian_destroyer_astral_imprisonment: {
    attributeKey: "damage",
    measure: "damage",
  },
  pudge_meat_hook: {
    attributeKey: "damage",
    measure: "damage",
  },
  queenofpain_scream_of_pain: {
    attributeKey: "damage",
    measure: "damage",
  },
  razor_eye_of_the_storm: {
    attributeKey: "damage",
    measure: "damage per strike",
    note: "Each Eye of the Storm strike deals this amount.",
  },
  rubick_fade_bolt: {
    attributeKey: "damage",
    measure: "first-target damage",
    note: "Each later bounce deals less damage.",
  },
  shadow_shaman_ether_shock: {
    attributeKey: "damage",
    measure: "damage",
  },
  shredder_timber_chain: {
    attributeKey: "damage",
    measure: "damage",
  },
  silencer_curse_of_the_silent: {
    attributeKey: "damage",
    measure: "damage per second",
    note: "Arcane Curse applies this amount each second.",
  },
  skywrath_mage_mystic_flare: {
    attributeKey: "damage",
    measure: "total damage",
    note: "The total is distributed across enemy heroes in the area over 2 seconds.",
  },
  slark_dark_pact: {
    attributeKey: "total_damage",
    measure: "total damage",
    note: "Dark Pact deals the total across its rapid pulses.",
  },
  snapfire_scatterblast: {
    attributeKey: "damage",
    measure: "base damage",
    orderCondition: "outside point-blank range",
    note: "Point-blank targets take 25% more damage.",
  },
  sniper_assassinate: {
    attributeKey: "damage",
    measure: "bonus damage",
    note: "Assassinate also deals Sniper's attack damage.",
  },
  sniper_shrapnel: {
    attributeKey: "shrapnel_damage",
    measure: "damage per second",
    note: "Shrapnel applies this amount each second in its area.",
  },
  storm_spirit_overload: {
    attributeKey: "overload_damage",
    measure: "burst damage",
    note: "The burst is released around Storm Spirit's next attack.",
  },
  techies_land_mines: {
    attributeKey: "damage",
    measure: "inner-radius damage",
    note: "Damage falls to 50% at the edge of the mine's area.",
  },
  terrorblade_terror_wave: {
    attributeKey: "damage",
    measure: "damage",
  },
  tidehunter_gush: {
    attributeKey: "gush_damage",
    measure: "damage",
  },
  tinker_march_of_the_machines: {
    attributeKey: "damage",
    measure: "damage per machine",
    note: "Each machine that connects deals this amount.",
  },
  tiny_toss: {
    attributeKey: "toss_damage",
    measure: "landing damage",
  },
  vengefulspirit_magic_missile: {
    attributeKey: "magic_missile_damage",
    measure: "damage",
  },
  visage_stone_form_self_cast: {
    attributeKey: "stun_damage",
    measure: "stun damage",
  },
  windrunner_powershot: {
    attributeKey: "powershot_damage",
    measure: "full-charge first-target damage",
    note: "A shorter channel or an earlier hit deals less damage.",
  },
  zuus_static_field: {
    attributeKey: "damage_health_pct",
    measure: "current-health damage",
    suffix: "%",
    optionStep: 0.5,
    note: "Static Field removes this percentage of the target's current health.",
  },
  zuus_thundergods_wrath: {
    attributeKey: "damage",
    measure: "damage",
  },
});

const ORDER_DAMAGE_MEASURES = new Set(["damage", "base damage", "damage per healing pulse", "primary-meteor damage"]);

export function damageOrderMeasurement(abilityKey) {
  const fact = DAMAGE_QUESTION_FACTS[abilityKey];
  if (!fact || !ORDER_DAMAGE_MEASURES.has(fact.measure)) return null;
  return `${fact.measure}${fact.orderCondition ? `; ${fact.orderCondition}` : ""}`;
}

function possessiveAbilityName(abilityName) {
  return /s$/i.test(abilityName) ? `${abilityName}'` : `${abilityName}'s`;
}

const DAMAGE_QUESTION_BUILDERS = Object.freeze({
  "base damage": (abilityName) => `how much base damage does ${abilityName} deal`,
  "bonus damage": (abilityName) => `how much bonus damage does ${abilityName} deal`,
  "bonus damage per attack": (abilityName) => `what is ${possessiveAbilityName(abilityName)} bonus attack damage`,
  "burst damage": (abilityName) => `how much burst damage does ${abilityName} deal`,
  "current-health damage": (abilityName) => `what percentage of current health does ${abilityName} remove`,
  damage: (abilityName) => `how much damage does ${abilityName} deal`,
  "damage per healing pulse": (abilityName) => `how much damage does each ${abilityName} pulse deal`,
  "damage per machine": (abilityName) => `what is ${possessiveAbilityName(abilityName)} damage per machine`,
  "primary-meteor damage": (abilityName) => `what is ${possessiveAbilityName(abilityName)} primary-meteor damage`,
  "damage per second": (abilityName) => `how much damage per second does ${abilityName} deal`,
  "damage per strike": (abilityName) => `what is ${possessiveAbilityName(abilityName)} damage per strike`,
  "first-target damage": (abilityName) => `what is ${possessiveAbilityName(abilityName)} first-target damage`,
  "full-channel damage": (abilityName) => `what is ${possessiveAbilityName(abilityName)} full-channel damage`,
  "full-charge first-target damage": (abilityName) =>
    `what is ${possessiveAbilityName(abilityName)} full-charge first-target damage`,
  "inner-radius damage": (abilityName) => `how much inner-radius damage does ${abilityName} deal`,
  "landing damage": (abilityName) => `how much landing damage does ${abilityName} deal`,
  "stun damage": (abilityName) => `how much stun damage does ${abilityName} deal`,
  "total damage": (abilityName) => `how much total damage does ${abilityName} deal`,
});

export function damageQuestionPrompt(abilityName, fact, hasLevels) {
  const buildQuestion = DAMAGE_QUESTION_BUILDERS[fact.measure];
  if (!buildQuestion) throw new Error(`Missing full-sentence damage prompt for ${fact.measure}.`);

  const body = buildQuestion(abilityName);
  return `${body[0].toUpperCase()}${body.slice(1)}${hasLevels ? " at max level" : ""}?`;
}

export function damageQuestionExplanation(abilityName, fact, values) {
  const suffix = fact.suffix ?? "";
  const valueText = values.map((value) => `${formatDamageNumber(value)}${suffix}`).join(" / ");
  const levelText = values.length > 1 ? " across its levels" : "";
  const note = fact.note ? ` ${fact.note}` : "";

  return `${abilityName}, ${fact.measure}: ${valueText}${levelText}, before talents, facets, and added upgrade effects.${note}`;
}

function formatDamageNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}
