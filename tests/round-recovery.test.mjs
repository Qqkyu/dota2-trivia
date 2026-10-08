import { describe, expect, it } from "vitest";
import { recoveryRoundNumbers, RECOVERY_PARAM_MAX } from "../src/lib/round-recovery.mjs";

describe("round recovery identifiers", () => {
  const room = `dota2:${"version".repeat(23)}:private:TEST`;
  const id = (number, startedAt = 1_000) => `${room}:round:${number}:${startedAt}`;

  it("accepts all 24 real-length private round IDs", () => {
    const numbers = Array.from({ length: 24 }, (_, index) => index);
    expect(id(0).length).toBeGreaterThan(180);
    expect(recoveryRoundNumbers(numbers.map((number) => id(number)).join(","), room, 30, 1_000)).toEqual(numbers);
  });

  it("ignores oversized metadata and preserves valid IDs beside malformed ones", () => {
    expect(recoveryRoundNumbers("x".repeat(RECOVERY_PARAM_MAX + 1), room, 30, 1_000)).toEqual([]);
    expect(recoveryRoundNumbers(`bad,${id(1)},${"x".repeat(513)},${id(2)}`, room, 30, 1_000)).toEqual([1, 2]);
  });

  it("rejects other rooms, earlier parties, future rounds and alternate number encodings", () => {
    const rejected = [
      id(30),
      id(31),
      id(-1),
      id("01"),
      id("1e0"),
      id("9007199254740992"),
      id(1, 999),
      id(1).replace("TEST", "OTHER"),
      `${id(1)}:extra`,
    ];
    expect(recoveryRoundNumbers(rejected.join(","), room, 30, 1_000)).toEqual([]);
    expect(recoveryRoundNumbers("dota2:public:round:12,dota2:public:round:13", "dota2:public", 13)).toEqual([12]);
  });
});
