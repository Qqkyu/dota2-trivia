import clsx from "clsx";
import styles from "./steam-sign-in.module.css";

export function SteamSignIn({ returnTo = "/profile", className }: { returnTo?: string; className?: string }) {
  const href = `/api/auth/steam?returnTo=${encodeURIComponent(returnTo)}`;
  return (
    <a href={href} className={clsx(styles.button, className)} data-testid="steam-sign-in">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="15.8" cy="8.2" r="3.6" />
        <circle cx="15.8" cy="8.2" r="1.7" />
        <circle cx="7.1" cy="16.5" r="2.2" />
        <path d="m9 15.2 4.2-3.1M5.1 15.6 1.8 14.2M8.7 18l3.4 1.4" />
      </svg>
      <span>Sign in with Steam</span>
    </a>
  );
}
