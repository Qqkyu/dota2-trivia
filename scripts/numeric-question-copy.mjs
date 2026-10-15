export const NUMERIC_SOURCE_LABEL = "Valve Dota 2 public data";

const HIDDEN_ABILITY_IDS = Object.freeze({
  centaur_mount: 980,
  naga_siren_reel_in: 1008,
  nevermore_shadowraze3: 5061,
  spectre_reality: 5338,
  monkey_king_primal_spring: 5724,
  visage_stone_form_self_cast: 7116,
});

export function possessiveName(name) {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

export function numericDetail(kind, key = "", names = []) {
  if (kind === "cooldown") {
    return key === "invoker_invoke"
      ? "Use the base cooldown, before reductions from orb levels or other modifiers."
      : "Use the listed cooldown, before talents, facets, upgrades, reductions, or resets.";
  }
  if (kind === "mana-cost") {
    return "Use the listed mana cost, before talents, facets, upgrades, or other modifiers.";
  }
  if (kind === "ability-damage") {
    return "Use damage to enemy heroes, before talents, facets, added upgrade effects, amplification, or resistance.";
  }
  if (kind === "hero-move-speed" || kind === "hero-stat-duel") {
    return "Use base stats in the default form, without items, talents, facets, or ability effects.";
  }
  if (kind === "item-cost" || kind === "item-price-duel") {
    return `Use the total shop price, including recipes and components.${key === "dagon" || names.includes("Dagon") ? " Dagon means level 1." : ""}`;
  }
  throw new Error(`No numeric conditions defined for ${kind}.`);
}

function reference(kind, id, label) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
    throw new Error(`Missing Valve ${kind} ID for ${label}.`);
  }
  return {
    label,
    url: `https://www.dota2.com/datafeed/${kind}data?language=english&${kind}_id=${id}`,
  };
}

export function combineNumericSources(sources) {
  const references = [
    ...new Map(sources.flatMap((source) => source.references ?? [source]).map((ref) => [ref.url, ref])).values(),
  ];
  if (!references.length) throw new Error("A numeric question needs a primary source.");
  return { label: NUMERIC_SOURCE_LABEL, url: references[0].url, references };
}

export function heroNumericSource(...heroes) {
  return combineNumericSources(heroes.map((hero) => reference("hero", hero.id, hero.localized_name ?? hero.name_loc)));
}

export function abilityNumericSource(ability) {
  const hiddenId = HIDDEN_ABILITY_IDS[ability.key];
  return hiddenId
    ? combineNumericSources([reference("ability", hiddenId, ability.dname)])
    : heroNumericSource(ability.owner);
}

export function itemNumericSource(...items) {
  return combineNumericSources(items.map((item) => reference("item", item.id, item.dname ?? item.name_loc)));
}

export const ORDER_DETAILS = Object.freeze({
  "item-price": "Use total shop prices, including recipes and components.",
  "ability-cooldown":
    "Use listed cooldowns, before talents, facets, upgrades, reductions, or resets. Use each card's condition.",
  "ability-mana": "Use listed mana costs, before talents, facets, upgrades, or other modifiers.",
  "ability-damage":
    "Use damage to enemy heroes, before talents, facets, added upgrade effects, amplification, or resistance. Use each card's condition.",
  "hero-move-speed": "Use base stats in the default form, without items, talents, facets, or ability effects.",
  "hero-attack-range": "Use base stats in the default form, without items, talents, facets, or ability effects.",
});
