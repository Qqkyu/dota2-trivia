import loudness from "../data/audio-loudness.json" with { type: "json" };

/**
 * Gain that brings a round clip down to the feedback cues' loudness. Measured
 * once by `scripts/sync-audio-loudness.mjs`; unknown clips play at full gain.
 * A gain only ever attenuates, so a quiet clip is left alone.
 * @param {string | undefined} source
 */
export function roundClipGain(source) {
  const entry = source ? loudness.clips?.[source] : undefined;
  const gain = entry && typeof entry === "object" ? Number(entry.gain) : NaN;
  return Number.isFinite(gain) ? Math.min(1, Math.max(0.05, gain)) : 1;
}
