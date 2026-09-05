import { describe, expect, it } from "vitest";
import { applyAbilityTextOverrides, loadAbilityTextOverrides } from "../scripts/ability-text-overrides.mjs";
import { buildSpellHint } from "../scripts/spell-hints.mjs";

function titleCase(slug) {
  return slug
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

describe("ability text overrides", () => {
  it("fill only blank upstream descriptions and report stale or unknown keys", () => {
    const abilitiesByKey = {
      muerta_dead_shot: { dname: "Dead Shot", desc: "" },
      muerta_the_calling: { dname: "The Calling" },
      sniper_headshot: { dname: "Headshot", desc: "Sniper increases his accuracy." },
    };
    const result = applyAbilityTextOverrides(abilitiesByKey, {
      $comment: "ignored",
      muerta_dead_shot: " Fires a bullet. ",
      muerta_the_calling: "Summons revenants.",
      sniper_headshot: "Should not replace real text.",
      not_a_real_ability: "Nothing to attach to.",
    });
    expect(result).toEqual({
      filled: ["muerta_dead_shot", "muerta_the_calling"],
      stale: ["sniper_headshot"],
      unknown: ["not_a_real_ability"],
    });
    expect(abilitiesByKey.muerta_dead_shot.desc).toBe("Fires a bullet.");
    expect(abilitiesByKey.muerta_the_calling.desc).toBe("Summons revenants.");
    expect(abilitiesByKey.sniper_headshot.desc).toBe("Sniper increases his accuracy.");
  });

  it("ship overrides that turn into usable, leak-free Spell Link clues", async () => {
    const overrides = await loadAbilityTextOverrides();
    const keys = Object.keys(overrides).filter((key) => !key.startsWith("$"));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).toMatch(/^[a-z0-9_]+$/);
      const [ownerSlug, ...abilitySlug] = key.split("_");
      const owner = titleCase(ownerSlug);
      const abilityName = titleCase(abilitySlug.join("_"));
      const hint = buildSpellHint(overrides[key], owner, abilityName, { fullDescription: true });
      expect(hint.length).toBeGreaterThanOrEqual(18);
      expect(hint.startsWith("No additional mechanical clue")).toBe(false);
      expect(hint.toLowerCase()).not.toContain(owner.toLowerCase());
      expect(hint.split(/\s+/).length).toBeLessThanOrEqual(60);
      expect(/\d/.test(overrides[key])).toBe(false);
    }
  });
});
