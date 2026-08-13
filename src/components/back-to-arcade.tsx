import clsx from "clsx";
import { ARCADE_LOBBY_PATH } from "@/lib/arcade-navigation.mjs";
import styles from "./back-to-arcade.module.css";

export function BackToArcade({ className }: { className?: string }) {
  return (
    <a href={ARCADE_LOBBY_PATH} className={clsx(styles.back, className)} data-testid="back-to-arcade">
      ← Queue Arcade
    </a>
  );
}
