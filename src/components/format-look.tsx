"use client";

import clsx from "clsx";
import type { CSSProperties } from "react";
import { Clock3, Gem, ListOrdered, MessageSquareQuote, ScanEye, Swords, Volume2, WandSparkles } from "lucide-react";
import { RoundMark } from "@/components/round-mark";
import { useLocale } from "@/i18n/provider";
import { ROUND_GAME_LABEL_KEYS } from "@/lib/arcade-games.mjs";
import { LIVE_QUESTION_COPY } from "@/lib/round-question-copy.mjs";
import arcade from "./queue-arcade.module.css";
import look from "./format-look.module.css";
import { firstPartyArtSrc } from "@/lib/steam-art.mjs";

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
  upgradeType?: string | null;
  soundcheckFamily?: string | null;
  soundcheckFormat?: string | null;
}

function Artwork({ src, fogged = false, className }: { src?: string | null; fogged?: boolean; className?: string }) {
  return (
    <div className={clsx(arcade.artwork, fogged && arcade.heroArtwork, className)}>
      <div className={arcade.artGlow} />
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={clsx(arcade.artImage, look.artImage)} src={firstPartyArtSrc(src)} alt="" />
      ) : (
        <span className={arcade.artFallback}>{fogged ? "?" : ""}</span>
      )}
      <span className={arcade.artCorner} />
    </div>
  );
}

