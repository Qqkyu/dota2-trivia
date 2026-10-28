import { describe, expect, it } from "vitest";
import { elementClipVolume, roundClipVolume } from "../src/lib/round-clip-volume.mjs";

describe("roundClipVolume", () => {
  it("multiplies the game volume by the clip gain and clamps", () => {
    expect(roundClipVolume(0.7, 0.266)).toBeCloseTo(0.1862, 4);
    expect(roundClipVolume(0.7, 1)).toBe(0.7);
    expect(roundClipVolume(1, 1.5)).toBe(1);
  });

  it("ignores a missing or broken gain", () => {
    expect(roundClipVolume(0.7, undefined)).toBe(0.7);
    expect(roundClipVolume(0.7, "nope")).toBe(0.7);
    expect(roundClipVolume(0.7, 0)).toBe(0.7);
    expect(elementClipVolume(0.7, { dataset: { gain: "0.5" } })).toBeCloseTo(0.35, 4);
    expect(elementClipVolume(0.7, {})).toBe(0.7);
  });
});
