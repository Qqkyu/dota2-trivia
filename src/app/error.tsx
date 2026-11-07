"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useLocale } from "@/i18n/provider";
import { reportClientError } from "@/lib/client-diagnostics";
import styles from "./error.module.css";

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const { t } = useLocale();
  useEffect(() => reportClientError(error, "react-boundary"), [error]);
  return (
    <main className={styles.shell}>
      <section className={styles.panel} role="alert">
        <small>{t("crash.app.eyebrow")}</small>
        <h1>{t("crash.app.title")}</h1>
        <p>{t("crash.app.body")}</p>
        <div className={styles.actions}>
          <button type="button" onClick={() => unstable_retry()}>
            {t("crash.retry")}
          </button>
          <Link href="/">{t("crash.lobby")}</Link>
        </div>
        {error.digest && <span className={styles.reference}>{t("crash.reference", { digest: error.digest })}</span>}
      </section>
    </main>
  );
}
