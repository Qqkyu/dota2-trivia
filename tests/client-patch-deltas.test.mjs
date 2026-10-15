import { describe, expect, it } from "vitest";
import { applyClientPatchDeltas } from "../scripts/client-patch-deltas.mjs";

describe("independent client patch comparisons", () => {
  const change = {
    catalog: "abilities",
    key: "broodmother_insatiable_hunger",
    field: "AbilityManaCost",
    before: [80],
    after: [70],
  };
  it("compares a published change against its expected base before applying it", () => {
    const abilities = { broodmother_insatiable_hunger: { AbilityManaCost: "80" } };
    expect(applyClientPatchDeltas({ abilities }, { changes: [change] })).toBe(1);
    expect(abilities.broodmother_insatiable_hunger.AbilityManaCost).toBe("70");
  });
  it("fails if the installed client is not the reviewed base", () => {
    const abilities = { broodmother_insatiable_hunger: { AbilityManaCost: "75" } };
    expect(() => applyClientPatchDeltas({ abilities }, { changes: [change] })).toThrow("base mismatch");
  });
});
