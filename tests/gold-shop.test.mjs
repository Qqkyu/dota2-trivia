import { describe, expect, it } from "vitest";
import { canBuyShopItem, goldShopState, roundNumberFromId } from "../src/lib/gold-shop.mjs";

const round = (number, correct, points = correct ? 150 : 0) => ({
  id: `dota2:public-arcade:round:${number}`,
  correct,
  points,
});

describe("gold shop", () => {
  it("reads round numbers from public and party round ids", () => {
    expect(roundNumberFromId("dota2:public-arcade:round:42")).toBe(42);
    expect(roundNumberFromId("party:ABC:round:7:1794000000000")).toBe(7);
    expect(roundNumberFromId("")).toBeNull();
  });

  it("spends gold without touching gold earned", () => {
    const state = goldShopState([round(1, true), round(2, true)], [{ item: "aegis", round: 3 }]);
    expect(state.earned).toBe(300);
    expect(state.balance).toBe(0);
  });

  it("pays the rune bet back double on a right answer", () => {
    const state = goldShopState([round(1, true, 250), round(2, true, 150)], [{ item: "rune", round: 2 }]);
    expect(state.balance).toBe(250 + 150 - 200 + 400);
    expect(state.runeSettled).toEqual({ roundId: round(2, true).id, won: true });
    expect(state.runeActive).toBe(false);
  });

  it("loses the bet on a wrong answer or no answer", () => {
    const state = goldShopState([round(1, true, 250), round(2, false)], [{ item: "rune", round: 2 }]);
    expect(state.balance).toBe(50);
    expect(state.runeSettled?.won).toBe(false);
  });

  it("settles the rune on the next round the player plays", () => {
    const pending = goldShopState([round(1, true, 250)], [{ item: "rune", round: 2 }]);
    expect(pending.runeActive).toBe(true);
    const later = goldShopState([round(1, true, 250), round(5, true)], [{ item: "rune", round: 2 }]);
    expect(later.runeSettled?.roundId).toBe(round(5, true).id);
  });

  it("keeps the streak through one miss with Aegis", () => {
    const records = [round(1, true), round(2, true), round(3, false), round(4, true), round(5, false)];
    expect(goldShopState(records, []).streak).toBe(0);
    const shielded = goldShopState(records.slice(0, 4), [{ item: "aegis", round: 3 }]);
    expect(shielded.streak).toBe(3);
    expect(shielded.aegisUsedOn).toBe(round(3, false).id);
    expect(goldShopState(records, [{ item: "aegis", round: 3 }]).streak).toBe(0);
  });

  it("does not cover rounds before it was bought", () => {
    const state = goldShopState([round(1, true), round(2, false)], [{ item: "aegis", round: 3 }]);
    expect(state.streak).toBe(0);
    expect(state.aegisReady).toBe(true);
  });

  it("sells one of each at a time and only with enough gold", () => {
    const rich = goldShopState([round(1, true, 500), round(2, true, 500)], []);
    expect(canBuyShopItem(rich, "aegis")).toBe(true);
    const holding = goldShopState(
      [round(1, true, 500), round(2, true, 500)],
      [
        { item: "aegis", round: 3 },
        { item: "rune", round: 3 },
      ],
    );
    expect(canBuyShopItem(holding, "aegis")).toBe(false);
    expect(canBuyShopItem(holding, "rune")).toBe(false);
    expect(canBuyShopItem(goldShopState([round(1, true, 150)], []), "rune")).toBe(false);
  });
});
