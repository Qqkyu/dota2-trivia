const INTERACTIVE_TARGETS = [
  "input",
  "textarea",
  "select",
  "button",
  "a[href]",
  "[contenteditable]",
  '[role~="textbox"]',
  '[role~="button"]',
  '[role~="link"]',
  '[role~="slider"]',
  '[role~="combobox"]',
].join(", ");

/**
 * Keep answer shortcuts out of browser commands and focused controls.
 * A search field can opt in through its own key handler with allowedInput.
 * @param {{ defaultPrevented?: boolean, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean, isComposing?: boolean, keyCode?: number, target?: EventTarget | null }} event
 * @param {{ allowedInput?: EventTarget | null }} [options]
 */
export function shouldHandleAnswerShortcut(event, { allowedInput = null } = {}) {
  if (
    event.defaultPrevented ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.isComposing ||
    event.keyCode === 229
  ) {
    return false;
  }

  const target = event.target;
  if (allowedInput && target === allowedInput) return true;
  const element = typeof target?.closest === "function" ? target : target?.parentElement;
  return !element?.closest?.(INTERACTIVE_TARGETS);
}
