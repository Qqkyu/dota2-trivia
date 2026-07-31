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

/** Every retired mode link now resolves to the one canonical public arcade. */
export function arcadeModeHref() {
  return "/";
}
