"use client";

import clsx from "clsx";
import { useLayoutEffect, useRef, useState } from "react";
import { Clock3, Gem, ListOrdered, MessageSquareQuote, ScanEye, Swords, Volume2, WandSparkles } from "lucide-react";
import { RoundMark } from "@/components/round-mark";
import { LIVE_QUESTION_COPY, LIVE_ROUND_HEADER_LABELS } from "@/lib/round-question-copy.mjs";
import arcade from "./queue-arcade.module.css";
import look from "./format-look.module.css";

const ANSWER_KEYS = ["A", "B", "C", "D"] as const;

const STAGE_CLASS: Record<string, string | undefined> = {
  shopkeeper: arcade.shopkeeperStage,
  "spell-link": arcade.spellLinkStage,
  "fogged-vision": arcade.foggedStage,
  "echo-hunt": arcade.echoStage,
  soundcheck: arcade.soundcheckStage,
  "quote-hunt": arcade.quoteStage,
  "aghanim-lab": arcade.aghanimStage,
  "order-up": arcade.valueOrderStage,
};

export interface FormatPreview {
  game: string;
  kind?: string | null;
  category?: string | null;
  eyebrow?: string | null;
  prompt: string | null;
  detail?: string | null;
  hint?: string | null;
  answers: string[] | null;
  image: { src: string; alt: string } | null;
  fogged: boolean;
  shopItems: Array<{ name: string; image: string; count?: number }> | null;
  shopFormat?: string | null;
  orderCards: Array<{ name: string; image: string }> | null;
  effect: string | null;
  soundcheckFamily?: string | null;
  soundcheckFormat?: string | null;
}

function Artwork({
  src,
  fogged = false,
  className,
}: {
  src?: string | null;
  fogged?: boolean;
  className?: string;
}) {
  return (
    <div className={clsx(arcade.artwork, fogged && arcade.heroArtwork, className)}>
      <div className={arcade.artGlow} />
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={clsx(arcade.artImage, look.artImage)} src={src} alt="" />
      ) : (
        <span className={arcade.artFallback}>{fogged ? "?" : ""}</span>
      )}
      <span className={arcade.artCorner} />
    </div>
  );
}

