"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n/locales.mjs";
import { createTranslator } from "@/i18n/translator";
import { reportClientError } from "@/lib/client-diagnostics";
import styles from "./error.module.css";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const [text, setText] = useState({ locale: "en", t: createTranslator("en", null) });
  const { t } = text;
  useEffect(() => reportClientError(error, "react-boundary"), [error]);
  // This screen replaces the root layout, so the language provider is gone.
  useEffect(() => {
    const chosen = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${LOCALE_COOKIE}=`))
      ?.slice(LOCALE_COOKIE.length + 1);
    if (resolveLocale(chosen, navigator.languages.join(",")) !== "ru") return;
    void import("@/i18n/messages/ru")
      .then(({ ru }) => setText({ locale: "ru", t: createTranslator("ru", ru) }))
      .catch(() => undefined);
  }, []);
  return (
    <html lang={text.locale}>
      <body className={styles.shell}>
        <main className={styles.panel} role="alert">
          <small>{t("crash.global.eyebrow")}</small>
          <h1>{t("crash.global.title")}</h1>
          <p>{t("crash.global.body")}</p>
          <div className={styles.actions}>
            <button type="button" onClick={() => unstable_retry()}>
              {t("crash.retry")}
            </button>
            <Link href="/">{t("crash.lobby")}</Link>
          </div>
          {error.digest && <span className={styles.reference}>{t("crash.reference", { digest: error.digest })}</span>}
        </main>
      </body>
    </html>
  );
}
