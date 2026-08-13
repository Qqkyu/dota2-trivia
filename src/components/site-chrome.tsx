import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ARCADE_LOBBY_PATH } from "@/lib/arcade-navigation.mjs";
import { publicGameInfo } from "@/lib/game-catalogs";
import styles from "./site-chrome.module.css";

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

export function SiteChrome({ children, current }: { children: ReactNode; current?: SiteChromePage }) {
  const game = publicGameInfo();
  return (
    <div className={styles.shell} data-testid="site-chrome">
      <header className={styles.header}>
        <a href={ARCADE_LOBBY_PATH} className={styles.brand} data-testid="site-home">
          <span className={styles.brandMark} aria-hidden="true">
            <Image src={game.logoUrl} alt="" width={30} height={30} unoptimized />
          </span>
          <span>
            <strong>Queue Arcade</strong>
            <small>Side quests, between matches</small>
          </span>
        </a>
      </header>
      <div className={styles.body}>{children}</div>
      <SiteFooter current={current} />
    </div>
  );
}
