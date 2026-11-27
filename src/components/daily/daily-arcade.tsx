"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import clsx from "clsx";
import { Check, Copy, Eye, Flame, Play, X } from "lucide-react";
import { useLocale } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/types";
import {
  DAILY_MAX_POINTS,
  DAILY_RESULT_MARKS,
  DAILY_ROUND_MAX_POINTS,
  DAILY_SLOTS,
  currentDailyStreak,
  dailyNumberForDate,
  dailyShareText,
  dailyTotal,
} from "@/lib/daily.mjs";
import type { DailyAnswer, DailyGame, DailyRoundPayload } from "@/lib/daily-types";
import { roundClipVolume } from "@/lib/round-clip-volume.mjs";
import { safeBrowserStorage } from "@/lib/browser-storage.mjs";
import { PUBLIC_ARCADE_PATH } from "@/lib/arcade-navigation.mjs";
import { HeroPicker } from "../arcade/hero-picker";
import { FlashbackOrderBoard, FlashbackYearBoard } from "../arcade/flashback-boards";
import { ShopkeeperStore } from "../arcade/shopkeeper-store";
import { DEFAULT_GAME_VOLUME, EMPTY_CROWD, SETTINGS_KEY } from "../arcade/shared";
import {
  type DailyDayState,
  type DailyState,
  emptyDay,
  finishDay,
  readDailyState,
  writeDailyState,
} from "./daily-storage";
import styles from "./daily-arcade.module.css";

interface DailySummary {
  players: number;
  averageTotal: number | null;
  beatShare: number | null;
  slots: Array<{ answered: number; scoredShare: number | null }>;
}

const GAME_LABELS: Record<DailyGame, MessageKey> = {
  "fogged-vision": "game.foggedVision.label",
  soundcheck: "game.soundcheck.label",
  "echo-hunt": "game.echoHunt.label",
  "quote-hunt": "game.quoteHunt.label",
  flashback: "game.flashback.label",
  estimate: "daily.game.estimate",
};

function storedVolume() {
  try {
    const raw = safeBrowserStorage("local").getItem(SETTINGS_KEY);
    const settings = raw ? (JSON.parse(raw) as { soundEnabled?: boolean; gameVolume?: number }) : {};
    if (settings.soundEnabled === false) return 0;
    return typeof settings.gameVolume === "number" ? settings.gameVolume : DEFAULT_GAME_VOLUME;
  } catch {
    return DEFAULT_GAME_VOLUME;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) throw new Error(`Daily request failed with ${response.status}.`);
  return (await response.json()) as T;
}

function msUntilLocalMidnight(now = new Date()) {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return midnight.getTime() - now.getTime();
}

