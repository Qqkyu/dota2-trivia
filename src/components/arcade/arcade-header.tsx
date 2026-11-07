import { useLocale } from "@/i18n/provider";
import { elementClipVolume } from "@/lib/round-clip-volume.mjs";
import { Volume2, VolumeX } from "lucide-react";
import { ARCADE_LOBBY_PATH } from "@/lib/arcade-navigation.mjs";
import { type PublicGameInfo } from "@/lib/game-identity";
import styles from "../queue-arcade.module.css";
import own from "./arcade-header.module.css";
import { LanguageSwitch } from "../language-switch";
import { BrandMark } from "./mode-icon";
import { MIN_GAME_VOLUME } from "./shared";

import type { useArcadeAudio } from "./use-arcade-audio";
import type { useArcadeRoom } from "./use-arcade-room";
import type { usePlayerSettings } from "./use-player-settings";

type ArcadeHeaderProps = Pick<ReturnType<typeof useArcadeRoom>, "returnToLobby"> &
  Pick<ReturnType<typeof useArcadeAudio>, "feedbackPlayerRef" | "stopRoundAudio"> &
  Pick<ReturnType<typeof usePlayerSettings>, "soundEnabled" | "setSoundEnabled" | "gameVolume" | "setGameVolume"> & {
    gameInfo: PublicGameInfo;
  };

export function ArcadeHeader({
  returnToLobby,
  feedbackPlayerRef,
  stopRoundAudio,
  soundEnabled,
  setSoundEnabled,
  gameVolume,
  setGameVolume,
  gameInfo,
}: ArcadeHeaderProps) {
  const { t } = useLocale();
  return (
    <header className={styles.header}>
      <a
        href={ARCADE_LOBBY_PATH}
        className={own.brand}
        aria-label={t("shell.header.home")}
        data-testid="site-home"
        onClick={(event) => {
          event.preventDefault();
          returnToLobby("push");
        }}
      >
        <BrandMark logoUrl={gameInfo.logoUrl} />
        <span>
          <strong>Queue Arcade</strong>
          <small>{t("shell.header.tagline")}</small>
        </span>
      </a>

      <div className={own.headerMeta}>
        <LanguageSwitch />
        <span className={own.patchBadge}>
          {t("shell.header.patch", { game: gameInfo.label, patch: gameInfo.patch })}
        </span>
        <div className={own.volumeControl} data-muted={!soundEnabled}>
          <button
            type="button"
            className={own.iconButton}
            onClick={() => {
              if (soundEnabled) {
                stopRoundAudio();
                feedbackPlayerRef.current?.pauseAll();
              }
              setSoundEnabled(!soundEnabled);
            }}
            aria-label={t(soundEnabled ? "shell.header.mute" : "shell.header.unmute")}
            aria-pressed={soundEnabled}
          >
            {soundEnabled ? <Volume2 /> : <VolumeX />}
          </button>
          <input
            className={own.volumeSlider}
            data-testid="game-volume"
            type="range"
            min={MIN_GAME_VOLUME * 100}
            max="100"
            step="5"
            value={Math.round(gameVolume * 100)}
            onChange={(event) => {
              const nextVolume = Number(event.currentTarget.value) / 100;
              document.querySelectorAll<HTMLAudioElement>('audio[data-testid="round-audio-clip"]').forEach((audio) => {
                audio.volume = elementClipVolume(nextVolume, audio);
              });
              feedbackPlayerRef.current?.preload();
              feedbackPlayerRef.current?.setVolume(nextVolume);
              setGameVolume(nextVolume);
              setSoundEnabled(true);
            }}
            aria-label={t("shell.header.volume")}
            aria-valuetext={t("shell.header.volumeValue", { count: Math.round(gameVolume * 100) })}
          />
          <output className={own.volumeValue}>{Math.round(gameVolume * 100)}%</output>
        </div>
      </div>
    </header>
  );
}
