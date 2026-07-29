// These are real ability records, but their tiny internal cooldowns describe
// helper controls rather than useful Dota knowledge.
export const NON_TRIVIA_COOLDOWN_KEYS = Object.freeze([
  "ancient_apparition_ice_blast_release",
  "primal_beast_onslaught_release",
  "templar_assassin_trap",
]);

// The source description is effectively the answer itself when all four
// choices belong to the same hero.
export const NON_TRIVIA_DETECTIVE_KEYS = Object.freeze(["nyx_assassin_unburrow"]);

// These official icons show the owning hero so directly that Spell Link stops
// being an ability-recognition question.
export const NON_TRIVIA_SPELL_OWNER_KEYS = Object.freeze([
  "alchemist_chemical_rage",
  "enchantress_enchant",
  "meepo_megameepo",
  "phantom_assassin_blur",
  "slardar_sprint",
  "troll_warlord_battle_trance",
  "vengefulspirit_retribution",
]);
