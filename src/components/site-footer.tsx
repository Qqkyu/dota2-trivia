"use client";

import Link from "next/link";
import { useLocale } from "@/i18n/provider";
import styles from "./site-chrome.module.css";

// Keep this file free of catalog imports: the calibration dashboard is a
// client component and everything it imports ships to the browser.
const FOOTER_LINKS = [
  { href: "/profile", label: "footer.profile", id: "profile" },
  { href: "/privacy", label: "footer.privacy", id: "privacy" },
  { href: "/calibration", label: "footer.calibration", id: "calibration" },
] as const;

export type SiteChromePage = (typeof FOOTER_LINKS)[number]["id"] | "ops";

export function SiteFooter({ current }: { current?: SiteChromePage }) {
  const { t } = useLocale();
  return (
    <footer className={styles.footer} data-testid="site-footer">
      <span>{t("footer.tagline")}</span>
      <span className={styles.footerMeta}>
        {FOOTER_LINKS.map((link) =>
          link.id === current ? (
            <span aria-current="page" data-testid={`site-nav-${link.id}`} key={link.href}>
              {t(link.label)}
            </span>
          ) : (
            <Link href={link.href} data-testid={`site-nav-${link.id}`} key={link.href}>
              {t(link.label)}
            </Link>
          ),
        )}
        <span>{t("footer.legal")}</span>
      </span>
    </footer>
  );
}
