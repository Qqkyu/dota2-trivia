// OpenDota is useful for localized names and CDN artwork, but its constants can
// lag behind the shipped game client. These are the differences found while
// comparing every generated numeric/recipe question with a clean Dota 2 7.41d
// client. Keep the overrides explicit and fail closed in the generator.
export const CLIENT_CONSTANT_AUDIT = Object.freeze({
  patch: "7.41d",
  clientBuild: "6872",
  steamBuildId: "24442265",
  clientVersionDate: "2026-07-28",
  reviewedAt: "2026-07-29",
});

export const ABILITY_CONSTANT_OVERRIDES = Object.freeze({
  ancient_apparition_chilling_touch: {
    attributes: { damage: [35, 65, 95, 125] },
  },
  antimage_blink: {
    mana: [60, 55, 50, 45],
  },
  gyrocopter_call_down: {
    cooldown: [75, 65, 55],
  },
  largo_song_double_time: {
    mana: [25, 35, 45],
  },
  lina_laguna_blade: {
    attributes: { damage: [400, 580, 760] },
  },
  phoenix_dying_light: {
    description:
      "The caster deals 3.5% of its missing health as magic damage to all enemies in a 400 radius every second.",
  },
  shadow_demon_shadow_poison: {
    mana: [40],
  },
  shadow_shaman_urnaconda: {
    mana: [140],
  },
  shredder_timber_chain: {
    attributes: { damage: [45, 105, 165, 225] },
  },
  techies_land_mines: {
    attributes: { damage: [400, 550, 700] },
  },
});

export const HERO_CONSTANT_OVERRIDES = Object.freeze({
  npc_dota_hero_alchemist: { move_speed: 290 },
  npc_dota_hero_antimage: { move_speed: 315 },
  npc_dota_hero_batrider: { move_speed: 310 },
  npc_dota_hero_disruptor: { move_speed: 300 },
  npc_dota_hero_invoker: { move_speed: 280 },
  npc_dota_hero_juggernaut: { move_speed: 305 },
  npc_dota_hero_keeper_of_the_light: { move_speed: 310 },
  npc_dota_hero_meepo: { move_speed: 310 },
  npc_dota_hero_phoenix: { attack_range: 500 },
  npc_dota_hero_skeleton_king: { attack_rate: 1.8 },
  npc_dota_hero_templar_assassin: { move_speed: 315 },
});

export const ITEM_CONSTANT_OVERRIDES = Object.freeze({
  dagon: { cost: 3000 },
  heart: { cost: 5200 },
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
