const ICONIC_OVERRIDES = new Set([
  "alchemist_chemical_rage",
  "dark_seer_wall_of_replica",
  "ember_spirit_fire_remnant",
  "invoker_alacrity",
  "phantom_assassin_coup_de_grace",
  "silencer_global_silence",
  "skeleton_king_reincarnation",
  "slark_essence_shift",
  "troll_warlord_battle_trance",
  "warlock_rain_of_chaos",
]);

const OBSCURE_OVERRIDES = new Set([
  "bane_nightmare_end",
  "batrider_smoldering_resin",
  "dazzle_innate_weave",
  "dazzle_nothl_projection",
  "earth_spirit_petrify",
  "faceless_void_distortion_field",
  "keeper_of_the_light_illuminate_end",
  "kez_falcon_rush",
  "kez_kazurai_katana",
  "kez_talon_toss",
  "leshrac_greater_lightning_storm",
  "marci_special_delivery",
  "mars_dauntless",
  "meepo_petrify",
  "muerta_supernatural",
  "nyx_assassin_unburrow",
  "oracle_diviners_deck",
  "phoenix_dying_light",
  "puck_ethereal_jaunt",
  "sniper_keen_scope",
  "vengefulspirit_retribution",
  "witch_doctor_gris_gris",
]);

export function spellDifficulty(abilityKey, ownerAbilityKeys) {
  if (ICONIC_OVERRIDES.has(abilityKey)) return 1;
  if (OBSCURE_OVERRIDES.has(abilityKey)) return 3;

  const slot = ownerAbilityKeys.indexOf(abilityKey);
  if (slot < 0) return 2;
  if (slot <= 2) return 1;
  if (slot <= 4) return 2;
  return 3;
}

function sharedRoles(left, right) {
  const rightRoles = new Set(right.roles ?? []);
  return (left.roles ?? []).filter((role) => rightRoles.has(role)).length;
}

function heroSimilarity(owner, candidate) {
  let score = sharedRoles(owner, candidate) * 3;
  if (owner.primary_attr === candidate.primary_attr) score += 5;
  if (owner.attack_type === candidate.attack_type) score += 3;
  if (Math.abs((owner.attack_range ?? 0) - (candidate.attack_range ?? 0)) <= 150) score += 1;
  return score;
}

export function spellDistractors(owner, heroes, difficulty, salt, hash) {
  const ranked = heroes
    .filter((hero) => hero.key !== owner.key)
    .map((hero) => ({
      hero,
      similarity: heroSimilarity(owner, hero),
      tieBreaker: hash(`${salt}:${hero.key}`),
    }))
    .sort((left, right) => right.similarity - left.similarity || left.tieBreaker - right.tieBreaker);

  const candidateCount = difficulty === 3 ? 18 : difficulty === 2 ? 42 : ranked.length;
  return ranked
    .slice(0, candidateCount)
    .sort((left, right) => hash(`${salt}:pick:${left.hero.key}`) - hash(`${salt}:pick:${right.hero.key}`))
    .slice(0, 3)
    .map(({ hero }) => hero);
}
