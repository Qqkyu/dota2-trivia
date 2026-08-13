import { RoundMark } from "@/components/round-mark";
import styles from "./format-look.module.css";

const ANSWER_KEYS = ["A", "B", "C", "D"] as const;

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

const EMPTY_SHOP = [
  { name: "", image: "" },
  { name: "", image: "" },
  { name: "", image: "" },
] as const;

const EMPTY_ORDER = [
  { name: "", image: "" },
  { name: "", image: "" },
  { name: "", image: "" },
  { name: "", image: "" },
] as const;

export function FormatLook({
  preview,
  game,
  label,
  look,
}: {
  preview?: FormatPreview | null;
  game: string;
  label: string;
  look: string;
}) {
  const kind = preview?.game ?? game;
  const prompt = preview?.effect ?? preview?.prompt ?? look;

  return (
    <div className={styles.board} data-game={kind} data-testid={`format-preview-${kind}`}>
      <i className={styles.timerTrack} aria-hidden="true" />
      <header className={styles.roundBar}>
        <span>
          <span>Round</span>
          <i />
          <span className={styles.gameLabel}>
            <RoundMark game={kind} />
            {label}
          </span>
        </span>
        <strong>15</strong>
      </header>

      <div className={styles.block}>
        {preview?.image ? (
          <span className={styles.art} data-fogged={preview.fogged ? "true" : "false"}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.image.src} alt="" />
          </span>
        ) : kind === "spell-link" || kind === "aghanim-lab" ? (
          <span className={styles.lockedArt} data-kind={kind} aria-hidden="true">
            <RoundMark game={kind} />
          </span>
        ) : null}
        <div className={styles.copy}>
          <span>{look}</span>
          <h2>{prompt}</h2>
        </div>
      </div>

      {kind === "trivia" && preview?.answers ? (
        <div className={styles.answers}>
          {preview.answers.map((answer, index) => (
            <span key={`${index}-${answer}`}>
              <b>{ANSWER_KEYS[index]}</b>
              {answer}
            </span>
          ))}
        </div>
      ) : null}

      {kind === "shopkeeper" ? (
        <div className={styles.shop}>
          {(preview?.shopItems?.length ? preview.shopItems.slice(0, 3) : EMPTY_SHOP).map((item, index) => (
            <span key={`${item.name}-${item.image}-${index}`} data-empty={item.image ? "false" : "true"}>
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image} alt="" />
              ) : (
                <i />
              )}
              {item.name ? <small>{item.name}</small> : null}
            </span>
          ))}
        </div>
      ) : null}

      {kind === "order-up" ? (
        <div className={styles.order}>
          {(preview?.orderCards?.length ? preview.orderCards : EMPTY_ORDER).map((card, index) => (
            <span key={`${card.name}-${index}`}>
              <b>{index + 1}</b>
              {card.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.image} alt="" />
              ) : (
                <i />
              )}
            </span>
          ))}
        </div>
      ) : null}

      {kind === "spell-link" || kind === "aghanim-lab" ? (
        <ol className={styles.clues}>
          <li data-state="open">{kind === "aghanim-lab" && preview?.effect ? preview.effect : "First clue"}</li>
          <li>Second clue</li>
          <li>Third clue</li>
        </ol>
      ) : null}

      {kind === "fogged-vision" ? (
        <div className={styles.meter} aria-hidden="true">
          <span data-on="true" />
          <span />
          <span />
        </div>
      ) : null}

      {kind === "echo-hunt" || kind === "soundcheck" ? (
        <div className={kind === "echo-hunt" ? styles.wave : styles.cuts} aria-hidden="true">
          <b />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      ) : null}

      {kind === "quote-hunt" ? <p className={styles.quoteMark} aria-hidden="true" /> : null}
    </div>
  );
}
