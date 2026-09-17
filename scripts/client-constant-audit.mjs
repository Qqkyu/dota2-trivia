// OpenDota is useful for localized names and CDN artwork, but its constants can
// lag behind the shipped game client. These are the differences found while
// comparing generated numeric/recipe questions with Valve's 7.41f patch feed
// and the prior 7.41e live-client audit. Keep the overrides explicit and fail
// closed in the generator.
export const CLIENT_CONSTANT_AUDIT = Object.freeze({
  patch: "7.41f",
  clientBuild: "6882",
  steamBuildId: "24503204",
  clientVersionDate: "2026-07-31",
  reviewedAt: "2026-09-17",
  patchFeed: "7.41f",
  patchTimestamp: 1_789_455_600,
});

export const ABILITY_CONSTANT_OVERRIDES = Object.freeze({
  ancient_apparition_chilling_touch: {
    attributes: { damage: [35, 65, 95, 125] },
  },
  antimage_blink: {
    mana: [60, 55, 50, 45],
  },
  drow_ranger_multishot: {
    mana: [70, 85, 100, 115],
    attributes: {
      arrow_damage_pct: [80, 100, 120, 140],
      arrow_range_multiplier: [1],
    },
  },
  gyrocopter_call_down: {
    cooldown: [75, 65, 55],
  },
  gyrocopter_homing_missile: {
    mana: [120],
    cooldown: [26, 21, 16, 11],
  },
  gyrocopter_rocket_barrage: {
    mana: [75],
  },
  broodmother_insatiable_hunger: {
    mana: [70],
  },
  rattletrap_power_cogs: {
    mana: [60, 65, 70, 90],
  },
  undying_decay: {
    mana: [110],
  },
  life_stealer_rage: {
    cooldown: [21, 20, 19, 18],
  },
  invoker_cold_snap: {
    cooldown: [19],
  },
  winter_wyvern_arctic_burn: {
    cooldown: [29, 26, 23, 20],
  },
  hoodwink_hunters_boomerang: {
    cooldown: [20],
  },
  hoodwink_sharpshooter: {
    mana: [150, 200, 250],
  },
  keeper_of_the_light_chakra_magic: {
    cooldown: [20, 17, 14, 11],
  },
  largo_song_double_time: {
    mana: [25, 35, 45],
  },
  lina_laguna_blade: {
    attributes: { damage: [400, 580, 760] },
  },
  morphling_replicate: {
    cooldown: [125, 90, 55],
  },
  obsidian_destroyer_objurgation: {
    mana: [175],
    cooldown: [36, 33, 30, 27],
  },
  omniknight_hammer_of_purity: {
    description:
      "The caster imbues his hammer with holy power, causing his attack to have increased range, deal pure damage based on a percentage of his base damage, and slow his target. The caster heals for 40% of the damage dealt over 4 seconds.",
    attributes: {
      heal_pct: [40],
      heal_duration: [4],
    },
  },
  phoenix_dying_light: {
    description:
      "The caster deals 3.5% of its missing health as magic damage to all enemies in a 400 radius every second.",
  },
  puck_illusory_orb: {
    cooldown: [12, 11, 10, 9],
  },
  queenofpain_shadow_strike: {
    mana: [100, 105, 110, 115],
  },
  shadow_demon_shadow_poison: {
    mana: [40],
  },
  shadow_shaman_urnaconda: {
    mana: [140],
  },
  snapfire_firesnap_cookie: {
    attributes: { impact_damage: [60, 130, 200, 270] },
  },
  snapfire_mortimer_kisses: {
    attributes: { damage_per_impact: [170, 250, 330] },
  },
  shredder_timber_chain: {
    attributes: { damage: [45, 105, 165, 225] },
  },
  techies_land_mines: {
    attributes: { damage: [400, 550, 700] },
  },
  treant_living_armor: {
    mana: [80],
  },
  zuus_thundergods_wrath: {
    attributes: { damage: [275, 425, 575] },
  },
});

export const HERO_CONSTANT_OVERRIDES = Object.freeze({
  npc_dota_hero_alchemist: { move_speed: 290 },
  npc_dota_hero_antimage: { move_speed: 315 },
  npc_dota_hero_axe: { base_agi: 18 },
  npc_dota_hero_batrider: { move_speed: 310 },
  npc_dota_hero_death_prophet: { agi_gain: 2.3 },
  npc_dota_hero_disruptor: { move_speed: 300 },
  npc_dota_hero_doom_bringer: { attack_range: 175, int_gain: 2.1 },
  npc_dota_hero_earth_spirit: { base_int: 17 },
  npc_dota_hero_ember_spirit: { base_str: 21, move_speed: 295 },
  npc_dota_hero_invoker: { move_speed: 280 },
  npc_dota_hero_jakiro: { int_gain: 3.3 },
  npc_dota_hero_juggernaut: { move_speed: 305 },
  npc_dota_hero_keeper_of_the_light: { move_speed: 310 },
  npc_dota_hero_legion_commander: { base_str: 25, str_gain: 3, base_attack_time: 105 },
  npc_dota_hero_lina: { base_agi: 21 },
  npc_dota_hero_mars: { int_gain: 2.4 },
  npc_dota_hero_meepo: { move_speed: 310 },
  npc_dota_hero_nevermore: { base_int: 16 },
  npc_dota_hero_phoenix: { attack_range: 500 },
  npc_dota_hero_pugna: { base_int: 27 },
  npc_dota_hero_skeleton_king: { attack_rate: 1.8 },
  npc_dota_hero_templar_assassin: { move_speed: 315 },
  npc_dota_hero_tiny: { base_health_regen: 1 },
  npc_dota_hero_treant: { base_attack_time: 90 },
  npc_dota_hero_troll_warlord: { base_agi: 24 },
  npc_dota_hero_undying: { move_speed: 295 },
});

export const ITEM_CONSTANT_OVERRIDES = Object.freeze({
  chasm_stone: { cost: 900 },
  dagon: { cost: 3000 },
  greater_crit: { cost: 5200 },
  dragon_lance: { cost: 2000 },
  heart: { cost: 5300 },
  heavens_halberd: { cost: 3300 },
  hurricane_pike: { cost: 4550 },
  octarine_core: { cost: 5100 },
});

export function applyAbilityConstantAudit(ability) {
  const override = ABILITY_CONSTANT_OVERRIDES[ability.key];
  if (!override) return ability;

  const auditedAttributes = override.attributes ?? {};
  const foundAttributes = new Set();
  const attrib = (ability.attrib ?? []).map((attribute) => {
    if (!(attribute.key in auditedAttributes)) return attribute;
    foundAttributes.add(attribute.key);
    return { ...attribute, value: auditedAttributes[attribute.key] };
  });

  for (const key of Object.keys(auditedAttributes)) {
    if (!foundAttributes.has(key)) {
      throw new Error(`Client-audited attribute ${ability.key}.${key} is missing from OpenDota's ability shape.`);
    }
  }

  return {
    ...ability,
    ...(override.mana ? { mc: override.mana } : {}),
    ...(override.cooldown ? { cd: override.cooldown } : {}),
    ...(override.description ? { desc: override.description } : {}),
    attrib,
  };
}

export function applyHeroConstantAudit(hero) {
  return { ...hero, ...(HERO_CONSTANT_OVERRIDES[hero.key] ?? {}) };
}

export function applyItemConstantAudit(item) {
  return { ...item, ...(ITEM_CONSTANT_OVERRIDES[item.key] ?? {}) };
}
