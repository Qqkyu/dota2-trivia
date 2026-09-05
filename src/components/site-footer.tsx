import Link from "next/link";
import styles from "./site-chrome.module.css";

// Keep this file free of catalog imports: the calibration dashboard is a
// client component and everything it imports ships to the browser.
const FOOTER_LINKS = [
  { href: "/profile", label: "Profile", id: "profile" },
  { href: "/privacy", label: "Privacy", id: "privacy" },
  { href: "/calibration", label: "Calibration lab", id: "calibration" },
] as const;

export type SiteChromePage = (typeof FOOTER_LINKS)[number]["id"] | "ops";

export function SiteFooter({ current }: { current?: SiteChromePage }) {
  return (
    <footer className={styles.footer} data-testid="site-footer">
      <span>Queue Arcade · Built for the seconds between “Find Match” and “Accept”</span>
      <span className={styles.footerMeta}>
        {FOOTER_LINKS.map((link) =>
          link.id === current ? (
            <span aria-current="page" data-testid={`site-nav-${link.id}`} key={link.href}>
              {link.label}
            </span>
          ) : (
            <Link href={link.href} data-testid={`site-nav-${link.id}`} key={link.href}>
              {link.label}
            </Link>
          ),
        )}
        <span>
          Dota 2 and its assets are trademarks of Valve Corporation. This project is not affiliated with Valve.
        </span>
      </span>
    </footer>
  );
}
