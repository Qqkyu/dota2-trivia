import styles from "./format-look.module.css";

export interface FormatPreview {
  game: string;
  prompt: string | null;
  answers: string[] | null;
  image: { src: string; alt: string } | null;
  fogged: boolean;
  shopItems: Array<{ name: string; image: string }> | null;
  orderCards: Array<{ name: string; image: string }> | null;
  effect: string | null;
}

export function FormatLook({ preview, game }: { preview?: FormatPreview | null; game: string }) {
  const kind = preview?.game ?? game;
  const detail = preview?.effect ?? preview?.prompt ?? "";

  return (
    <span className={styles.look} data-game={kind} data-testid={`format-preview-${kind}`}>
      {preview?.image ? (
        <span className={styles.art} data-fogged={preview.fogged ? "true" : "false"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.image.src} alt="" />
        </span>
      ) : null}
      {preview?.shopItems ? (
        <span className={styles.shop}>
          {preview.shopItems.map((item) => (
            <span key={`${item.name}-${item.image}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.image} alt="" />
              <small>{item.name}</small>
            </span>
          ))}
        </span>
      ) : null}
      {preview?.orderCards ? (
        <span className={styles.orderCards}>
          {preview.orderCards.map((card) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`${card.name}-${card.image}`} src={card.image} alt="" />
          ))}
        </span>
      ) : null}
      {kind === "trivia" && preview?.answers ? (
        <span className={styles.letters}>
          {["A", "B", "C", "D"].map((letter, index) => (
            <b key={letter}>
              {letter}
              <em>{preview.answers?.[index]}</em>
            </b>
          ))}
        </span>
      ) : null}
      {kind === "echo-hunt" ? (
        <span className={styles.wave}>
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      ) : null}
      {kind === "soundcheck" ? (
        <span className={styles.cuts}>
          <i />
          <i />
          <i />
        </span>
      ) : null}
      {detail ? <span className={styles.prompt}>{detail}</span> : null}
    </span>
  );
}
