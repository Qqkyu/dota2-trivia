/**
 * The volume a round clip element plays at: the player's game volume times the
 * clip's loudness gain, which the element carries as `data-gain`. Every writer
 * of a clip's volume goes through here, so a later `canplay` or a slider move
 * cannot undo the gain.
 * @param {number} gameVolume
 * @param {unknown} gain
 */
export function roundClipVolume(gameVolume, gain) {
  const factor = Number(gain);
  return Math.min(1, Math.max(0, gameVolume * (Number.isFinite(factor) && factor > 0 ? factor : 1)));
}

/** @param {number} gameVolume @param {{ dataset?: DOMStringMap }} audio */
export function elementClipVolume(gameVolume, audio) {
  return roundClipVolume(gameVolume, audio.dataset?.gain);
}
