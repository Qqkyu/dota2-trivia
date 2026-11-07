import type { en } from "./messages/en";

export type Locale = "en" | "ru";
export type MessageKey = keyof typeof en;
export type PluralMessage = { one: string; few?: string; many?: string; other: string };
export type Message = string | PluralMessage;
export type Messages = Record<MessageKey, Message>;
export type MessageVars = Record<string, string | number>;
