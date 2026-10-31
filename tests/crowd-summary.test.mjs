import { describe, expect, it } from "vitest";
import { crowdSummaryLine } from "../src/lib/crowd-summary.mjs";

describe("crowdSummaryLine", () => {
  it("uses the same shape for a room of one as for a full room", () => {
    expect(crowdSummaryLine({ total: 1, rightCount: 1 })).toBe("1 answered · 100% got it right");
    expect(crowdSummaryLine({ total: 2, rightCount: 0 })).toBe("2 answered · 0% got it right");
    expect(crowdSummaryLine({ total: 1200, rightCount: 900, majorityIsRight: true })).toBe(
      "1,200 answered · 75% got it right",
    );
  });

  it("names the wrong majority", () => {
    expect(crowdSummaryLine({ total: 41, rightCount: 13, majorityLabel: "1,775 gold", majorityIsRight: false })).toBe(
      "41 answered · 32% got it right · most picked 1,775 gold",
    );
  });

  it("states an empty round plainly", () => {
    expect(crowdSummaryLine({ total: 0, rightCount: 0 })).toBe("No answers locked this round.");
  });
});
