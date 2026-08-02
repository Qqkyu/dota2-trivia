const ATTRIBUTE_LABELS = Object.freeze({
  DOTA_ATTRIBUTE_STRENGTH: "Strength",
  DOTA_ATTRIBUTE_AGILITY: "Agility",
  DOTA_ATTRIBUTE_INTELLECT: "Intelligence",
  DOTA_ATTRIBUTE_ALL: "Universal",
});

function enabledHeroDefinitions(definitions) {
  return Object.entries(definitions)
    .filter(([key, definition]) => key !== "npc_dota_hero_base" && definition?.Enabled === "1")
    .map(([, definition]) => definition);
}

function roleCandidates(definition, roster) {
  const roles = String(definition.Role ?? "")
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);
  const matchingAttackType = roster.filter(
    (candidate) =>
      candidate.AttributePrimary === definition.AttributePrimary &&
      candidate.AttackCapabilities === definition.AttackCapabilities,
  );

  return roles.map((role) => ({
    role,
    count: matchingAttackType.filter((candidate) =>
      String(candidate.Role ?? "")
        .split(",")
        .includes(role),
    ).length,
  }));
}

/**
 * Quote Hunt starts with all 127 heroes, so these clues deliberately narrow in
 * two broad steps. The final role is selected for a useful candidate pool,
 * avoiding a one-hero giveaway whenever the live roster offers an alternative.
 */
export function buildHeroQuoteHints(heroKey, definitions) {
  const definition = definitions?.[heroKey];
  const attribute = ATTRIBUTE_LABELS[definition?.AttributePrimary];
  const attackType = definition?.AttackCapabilities?.includes("RANGED") ? "Ranged" : "Melee";
  const roster = enabledHeroDefinitions(definitions ?? {});
  const roles = roleCandidates(definition ?? {}, roster);
  const nonGiveawayRoles = roles.filter(({ count }) => count >= 4);
  const candidateRoles = nonGiveawayRoles.length ? nonGiveawayRoles : roles;
  const selectedRole = [...candidateRoles].sort(
    (left, right) => Math.abs(left.count - 8) - Math.abs(right.count - 8) || right.count - left.count,
  )[0]?.role;

  if (!attribute || !selectedRole || !["Melee", "Ranged"].includes(attackType)) {
    throw new Error(`${heroKey}: live-client identity metadata is incomplete.`);
  }

  return [`${attribute} hero`, `${attackType} · ${selectedRole}`];
}
