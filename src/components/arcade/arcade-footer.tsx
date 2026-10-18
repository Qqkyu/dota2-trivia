import Link from "next/link";
import { type PublicGameInfo } from "@/lib/game-identity";
import styles from "../queue-arcade.module.css";
import own from "./arcade-footer.module.css";
import { BrandMark } from "./mode-icon";

type ArcadeFooterProps = { gameInfo: PublicGameInfo };

export function ArcadeFooter({ gameInfo }: ArcadeFooterProps) {
  return (
    <footer className={styles.footer}>
      <span>
        <BrandMark logoUrl={gameInfo.logoUrl} />
        Queue Arcade · Built for the seconds between “Find Match” and “Accept”
      </span>
      <span className={own.footerMeta}>
        <Link href="/profile">Profile</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/calibration">Calibration lab</Link>
        <span>
          Dota 2 is a trademark of Valve Corporation. Game assets belong to their respective rights holders. This
          project is not affiliated with Valve.
        </span>
      </span>
    </footer>
  );
}
