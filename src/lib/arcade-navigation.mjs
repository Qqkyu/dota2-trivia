export const DEFAULT_ARCADE_MODE = "mixed";

/**
 * Resolve one URL value against the modes supported by the active game.
 *
 * @template {string} Mode
 * @param {unknown} value
 * @param {readonly Mode[]} modes
 * @param {Mode} fallback
 * @returns {Mode}
 */
export function resolveArcadeMode(value, modes, fallback = /** @type {Mode} */ (DEFAULT_ARCADE_MODE)) {
  return typeof value === "string" && modes.includes(/** @type {Mode} */ (value))
    ? /** @type {Mode} */ (value)
    : fallback;
}

/**
 * Mixed Arcade owns the canonical home URL; every other game gets a stable,
 * shareable query URL that the browser can put in its history.
 *
 * @param {string} mode
 */
export function arcadeModeHref(mode) {
  return mode === DEFAULT_ARCADE_MODE ? "/" : `/?mode=${encodeURIComponent(mode)}`;
}
