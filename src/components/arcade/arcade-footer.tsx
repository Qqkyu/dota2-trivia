import Link from "next/link";
import { useLocale } from "@/i18n/provider";
import { type PublicGameInfo } from "@/lib/game-identity";
import styles from "../queue-arcade.module.css";
import own from "./arcade-footer.module.css";
import { LinkStatusLabel } from "../link-status-label";
import { BrandMark } from "./mode-icon";

type ArcadeFooterProps = { gameInfo: PublicGameInfo };

export function ArcadeFooter({ gameInfo }: ArcadeFooterProps) {
  const { t } = useLocale();
  return (
    <footer className={styles.footer}>
      <span>
        <BrandMark logoUrl={gameInfo.logoUrl} />
        {t("shell.footer.tagline")}
      </span>
      <span className={own.footerMeta}>
        <Link href="/profile">
          <LinkStatusLabel pending={t("shell.footer.opening")}>{t("shell.footer.profile")}</LinkStatusLabel>
        </Link>
        <Link href="/privacy">{t("shell.footer.privacy")}</Link>
        <Link href="/calibration">{t("shell.footer.calibration")}</Link>
        <span>{t("shell.footer.legal")}</span>
      </span>
    </footer>
  );
}
