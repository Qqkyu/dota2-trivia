import { cookies, headers } from "next/headers";
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
export function requestLocale(request: Request): Locale {
  const chosen = request.headers
    .get("cookie")
    ?.split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);
  return resolveLocale(chosen, request.headers.get("accept-language")) as Locale;
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
