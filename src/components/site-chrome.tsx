import type { ReactNode } from "react";
import Image from "next/image";
import { ARCADE_LOBBY_PATH } from "@/lib/arcade-navigation.mjs";
import { publicGameInfo } from "@/lib/game-catalogs";
import { SiteFooter, type SiteChromePage } from "@/components/site-footer";
import styles from "./site-chrome.module.css";
import { firstPartyArtSrc } from "@/lib/steam-art.mjs";

export function SiteChrome({ children, current }: { children: ReactNode; current?: SiteChromePage }) {
  const game = publicGameInfo();
  return (
    <div className={styles.shell} data-testid="site-chrome">
      <header className={styles.header}>
        <a href={ARCADE_LOBBY_PATH} className={styles.brand} data-testid="site-home">
          <span className={styles.brandMark} aria-hidden="true">
            <Image src={firstPartyArtSrc(game.logoUrl)} alt="" width={30} height={30} unoptimized />
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