function OrderBoard({ cards }: { cards: Array<{ name: string; image: string }> }) {
  return (
    <div className={arcade.valueOrderBoard} data-testid="format-preview-order-board">
      <div className={arcade.valueOrderSlots} aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} data-filled="false">
            <i>{index + 1}</i>
            <em>—</em>
          </span>
        ))}
      </div>
      <div className={arcade.valueOrderCards}>
        {cards.map((card, index) => (
          <span className={look.orderCard} key={`${card.name}-${index}`} data-card-kind="item">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {card.image ? <img src={card.image} alt="" /> : <i />}
            <span>
              <strong>{card.name}</strong>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function QuestionBody({ preview, kind }: { preview?: FormatPreview | null; kind: string }) {
  if (kind === "order-up") {
    return (
      <>
        <div className={clsx(arcade.questionBlock, arcade.valueOrderQuestion, look.fit)}>
          <div className={arcade.valueOrderGlyph} aria-hidden="true">
            <ListOrdered />
          </div>
          <div className={arcade.questionCopy}>
            {preview?.eyebrow ? <span>{preview.eyebrow}</span> : null}
            <h2>{preview?.prompt}</h2>
          </div>
        </div>
        {preview?.orderCards?.length ? <OrderBoard cards={preview.orderCards} /> : null}
      </>
    );
  }

  if (kind === "shopkeeper") {
    return (
      <div
        className={clsx(arcade.questionBlock, arcade.shopkeeperQuestion, look.fit)}
        data-shopkeeper-format={preview?.shopFormat ?? undefined}
      >
        {preview?.shopFormat === "real-recipe" ? (
          <div className={arcade.recipeTarget}>
            <Artwork src={preview.image?.src} />
            <span>Target item</span>
          </div>
        ) : (
          <div className={arcade.shopkeeperPromptTray}>
            <span className={arcade.shopkeeperTray} data-item-count={preview?.shopItems?.length ?? 0}>
              {(preview?.shopItems ?? []).map((item) => (
                <span className={arcade.shopkeeperItem} key={`${item.name}-${item.image}`}>
                  <span className={arcade.shopkeeperItemArt}>
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt="" />
                    ) : null}
                    {(item.count ?? 1) > 1 ? <b>×{item.count}</b> : null}
                  </span>
                  <strong>{item.name}</strong>
                </span>
              ))}
            </span>
          </div>
        )}
        <div className={arcade.questionCopy}>
          <h2>{preview?.prompt}</h2>
        </div>
      </div>
    );
  }

  if (kind === "spell-link") {
    const spell = LIVE_QUESTION_COPY["spell-link"];
    return (
      <div className={clsx(arcade.questionBlock, arcade.spellQuestion, arcade.heroPickerQuestion, look.fit)}>
        <div className={arcade.spellArtwork}>
          <div className={clsx(arcade.artwork, arcade.spellLockedArtwork)}>
            <div className={arcade.artGlow} />
            <WandSparkles />
            <span className={arcade.artCorner} />
          </div>
          <span>
            Clue 1<small>/ 3</small>
          </span>
        </div>
        <div className={arcade.questionCopy}>
          <span>{spell.eyebrow}</span>
          <h2>{spell.prompt}</h2>
          <div className={arcade.clueList}>
            <div className={arcade.clueUnlocked}>
              <strong>01</strong>
              <span>{preview?.hint ?? "Ability description"}</span>
            </div>
            <div className={arcade.clueLocked}>
              <strong>02</strong>
              <span>{spell.clueTwo}</span>
            </div>
            <div className={arcade.clueLocked}>
              <strong>03</strong>
              <span>{spell.clueThree}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "aghanim-lab") {
    const lab = LIVE_QUESTION_COPY["aghanim-lab"];
    return (
      <div
        className={clsx(arcade.questionBlock, arcade.aghanimQuestion, arcade.heroPickerQuestion, look.fit)}
        data-aghanim-stage={1}
      >
        <div className={arcade.aghanimArtwork}>
          {preview?.image?.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.image.src} alt="" />
          ) : (
            <Gem aria-hidden="true" />
          )}
          <span>
            Clue 1<small>/ 3</small>
          </span>
        </div>
        <div className={arcade.questionCopy}>
          <span>{lab.eyebrow}</span>
          <h2>{preview?.prompt}</h2>
          <div className={clsx(arcade.clueList, arcade.aghanimClues)}>
            <div className={arcade.clueUnlocked}>
              <strong>01</strong>
              <span>{preview?.effect ?? preview?.prompt}</span>
            </div>
            <div className={arcade.clueLocked}>
              <strong>02</strong>
              <span>{lab.clueTwo}</span>
            </div>
            <div className={arcade.clueLocked}>
              <strong>03</strong>
              <span>{lab.clueThree}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "fogged-vision") {
    const fog = LIVE_QUESTION_COPY["fogged-vision"];
    return (
      <div
        className={clsx(arcade.questionBlock, arcade.fogQuestion, arcade.heroPickerQuestion, look.fit)}
        data-fog-stage={1}
      >
        <div className={arcade.fogArtwork}>
          <Artwork src={preview?.image?.src} fogged />
          <span>
            <ScanEye />
            Fog 01
            <small>/ 03</small>
          </span>
        </div>
        <div className={arcade.questionCopy}>
          <span>{fog.eyebrow}</span>
          <h2>{fog.prompt}</h2>
          <div className={arcade.fogMeter}>
            <span className={arcade.fogMeterActive} />
            <span />
            <span />
          </div>
        </div>
      </div>
    );
  }

  if (kind === "echo-hunt" || kind === "soundcheck") {
    const isSoundcheck = kind === "soundcheck";
    const eyebrow = isSoundcheck
      ? preview?.soundcheckFormat === "sequence"
        ? LIVE_QUESTION_COPY.soundcheck.sequence
        : preview?.soundcheckFamily === "item"
          ? LIVE_QUESTION_COPY.soundcheck.item
          : LIVE_QUESTION_COPY.soundcheck.ability
      : LIVE_QUESTION_COPY["echo-hunt"].eyebrow;
    const prompt = isSoundcheck ? preview?.prompt : LIVE_QUESTION_COPY["echo-hunt"].prompt;
    return (
      <div
        className={clsx(
          arcade.questionBlock,
          arcade.echoQuestion,
          arcade.heroPickerQuestion,
          isSoundcheck && arcade.soundcheckQuestion,
          look.fit,
        )}
      >
        <div className={clsx(arcade.echoPlayer, isSoundcheck && arcade.soundcheckPlayer)}>
          <div className={arcade.audioAutoplayIcon} aria-hidden="true">
            <Volume2 />
          </div>
          <div className={arcade.audioVisualization} aria-hidden="true">
            <div className={arcade.echoWave}>
              {Array.from({ length: 15 }, (_, index) => (
                <i key={index} />
              ))}
            </div>
          </div>
          <span>Cut 1 of 3</span>
        </div>
        <div className={arcade.questionCopy}>
          <span>{eyebrow}</span>
          <h2>{prompt}</h2>
          <div className={arcade.soundRevealMeter}>
            <span className={arcade.soundRevealMeterActive} />
            <span />
            <span />
          </div>
        </div>
      </div>
    );
  }

  if (kind === "quote-hunt") {
    const quote = LIVE_QUESTION_COPY["quote-hunt"];
    return (
      <div className={clsx(arcade.questionBlock, arcade.quoteQuestion, arcade.heroPickerQuestion, look.fit)}>
        <div className={arcade.quoteCard}>
          <MessageSquareQuote />
          <blockquote>“{preview?.detail ?? preview?.prompt}”</blockquote>
          <span>{quote.cardLabel}</span>
        </div>
        <div className={arcade.questionCopy}>
          <span>{quote.eyebrow}</span>
          <h2>{quote.prompt}</h2>
          <div className={arcade.quoteHints}>
            <span data-state="locked">
              <b>01</b>?
            </span>
            <span data-state="locked">
              <b>02</b>?
            </span>
          </div>
        </div>
      </div>
    );
  }

  const classicEyebrow =
    preview?.kind === "ability-detective" ? preview.eyebrow?.split("·", 1)[0]?.trim() : null;

  return (
    <div className={clsx(arcade.questionBlock, !preview?.image && arcade.textQuestion, look.fit)}>
      {preview?.image ? (
        <Artwork src={preview.image.src} />
      ) : (
        <div className={arcade.questionGlyph} aria-hidden="true">
          <Swords />
        </div>
      )}
      <div className={arcade.questionCopy}>
        {classicEyebrow ? <span>{classicEyebrow}</span> : null}
        <h2>{preview?.prompt}</h2>
      </div>
    </div>
  );
}

export function FormatLook({
  preview,
  game,
}: {
  preview?: FormatPreview | null;
  game: string;
  label?: string;
  look?: string;
}) {
  const kind = preview?.game ?? game;
  const header = LIVE_ROUND_HEADER_LABELS[kind as keyof typeof LIVE_ROUND_HEADER_LABELS] ?? kind;
  const scaleRef = useRef<HTMLDivElement>(null);
  const [visualHeight, setVisualHeight] = useState(148);

  useLayoutEffect(() => {
    const node = scaleRef.current;
    if (!node) return;

    const update = () => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      if (next > 0) setVisualHeight(next + 8);
    };

    update();
    const images = [...node.querySelectorAll("img")];
    for (const image of images) {
      if (!image.complete) image.addEventListener("load", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => {
      observer.disconnect();
      for (const image of images) image.removeEventListener("load", update);
    };
  }, [kind, preview]);

  return (
    <div
      className={look.frame}
      data-game={kind}
      data-testid={`format-preview-${kind}`}
      style={{ height: visualHeight }}
    >
      <div className={look.scale} ref={scaleRef}>
        <div className={clsx(arcade.gameStage, STAGE_CLASS[kind], look.stage)}>
          <div className={arcade.timerTrack} aria-hidden="true">
            <span />
          </div>
          <div className={arcade.roundHeader}>
            <div>
              <span>Round 001</span>
              <i />
              <span className={arcade.roundGameLabel}>
                <RoundMark game={kind} />
                {header}
              </span>
              {preview?.category ? (
                <>
                  <i />
                  <span>{preview.category}</span>
                </>
              ) : null}
            </div>
            <div className={arcade.timer}>
              <Clock3 />
              <strong>15</strong>
            </div>
          </div>
          <QuestionBody preview={preview} kind={kind} />
          {kind === "trivia" && preview?.answers ? (
            <div className={arcade.answers}>
              {preview.answers.map((answer, index) => (
                <span className={arcade.answer} key={`${index}-${answer}`}>
                  <b className={arcade.answerKey}>{ANSWER_KEYS[index]}</b>
                  <span className={arcade.answerText}>{answer}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
