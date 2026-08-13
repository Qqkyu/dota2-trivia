import styles from "./format-look.module.css";

export function FormatLook({ game }: { game: string }) {
  return (
    <span className={styles.look} data-game={game} aria-hidden="true">
      {game === "trivia" ? (
        <span className={styles.letters}>
          <b>A</b>
          <b>B</b>
          <b>C</b>
          <b>D</b>
        </span>
      ) : null}
      {game === "shopkeeper" ? (
        <span className={styles.slots}>
          <i />
          <i />
          <i />
        </span>
      ) : null}
      {game === "spell-link" ? (
        <span className={styles.link}>
          <i className={styles.ability} />
          <em />
          <span className={styles.grid}>
            {Array.from({ length: 9 }, (_, index) => (
              <i key={index} />
            ))}
          </span>
        </span>
      ) : null}
      {game === "fogged-vision" ? <span className={styles.fog} /> : null}
      {game === "echo-hunt" ? (
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
      {game === "soundcheck" ? (
        <span className={styles.cuts}>
          <i />
          <i />
          <i />
        </span>
      ) : null}
      {game === "quote-hunt" ? <span className={styles.quote}>“ ”</span> : null}
      {game === "aghanim-lab" ? <span className={styles.gem} /> : null}
      {game === "order-up" ? (
        <span className={styles.order}>
          <i />
          <i />
          <i />
          <i />
        </span>
      ) : null}
    </span>
  );
}
