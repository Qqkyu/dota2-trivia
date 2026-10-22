import { describe, expect, it } from "vitest";
import { crowdSummaryLine } from "../src/lib/crowd-summary.mjs";

describe("crowdSummaryLine", () => {
  it("names an empty room plainly", () => {
    expect(crowdSummaryLine({ total: 0, rightCount: 0, playerAnswered: false })).toBe(
      "Nobody in the room answered before the deadline.",
    );
  });

  it("tells a lone player they were alone", () => {
    expect(crowdSummaryLine({ total: 1, rightCount: 1, playerAnswered: true })).toBe(
      "You were the only one who answered this round.",
    );
    expect(crowdSummaryLine({ total: 1, rightCount: 0, playerAnswered: false })).toBe(
      "One player answered this round.",
    );
  });

  it("reports the share and the wrong majority", () => {
    expect(
      crowdSummaryLine({
        total: 41,
        rightCount: 13,
        playerAnswered: true,
        majorityLabel: "1,775 gold",
        majorityIsRight: false,
      }),
    ).toBe("41 answered · 32% got it right · most picked 1,775 gold");
    expect(crowdSummaryLine({ total: 1200, rightCount: 900, playerAnswered: true, majorityIsRight: true })).toBe(
      "1,200 answered · 75% got it right",
    );
  });
});