function formatCountdown(milliseconds: number) {
  const minutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Plays a round's clips in order. The clue stage sets how much of each clip the server sends. */
function SoundButton({ round }: { round: DailyRoundPayload }) {
  const { t } = useLocale();
  const [playing, setPlaying] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const audio = round.question?.audio;
  const clips = audio?.clips ?? (audio?.src ? [audio.src] : []);
  const clipKey = clips.join("|");

  useEffect(
    () => () => {
      stopRef.current?.();
    },
    [clipKey],
  );

  if (!clips.length) return null;
  const play = async () => {
    stopRef.current?.();
    let stopped = false;
    let current: HTMLAudioElement | null = null;
    stopRef.current = () => {
      stopped = true;
      current?.pause();
      setPlaying(false);
    };
    setPlaying(true);
    const volume = storedVolume();
    for (const [index, src] of clips.entries()) {
      if (stopped) return;
      current = new Audio(src);
      current.volume = roundClipVolume(volume, audio?.gains?.[index]);
      try {
        await current.play();
        await new Promise<void>((resolve) => {
          current?.addEventListener("ended", () => resolve(), { once: true });
          current?.addEventListener("error", () => resolve(), { once: true });
        });
      } catch {
        break;
      }
    }
    if (!stopped) setPlaying(false);
  };

  return (
    <button
      type="button"
      className={styles.soundButton}
      onClick={play}
      data-testid="daily-play-sound"
      data-playing={playing}
    >
      <Play aria-hidden="true" />
      {playing ? t("daily.sound.playing") : t("daily.sound.play")}
    </button>
  );
}

function ChoiceBoard({
  round,
  revealed,
  selectedIndex,
  onChoose,
}: {
  round: DailyRoundPayload;
  revealed: boolean;
  selectedIndex: number | null;
  onChoose: (index: number) => void;
}) {
  const question = round.question!;
  const correctIndex = revealed ? question.reveal?.correctIndex : null;
  return (
    <div className={styles.choices} data-testid="daily-choices">
      {question.answers.map((answer, index) => {
        const image = question.answerImages?.[index];
        const state =
          correctIndex === index
            ? "correct"
            : revealed && selectedIndex === index
              ? "wrong"
              : revealed
                ? "idle"
                : "open";
        return (
          <button
            key={`${answer}:${index}`}
            type="button"
            className={styles.choice}
            data-state={state}
            data-testid="daily-choice"
            disabled={revealed}
            onClick={() => onChoose(index)}
          >
            <span className={styles.choiceLetter}>{"ABCD"[index]}</span>
            {image ? (
              <Image src={image} alt="" width={36} height={36} unoptimized className={styles.choiceImage} />
            ) : null}
            <span>{answer}</span>
            {state === "correct" ? <Check aria-hidden="true" /> : state === "wrong" ? <X aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}

function EstimateBoard({
  round,
  revealed,
  guess,
  onLock,
}: {
  round: DailyRoundPayload;
  revealed: boolean;
  guess: number | null;
  onLock: (value: number) => void;
}) {
  const { t, number } = useLocale();
  const estimate = round.estimate!;
  const { min, max, step } = estimate.slider;
  const middle = min + Math.round((max - min) / 2 / step) * step;
  const [value, setValue] = useState<number>(guess ?? middle);
  const shown = revealed && guess !== null ? guess : value;
  return (
    <div className={styles.estimate} data-testid="daily-estimate">
      <output className={styles.estimateValue} htmlFor="daily-estimate-range" data-testid="daily-estimate-value">
        {number(shown)}
        <small>{t(`daily.estimate.unit.${estimate.family}` as MessageKey)}</small>
      </output>
      <input
        id="daily-estimate-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        disabled={revealed}
        aria-label={t("daily.estimate.slider")}
        onChange={(event) => setValue(Number(event.target.value))}
        data-testid="daily-estimate-range"
      />
      <div className={styles.estimateScale} aria-hidden="true">
        <span>{number(min)}</span>
        <span>{number(max)}</span>
      </div>
      {revealed && estimate.reveal ? (
        <p className={styles.estimateAnswer} data-testid="daily-estimate-answer">
          {t("daily.estimate.answer", { answer: estimate.reveal.label })}
        </p>
      ) : (
        <button
          type="button"
          className={styles.primary}
          onClick={() => onLock(value)}
          data-testid="daily-estimate-lock"
        >
          {t("daily.answer.lock")}
        </button>
      )}
    </div>
  );
}

function RoundBody({
  round,
  revealed,
  answer,
  onAnswer,
}: {
  round: DailyRoundPayload;
  revealed: boolean;
  answer: DailyAnswer | null;
  onAnswer: (answer: DailyAnswer) => void;
}) {
  const { t } = useLocale();
  const phase = revealed ? "reveal" : "answering";
  const question = round.question;

  if (round.game === "estimate" && round.estimate) {
    const { subject, family } = round.estimate;
    return (
      <>
        <div className={styles.subject}>
          {subject.image ? (
            <Image src={subject.image} alt="" width={88} height={64} unoptimized className={styles.subjectImage} />
          ) : null}
          <div>
            <h2 className={styles.prompt} data-testid="daily-prompt">
              {t(`daily.estimate.prompt.${family}` as MessageKey, { name: subject.name })}
            </h2>
            {subject.context ? <p className={styles.muted}>{subject.context}</p> : null}
          </div>
        </div>
        <EstimateBoard
          key={`${round.day}:${round.slot}`}
          round={round}
          revealed={revealed}
          guess={answer?.value ?? null}
          onLock={(value) => onAnswer({ value })}
        />
      </>
    );
  }
  if (!question) return null;

  const heroGrid = question.answerMode === "hero-grid";
  return (
    <>
      <h2 className={styles.prompt} data-testid="daily-prompt">
        {question.prompt}
      </h2>
      {round.game === "fogged-vision" && question.image ? (
        <Image
          key={question.image.src}
          src={question.image.src}
          alt={question.image.alt}
          width={360}
          height={203}
          unoptimized
          className={styles.fogImage}
          data-testid="daily-fog-image"
        />
      ) : null}
      {round.game === "quote-hunt" && question.detail ? (
        <blockquote className={styles.quote} data-testid="daily-quote">
          “{question.detail}”
        </blockquote>
      ) : null}
      {round.game === "quote-hunt" && question.quoteHints?.length ? (
        <ol className={styles.hints} data-testid="daily-hints">
          {question.quoteHints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ol>
      ) : null}
      {round.game === "flashback" && question.detail ? <p className={styles.muted}>{question.detail}</p> : null}
      {round.game === "soundcheck" || round.game === "echo-hunt" ? <SoundButton round={round} /> : null}
      {heroGrid ? (
        <HeroPicker
          question={question}
          phase={phase}
          selectedKey={answer?.answerKey ?? null}
          crowd={EMPTY_CROWD}
          showShares={false}
          onChoose={(answerKey) => onAnswer({ answerKey })}
        />
      ) : question.answerMode === "item-grid" ? (
        <ShopkeeperStore
          question={question}
          phase={phase}
          selectedKey={answer?.answerKey ?? null}
          crowd={EMPTY_CROWD}
          showShares={false}
          onChoose={(answerKey) => onAnswer({ answerKey })}
        />
      ) : question.answerMode === "flashback-year" ? (
        <FlashbackYearBoard
          question={question}
          phase={phase}
          selectedKey={answer?.answerKey ?? null}
          onChoose={(answerKey) => onAnswer({ answerKey })}
        />
      ) : question.answerMode === "flashback-order" ? (
        <FlashbackOrderBoard
          question={question}
          phase={phase}
          selectedKey={answer?.answerKey ?? null}
          onChoose={(answerKey) => onAnswer({ answerKey })}
        />
      ) : (
        <ChoiceBoard
          round={round}
          revealed={revealed}
          selectedIndex={answer?.answerIndex ?? null}
          onChoose={(answerIndex) => onAnswer({ answerIndex })}
        />
      )}
    </>
  );
}

export function DailyArcade({ siteUrl }: { siteUrl: string }) {
  const { t, number } = useLocale();
  const [today, setToday] = useState<number | null>(null);
  const [state, setState] = useState<DailyState | null>(null);
  const [round, setRound] = useState<DailyRoundPayload | null>(null);
  const [revealSlot, setRevealSlot] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState("");
  const [attempt, setAttempt] = useState(0);
  const finishingRef = useRef(false);

  useEffect(() => {
    const load = window.setTimeout(() => {
      setToday(dailyNumberForDate());
      setState(readDailyState());
    }, 0);
    return () => window.clearTimeout(load);
  }, []);

  const day: DailyDayState | null = state && today ? (state.days[today] ?? emptyDay()) : null;
  const nextSlot = day ? day.results.findIndex((result) => result === null) : -1;
  const activeSlot = revealSlot ?? nextSlot;
  const stage = day && activeSlot >= 0 ? day.stages[activeSlot] : 1;
  const finishedAll = Boolean(day) && nextSlot === -1 && revealSlot === null;

  const save = useCallback(
    (next: DailyState) => {
      setState(next);
      if (today) writeDailyState(next, today);
    },
    [today],
  );

  // Load the open round at the clue stage the player has reached.
  useEffect(() => {
    if (!today || !day || revealSlot !== null || nextSlot < 0) return;
    const controller = new AbortController();
    requestJson<{ round: DailyRoundPayload }>(`/api/daily/round?day=${today}&slot=${nextSlot}&stage=${stage}`, {
      signal: controller.signal,
    })
      .then((body) => {
        setRound(body.round);
        setFailed(false);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.warn("Daily round failed.", error);
          setFailed(true);
        }
      });
    return () => controller.abort();
    // `day` changes identity on each save; the round depends only on these values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, nextSlot, stage, revealSlot, attempt]);

  // Finish once, then show today's figures.
  useEffect(() => {
    if (!finishedAll || !today || !state || !day) return;
    const points = day.results.map((result) => result?.points ?? 0);
    if (day.finished) {
      requestJson<{ summary: DailySummary }>(`/api/daily/summary?day=${today}&total=${dailyTotal(points)}`)
        .then((body) => setSummary(body.summary))
        .catch(() => setSummary(null));
      return;
    }
    if (finishingRef.current) return;
    finishingRef.current = true;
    const playedYesterday = state.streak?.lastDay === today - 1;
    const next = finishDay(state, today);
    save(next);
    requestJson<{ summary: DailySummary }>("/api/daily/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day: today, points, playedYesterday, streak: next.streak?.streak ?? 1 }),
    })
      .then((body) => setSummary(body.summary))
      .catch(() => setSummary(null));
  }, [finishedAll, today, state, day, save]);

  useEffect(() => {
    if (!finishedAll) return;
    const tick = () => setCountdown(formatCountdown(msUntilLocalMidnight()));
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, [finishedAll]);

  const openClue = () => {
    if (!state || !today || !day || activeSlot < 0 || stage >= 3) return;
    const stages = [...day.stages];
    stages[activeSlot] = stage + 1;
    save({ ...state, days: { ...state.days, [today]: { ...day, stages } } });
  };

  const submit = async (answer: DailyAnswer) => {
    if (!state || !today || !day || busy || revealSlot !== null || nextSlot < 0) return;
    setBusy(true);
    try {
      const body = await requestJson<{ points: number; correct: boolean; round: DailyRoundPayload }>(
        "/api/daily/answer",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ day: today, slot: nextSlot, stage, ...answer }),
        },
      );
      const results = [...day.results];
      results[nextSlot] = { points: body.points, correct: body.correct, answer, round: body.round };
      save({ ...state, days: { ...state.days, [today]: { ...day, results } } });
      setRevealSlot(nextSlot);
      setFailed(false);
    } catch (error) {
      console.warn("Daily answer failed.", error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (!today || !state || !day) {
    return <section className={styles.shell} data-testid="daily" data-state="loading" aria-busy="true" />;
  }

  const points = day.results.map((result) => result?.points ?? 0);
  const streak = currentDailyStreak(state.streak, today);

  if (finishedAll) {
    const share = dailyShareText(today, points, `${siteUrl}/daily`);
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(share);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2_000);
      } catch {
        setCopied(false);
      }
    };
    return (
      <section className={styles.shell} data-testid="daily" data-state="finished">
        <p className={styles.eyebrow}>{t("daily.title", { number: today })}</p>
        <h1 className={styles.title}>{t("daily.end.title")}</h1>
        <p className={styles.total} data-testid="daily-total">
          {t("daily.end.total", { total: dailyTotal(points), max: DAILY_MAX_POINTS })}
        </p>
        <div className={styles.endActions}>
          <button type="button" className={styles.primary} onClick={copy} data-testid="daily-share">
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? t("daily.end.copied") : t("daily.end.share")}
          </button>
          <a className={styles.secondary} href={PUBLIC_ARCADE_PATH} data-testid="daily-live-room">
            {t("daily.end.live")}
          </a>
        </div>
        <pre className={styles.sharePreview} data-testid="daily-share-text">
          {share}
        </pre>
        <dl className={styles.facts}>
          <div>
            <dt>
              <Flame aria-hidden="true" />
              {t("daily.end.streakLabel")}
            </dt>
            <dd data-testid="daily-streak">{t("daily.days", { count: streak })}</dd>
          </div>
          <div>
            <dt>{t("daily.end.crowdLabel")}</dt>
            <dd data-testid="daily-crowd">
              {summary && summary.players > 1 && typeof summary.beatShare === "number"
                ? t("daily.end.beat", { share: number(Math.round(summary.beatShare * 100)) })
                : t("daily.end.first")}
            </dd>
          </div>
          <div>
            <dt>{t("daily.end.nextLabel")}</dt>
            <dd data-testid="daily-next">{countdown}</dd>
          </div>
        </dl>
        <ol className={styles.resultGrid} data-testid="daily-result-grid">
          {DAILY_SLOTS.map((game, slot) => {
            const share = summary?.slots[slot]?.scoredShare;
            return (
              <li key={game} data-points={points[slot]}>
                <span className={styles.resultMark} aria-hidden="true">
                  {DAILY_RESULT_MARKS[points[slot]]}
                </span>
                <span>{t(GAME_LABELS[game])}</span>
                <strong>{t("daily.points", { count: points[slot] })}</strong>
                {typeof share === "number" ? (
                  <small>{t("daily.end.slotShare", { share: number(Math.round(share * 100)) })}</small>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>
    );
  }

  const result = revealSlot !== null ? day.results[revealSlot] : null;
  const shown = result ? result.round : round && round.slot === activeSlot && round.day === today ? round : null;
  const game = DAILY_SLOTS[activeSlot] as DailyGame;
  const worth = stage <= 3 && shown?.maxStage === 3 ? DAILY_ROUND_MAX_POINTS + 1 - stage : DAILY_ROUND_MAX_POINTS;

  return (
    <section
      className={styles.shell}
      data-testid="daily"
      data-state={result ? "reveal" : "answering"}
      data-slot={activeSlot}
    >
      <header className={styles.roundHeader}>
        <div>
          <p className={styles.eyebrow}>{t("daily.title", { number: today })}</p>
          <p className={styles.roundLabel} data-testid="daily-round-label">
            {t("daily.round", { current: activeSlot + 1, total: DAILY_SLOTS.length })} · {t(GAME_LABELS[game])}
          </p>
        </div>
        <ol className={styles.progress} aria-label={t("daily.progress")}>
          {DAILY_SLOTS.map((slotGame, slot) => (
            <li
              key={slotGame}
              data-state={day.results[slot] ? "done" : slot === activeSlot ? "current" : "next"}
              data-points={day.results[slot]?.points ?? ""}
            />
          ))}
        </ol>
      </header>
      {activeSlot === 0 && !result && day.results.every((entry) => entry === null) ? (
        <p className={styles.intro} data-testid="daily-intro">
          {t("daily.intro")}
        </p>
      ) : null}
      {failed ? (
        <div className={styles.error} role="alert" data-testid="daily-error">
          <p>{t("daily.error")}</p>
          <button type="button" className={styles.secondary} onClick={() => setAttempt((value) => value + 1)}>
            {t("daily.retry")}
          </button>
        </div>
      ) : null}
      {shown ? (
        <div className={clsx(styles.round, busy && styles.busy)} data-testid="daily-round" data-game={game}>
          <RoundBody round={shown} revealed={Boolean(result)} answer={result?.answer ?? null} onAnswer={submit} />
          <footer className={styles.roundFooter}>
            {result ? (
              <>
                <p className={styles.verdict} data-testid="daily-verdict" data-points={result.points}>
                  <span aria-hidden="true">{DAILY_RESULT_MARKS[result.points]}</span>
                  {result.points ? t("daily.reveal.points", { count: result.points }) : t("daily.reveal.miss")}
                </p>
                {shown.question?.reveal?.explanation ? (
                  <p className={styles.muted} data-testid="daily-explanation">
                    {shown.question.reveal.explanation}
                  </p>
                ) : null}
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => setRevealSlot(null)}
                  data-testid="daily-next-round"
                  autoFocus
                >
                  {nextSlot === -1 ? t("daily.results") : t("daily.next")}
                </button>
              </>
            ) : (
              <>
                <p className={styles.worth} data-testid="daily-worth">
                  {t("daily.worth", { count: worth })}
                </p>
                {shown.maxStage === 3 && stage < 3 ? (
                  <button type="button" className={styles.secondary} onClick={openClue} data-testid="daily-open-clue">
                    <Eye aria-hidden="true" />
                    {t("daily.clue.open", { next: stage + 1 })}
                  </button>
                ) : null}
              </>
            )}
          </footer>
        </div>
      ) : failed ? null : (
        <div className={styles.round} aria-busy="true" data-testid="daily-round-loading" />
      )}
    </section>
  );
}
