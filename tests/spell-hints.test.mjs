import { describe, expect, it } from "vitest";
import {
  buildSpellHint,
  containsAbilityLeak,
  containsAnswerLeak,
  containsFullNameLeak,
  trimToSentenceBudget,
} from "../scripts/spell-hints.mjs";

const full = { fullDescription: true };

describe("buildSpellHint", () => {
  it("redacts the hero and the ability name", () => {
    expect(buildSpellHint("Axe taunts enemies with Berserker's Call.", "Axe", "Berserker's Call", full)).toBe(
      "The caster taunts enemies with this ability.",
    );
  });

  it("redacts conjugated ability names instead of leaking clue two", () => {
    expect(buildSpellHint("Bane can attack Nightmared targets freely.", "Bane", "Nightmare", full)).toBe(
      "The caster can attack affected targets freely.",
    );
    expect(
      buildSpellHint("Reappears along with two additional doppelgangers.", "Phantom Lancer", "Doppelganger", full),
    ).toBe("Reappears along with two additional copies.");
    expect(containsAbilityLeak("the distance glimpsed", "Glimpse")).toBe(true);
    expect(containsAbilityLeak("Once burrowed, it stuns.", "Burrow")).toBe(true);
    expect(containsAbilityLeak("the distance affected", "Glimpse")).toBe(false);
  });

  it("does not eat the words before the ability name", () => {
    expect(
      buildSpellHint(
        "Taking damage while on the ground puts Tree Dance on cooldown.",
        "Monkey King",
        "Tree Dance",
        full,
      ),
    ).toBe("Taking damage while on the ground puts this ability on cooldown.");
    expect(buildSpellHint("Pugna places a Nether Ward at the target location.", "Pugna", "Nether Ward", full)).toBe(
      "The caster places this ability at the target location.",
    );
  });

  it("keeps whole sentences inside a 60-word budget", () => {
    const sentence = "This sentence has exactly nine words in it, honestly.";
    const description = Array.from({ length: 10 }, () => sentence).join(" ");
    const hint = buildSpellHint(description, "Lich", "Ice Spire", full);
    expect(hint.split(/\s+/).length).toBeLessThanOrEqual(60);
    expect(hint.endsWith(".")).toBe(true);
    expect(trimToSentenceBudget("One two three. Four five six.", 4)).toBe("One two three.");
    expect(trimToSentenceBudget("One two three four five.", 2)).toBe("One two three four five.");
  });

  it("falls back to the generic clue when the hero cannot be hidden", () => {
    expect(buildSpellHint("", "Axe", "Culling Blade", full)).toMatch(/No additional mechanical clue/);
  });
});

describe("leak detectors", () => {
  it("match hero words and full names", () => {
    expect(containsAnswerLeak("Skywrath Mage casts it", "Skywrath Mage")).toBe(true);
    expect(containsAnswerLeak("deals damage", "Skywrath Mage")).toBe(false);
    expect(containsFullNameLeak("Tree Dance puts him up a tree", "Tree Dance")).toBe(true);
    expect(containsFullNameLeak("dances in trees", "Tree Dance")).toBe(false);
  });
});
