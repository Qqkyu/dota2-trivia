import Image from "next/image";
import clsx from "clsx";
import { useState } from "react";
import type { TriviaArtworkKind } from "@/lib/trivia";
import type { PublicArcadeQuestion } from "@/lib/public-question";
import { withPlayerId } from "./shared";
import styles from "../queue-arcade.module.css";
import own from "./artwork.module.css";
import { firstPartyArtSrc } from "@/lib/steam-art.mjs";

export function QuestionArtwork({
  question,
  concealIdentity = false,
  imageOverride,
  testId = "question-artwork",
  className,
  fallbackLabel,
}: {
  question: PublicArcadeQuestion;
  concealIdentity?: boolean;
  imageOverride?: PublicArcadeQuestion["image"];
  testId?: string;
  className?: string;
  fallbackLabel?: string;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const image = imageOverride ?? question.image;
  const source = image?.src ?? "";
  const failed = failedSource === source;
  const loaded = loadedSource === source;

  if (!image) return null;

  return (
    <div
      data-testid={testId}
      data-artwork-state={failed ? "fallback" : loaded ? "loaded" : "loading"}
      className={clsx(
        styles.artwork,
        image.kind === "hero" && styles.heroArtwork,
        image.kind === "item" && styles.itemArtwork,
        className,
      )}
    >
      <div className={styles.artGlow} />
      {failed ? (
        <span className={styles.artFallback}>
          {concealIdentity ? "?" : (fallbackLabel ?? question.eyebrow).slice(0, 2).toUpperCase()}
        </span>
      ) : (
        <Image
          src={firstPartyArtSrc(withPlayerId(image.src))}
          alt={concealIdentity ? "" : image.alt}
          fill
          sizes="(max-width: 700px) 112px, 150px"
          className={styles.artImage}
          onLoad={() => setLoadedSource(image.src)}
          onError={() => setFailedSource(image.src)}
          unoptimized
          priority
        />
      )}
      <span className={styles.artCorner} />
    </div>
  );
}

export function AnswerArtwork({ src, alt, kind }: { src: string; alt: string; kind: TriviaArtworkKind }) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className={clsx(
        styles.answerArtwork,
        kind === "hero" && own.answerHeroArtwork,
        kind === "ability" && own.answerAbilityArtwork,
      )}
    >
      {failed ? (
        <span>{alt.slice(0, 2).toUpperCase()}</span>
      ) : (
        <Image
          src={firstPartyArtSrc(src)}
          alt=""
          fill
          sizes="(max-width: 680px) 62px, 88px"
          className={own.answerArtworkImage}
          onError={() => setFailed(true)}
          unoptimized
        />
      )}
    </span>
  );
}