function QuestionBody({ preview, kind }: { preview?: FormatPreview | null; kind: string }) {
  const { t } = useLocale();
  if (kind === "flashback") {
    return (
      <div className={clsx(arcade.questionBlock, arcade.flashbackQuestion)}>
        {preview?.image?.src ? <Artwork src={preview.image.src} /> : null}
        <div className={arcade.questionCopy}>
          <h2>{preview?.prompt}</h2>
        </div>
      </div>
    );
  }

  if (kind === "order-up") {
    return (
      <div className={clsx(arcade.questionBlock, arcade.valueOrderQuestion)}>
        <div className={arcade.valueOrderGlyph} aria-hidden="true">
          <ListOrdered />
        </div>
        <div className={arcade.questionCopy}>
          {preview?.eyebrow ? <span>{preview.eyebrow}</span> : null}
          <h2>{preview?.prompt}</h2>
        </div>
      </div>
    );
  }

  if (kind === "shopkeeper") {
    return (
      <div
        className={clsx(arcade.questionBlock, arcade.shopkeeperQuestion)}
        data-shopkeeper-format={preview?.shopFormat ?? undefined}
      >
        {preview?.shopFormat === "real-recipe" ? (
          <div className={arcade.recipeTarget}>
            <Artwork src={preview.image?.src} />
            <span>{t("preview.targetItem")}</span>
          </div>
        ) : (
          <div className={arcade.shopkeeperPromptTray}>
            <span
              className={arcade.shopkeeperTray}
              data-item-count={preview?.shopItems?.length ?? 0}
              style={{ "--shopkeeper-item-count": Math.max(1, preview?.shopItems?.length ?? 0) } as CSSProperties}
            >
              {(preview?.shopItems ?? []).map((item) => (
                <span className={arcade.shopkeeperItem} key={`${item.name}-${item.image}`}>
                  <span className={arcade.shopkeeperItemArt}>
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={firstPartyArtSrc(item.image)} alt="" />
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
      <div className={clsx(arcade.questionBlock, arcade.spellQuestion, arcade.heroPickerQuestion)}>
        <div className={arcade.spellArtwork}>
          <div className={clsx(arcade.artwork, arcade.spellLockedArtwork)}>
            <div className={arcade.artGlow} />
            <WandSparkles />
            <span className={arcade.artCorner} />
          </div>
          <span>
            {t("preview.clue", { number: 1 })}
            <small>/ 3</small>
          </span>
        </div>
        <div className={arcade.questionCopy}>
          <span>{t(spell.eyebrow)}</span>
          <h2>{t(spell.prompt)}</h2>
          <div className={arcade.clueList}>
            <div className={arcade.clueUnlocked}>
              <strong>01</strong>
              <span>{preview?.hint ?? t("preview.abilityDescription")}</span>
            </div>
            <div className={arcade.clueLocked}>
              <strong>02</strong>
              <span>{t(spell.clueTwo)}</span>
            </div>
            <div className={arcade.clueLocked}>
              <strong>03</strong>
              <span>{t(spell.clueThree)}</span>
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
        className={clsx(arcade.questionBlock, arcade.aghanimQuestion, arcade.heroPickerQuestion)}
        data-aghanim-stage={1}
      >
        <div className={arcade.aghanimArtwork}>
          {preview?.image?.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={look.aghanimArt} src={firstPartyArtSrc(preview.image.src)} alt="" />
          ) : (
            <Gem aria-hidden="true" />
          )}
          <span>
            {t("preview.clue", { number: 1 })}
            <small>/ 3</small>
          </span>
        </div>
        <div className={arcade.questionCopy}>
          <span>{t(lab.eyebrow)}</span>
          <h2>{preview?.prompt}</h2>
          <div className={clsx(arcade.clueList, arcade.aghanimClues)}>
            <div className={arcade.clueUnlocked}>
              <strong>01</strong>
              <span>{preview?.effect ?? preview?.prompt}</span>
            </div>
            <div className={arcade.clueLocked}>
              <strong>02</strong>
              <span>{t(lab.clueTwo)}</span>
            </div>
            <div className={arcade.clueLocked}>
              <strong>03</strong>
              <span>{t(lab.clueThree)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "fogged-vision") {
    const fog = LIVE_QUESTION_COPY["fogged-vision"];
    return (
      <div className={clsx(arcade.questionBlock, arcade.fogQuestion, arcade.heroPickerQuestion)} data-fog-stage={1}>
        <div className={arcade.fogArtwork}>
          <Artwork src={preview?.image?.src} fogged />
          <span>
            <ScanEye />
            {t("preview.fog", { number: "01" })}
            <small>/ 03</small>
          </span>
        </div>
        <div className={arcade.questionCopy}>
          <span>{t(fog.eyebrow)}</span>
          <h2>{t(fog.prompt)}</h2>
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
    const eyebrow = t(
      isSoundcheck
        ? preview?.soundcheckFormat === "sequence"
          ? LIVE_QUESTION_COPY.soundcheck.sequence
          : preview?.soundcheckFamily === "item"
            ? LIVE_QUESTION_COPY.soundcheck.item
            : LIVE_QUESTION_COPY.soundcheck.ability
        : LIVE_QUESTION_COPY["echo-hunt"].eyebrow,
    );
    const prompt = isSoundcheck ? preview?.prompt : t(LIVE_QUESTION_COPY["echo-hunt"].prompt);
    return (
      <div
        className={clsx(
          arcade.questionBlock,
          arcade.echoQuestion,
          arcade.heroPickerQuestion,
          isSoundcheck && arcade.soundcheckQuestion,
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
          <span>{t("preview.cut", { number: 1, total: 3 })}</span>
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
      <div className={clsx(arcade.questionBlock, arcade.quoteQuestion, arcade.heroPickerQuestion)}>
        <div className={arcade.quoteCard}>
          <MessageSquareQuote />
          <blockquote>“{preview?.detail ?? preview?.prompt}”</blockquote>
          <span>{t(quote.cardLabel)}</span>
        </div>
        <div className={arcade.questionCopy}>
          <span>{t(quote.eyebrow)}</span>
          <h2>{t(quote.prompt)}</h2>
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

  const classicEyebrow = preview?.kind === "ability-detective" ? preview.eyebrow?.split("·", 1)[0]?.trim() : null;

  return (
    <div className={clsx(arcade.questionBlock, !preview?.image && arcade.textQuestion)}>
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
  const { t } = useLocale();
  const kind = preview?.game ?? game;
  const headerKey = ROUND_GAME_LABEL_KEYS[kind as keyof typeof ROUND_GAME_LABEL_KEYS];
  const header = headerKey ? t(headerKey) : kind;

  return (
    <div className={look.frame} data-game={kind} data-testid={`format-preview-${kind}`}>
      <div className={look.scale}>
        <div className={clsx(arcade.gameStage, STAGE_CLASS[kind], look.stage)}>
          <div className={arcade.timerTrack} aria-hidden="true">
            <span />
          </div>
          <div className={arcade.roundHeader}>
            <div>
              <span>{t("session.round", { number: "001" })}</span>
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
        </div>
      </div>
    </div>
  );
}
