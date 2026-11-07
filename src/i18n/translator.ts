import { formatMessage } from "./format.mjs";
import type { Locale, MessageKey, Messages, MessageVars } from "./types";
import { en } from "./messages/en";

export type Translate = (key: MessageKey, vars?: MessageVars) => string;

/** Falls back to English, so a message added later never shows a raw key. */
export function createTranslator(locale: Locale, messages: Partial<Messages> | null): Translate {
  return (key, vars) => formatMessage(locale, messages?.[key] ?? en[key], vars);
}
