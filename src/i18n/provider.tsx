"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { formatNumber } from "./format.mjs";
import { createTranslator, type Translate } from "./translator";
import type { Locale, Messages } from "./types";

interface LocaleValue {
  locale: Locale;
  t: Translate;
  number: (value: number) => string;
}

const LocaleContext = createContext<LocaleValue>({
  locale: "en",
  t: createTranslator("en", null),
  number: (value) => formatNumber("en", value),
});

export function LocaleProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Partial<Messages> | null;
  children: ReactNode;
}) {
  const value = useMemo<LocaleValue>(
    () => ({
      locale,
      t: createTranslator(locale, messages),
      number: (input) => formatNumber(locale, input),
    }),
    [locale, messages],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
