import type { ComponentPropsWithoutRef, ReactNode } from "react";
import clsx from "clsx";
import { FormatLook, type FormatPreview } from "@/components/format-look";
import { RoundMark } from "@/components/round-mark";
import styles from "../app/profile/profile.module.css";

export const formatPreviewCardStyles = styles;

type FormatPreviewCardFields = {
  game: string;
  label: string;
  look?: string;
  preview?: FormatPreview | null;
  subtitle?: ReactNode;
  children?: ReactNode;
  className?: string;
};

type ArticleCardProps = FormatPreviewCardFields &
  Omit<ComponentPropsWithoutRef<"article">, "children" | "className"> & {
    as?: "article";
  };

type ButtonCardProps = FormatPreviewCardFields &
  Omit<ComponentPropsWithoutRef<"button">, "children" | "className"> & {
    as: "button";
  };

export type FormatPreviewCardProps = ArticleCardProps | ButtonCardProps;

export function FormatPreviewCard(props: FormatPreviewCardProps) {
  const { game, label, look, preview, subtitle, children, className, as = "article", ...rest } = props;
  const Tag = as;
  return (
    <Tag className={clsx(styles.formatCard, className)} {...(rest as Record<string, unknown>)}>
      <div className={styles.previewStage} aria-hidden="true" data-testid={`format-preview-stage-${game}`}>
        <FormatLook game={game} label={label} look={look} preview={preview} />
      </div>
      <div className={styles.cardBody}>
        <div className={styles.identity}>
          <RoundMark game={game} />
          <div className={styles.identityCopy}>
            <strong className={styles.identityLabel}>{label}</strong>
            {subtitle}
          </div>
        </div>
        {children}
      </div>
    </Tag>
  );
}
