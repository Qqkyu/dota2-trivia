import Image from "next/image";
import clsx from "clsx";
import type { CSSProperties } from "react";
import type { ShopkeeperItemReference } from "@/lib/trivia";
import { SHOPKEEPER_RECIPE_IMAGE, type ShopkeeperCatalogItem } from "@/lib/shopkeeper-catalog";
import { shopkeeperReferencesForKeys } from "./shared";
import styles from "../queue-arcade.module.css";
import own from "./shopkeeper-parts.module.css";
import { firstPartyArtSrc } from "@/lib/steam-art.mjs";

export function ShopkeeperItem({ item, compact = false }: { item: ShopkeeperItemReference; compact?: boolean }) {
  return (
    <span className={clsx(styles.shopkeeperItem, compact && styles.shopkeeperItemCompact)}>
      <span className={styles.shopkeeperItemArt}>
        <Image src={firstPartyArtSrc(item.image)} alt="" fill sizes={compact ? "54px" : "82px"} unoptimized />
        {item.count > 1 && <b>×{item.count}</b>}
      </span>
      <strong>{item.name}</strong>
    </span>
  );
}

export function ShopkeeperTray({
  items,
  compact = false,
  testId,
}: {
  items: ShopkeeperItemReference[];
  compact?: boolean;
  testId?: string;
}) {
  return (
    <span
      className={clsx(styles.shopkeeperTray, compact && own.shopkeeperTrayCompact)}
      role="group"
      data-testid={testId}
      data-item-count={items.length}
      style={{ "--shopkeeper-item-count": Math.max(1, items.length) } as CSSProperties}
      aria-label={items.map((item) => `${item.name}${item.count > 1 ? ` times ${item.count}` : ""}`).join(", ")}
    >
      {items.map((item) => (
        <ShopkeeperItem key={item.key} item={item} compact={compact} />
      ))}
    </span>
  );
}

export function ShopkeeperPick({ item, label }: { item: ShopkeeperCatalogItem | undefined; label: string }) {
  return (
    <span className={own.shopkeeperPick}>
      <small>{label}</small>
      {item ? (
        <span>
          <Image src={firstPartyArtSrc(item.image)} alt="" width={42} height={31} unoptimized />
          <strong>{item.name}</strong>
        </span>
      ) : (
        <strong>No pick</strong>
      )}
    </span>
  );
}

export function ShopkeeperRecipePick({
  itemKeys,
  label,
  recipeIncluded = false,
}: {
  itemKeys: string[];
  label: string;
  recipeIncluded?: boolean;
}) {
  const items = shopkeeperReferencesForKeys(itemKeys);
  return (
    <span className={styles.shopkeeperRecipePick}>
      <small>{label}</small>
      {items.length ? (
        <span className={own.shopkeeperRecipeRevealRow}>
          <ShopkeeperTray items={items} compact testId="shopkeeper-recipe-reveal-tray" />
          {recipeIncluded ? (
            <span className={styles.shopkeeperRecipeIncluded} data-testid="shopkeeper-recipe-included">
              <Image src={firstPartyArtSrc(SHOPKEEPER_RECIPE_IMAGE)} alt="" width={36} height={27} unoptimized />
              <small>Included</small>
            </span>
          ) : null}
        </span>
      ) : (
        <strong>No build</strong>
      )}
    </span>
  );
}
