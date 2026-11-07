import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { LOCALE_COOKIE, resolveLocale } from "./locales.mjs";
import { ru } from "./messages/ru";
import { createTranslator } from "./translator";
import type { Locale, Messages } from "./types";

/** The language of this page render. */
export async function getLocale(): Promise<Locale> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  return resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerList.get("accept-language")) as Locale;
}

/** The language of an API request. */
export function requestLocale(request: NextRequest): Locale {
  return resolveLocale(request.cookies.get(LOCALE_COOKIE)?.value, request.headers.get("accept-language")) as Locale;
}

/** English is in the client bundle, so only another language travels with the page. */
export function messagesFor(locale: Locale): Partial<Messages> | null {
  return locale === "ru" ? ru : null;
}

export function translatorFor(locale: Locale) {
  return createTranslator(locale, messagesFor(locale));
}

export async function getTranslator() {
  return translatorFor(await getLocale());
}
