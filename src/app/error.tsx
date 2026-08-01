"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportClientError } from "@/lib/client-diagnostics";
import styles from "./error.module.css";

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => reportClientError(error, "react-boundary"), [error]);
  return (
    <main className={styles.shell}>
      <section className={styles.panel} role="alert">
        <small>Arcade interrupted</small>
        <h1>That round crashed.</h1>
        <p>Your connected records are safe. Retry the view or return to the lobby.</p>
        <div className={styles.actions}>
          <button type="button" onClick={() => unstable_retry()}>
            Retry
          </button>
          <Link href="/">Return to lobby</Link>
        </div>
        {error.digest && <span className={styles.reference}>Reference · {error.digest}</span>}
      </section>
    </main>
  );
}
