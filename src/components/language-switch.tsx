"use client";

import { useLocale } from "@/i18n/provider";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_SECONDS, LOCALES } from "@/i18n/locales.mjs";
import styles from "./language-switch.module.css";

const LABELS: Record<string, string> = { en: "EN", ru: "RU" };

/** Plain links keep it working before scripts load; `?lang=` sets the same cookie in the proxy. */
export function LanguageSwitch() {
  const { locale, t } = useLocale();
  return (
    <nav className={styles.switch} aria-label={t("language.label")} data-testid="language-switch">
      {LOCALES.map((option) => (
        <a
          key={option}
          href={`?lang=${option}`}
          lang={option}
          aria-current={option === locale ? "true" : undefined}
          data-testid={`language-${option}`}
          onClick={(event) => {
            event.preventDefault();
            document.cookie = `${LOCALE_COOKIE}=${option}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
            window.location.reload();
          }}
        >
          {LABELS[option]}
        </a>
      ))}
    </nav>
  );
}
