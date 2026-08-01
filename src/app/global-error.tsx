"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportClientError } from "@/lib/client-diagnostics";
import styles from "./error.module.css";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => reportClientError(error, "react-boundary"), [error]);
  return (
    <html lang="en">
      <body className={styles.shell}>
        <main className={styles.panel} role="alert">
          <small>Queue Arcade interrupted</small>
          <h1>Something broke.</h1>
          <p>The failure was recorded without sending the error text, stack, or URL query.</p>
          <div className={styles.actions}>
            <button type="button" onClick={() => unstable_retry()}>
              Retry
            </button>
            <Link href="/">Return to lobby</Link>
          </div>
          {error.digest && <span className={styles.reference}>Reference · {error.digest}</span>}
        </main>
      </body>
    </html>
  );
}
