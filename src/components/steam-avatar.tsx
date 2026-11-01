"use client";

import Image from "next/image";
import { useState } from "react";
import clsx from "clsx";
import styles from "./steam-avatar.module.css";
import { firstPartyArtSrc } from "@/lib/steam-art.mjs";

export function SteamAvatar({
  src,
  name,
  width,
  height,
  className,
  fallbackClassName,
}: {
  src: string | null | undefined;
  name: string;
  width: number;
  height: number;
  className?: string;
  fallbackClassName?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (src && failedSrc !== src) {
    return (
      <Image
        className={className}
        src={firstPartyArtSrc(src)}
        alt=""
        width={width}
        height={height}
        unoptimized
        data-testid="steam-avatar"
        onError={() => setFailedSrc(src)}
      />
    );
  }

  return (
    <span
      className={clsx(styles.fallback, className, fallbackClassName)}
      title={name}
      data-testid="steam-avatar-fallback"
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32">
        <circle cx="16" cy="12" r="6" />
        <path d="M6 27c1.6-6.4 5.8-9 10-9s8.4 2.6 10 9" />
      </svg>
    </span>
  );
}
