import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Clock3,
  Gamepad2,
  RefreshCw,
  Repeat2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { SiteChrome } from "@/components/site-chrome";
import { SiteFooter } from "@/components/site-footer";
import { SteamSignIn } from "@/components/steam-sign-in";
import { getAlphaOpsSnapshot, type AlphaFormatSignal } from "@/lib/alpha-ops";
import { getUserBySession } from "@/lib/account-store";
import { DEFAULT_GAME_ID, GAME_CATALOGS } from "@/lib/game-catalogs";
import { isQuestionReviewer } from "@/lib/question-review";
import { ACCOUNT_SESSION_COOKIE, sessionTokenHash } from "@/lib/steam-auth.mjs";
import styles from "./ops.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Alpha Ops",
  description: "Private Queue Arcade alpha health and player signals.",
  robots: { index: false, follow: false },
};

const SIGNAL_LABELS: Record<AlphaFormatSignal, string> = {
  collecting: "Collecting",
  healthy: "In range",
  "too-easy": "Too easy",
  "too-hard": "Too hard",
  reported: "Check reports",
};

function OpsGate({ state }: { state: "signed-out" | "denied" | "unavailable" }) {
  return (
    <SiteChrome current="ops">
      <main className={styles.gate} data-testid="ops-gate" data-access={state}>
        <section>
          {state === "unavailable" ? <AlertTriangle /> : <ShieldCheck />}
          <small>Private alpha operations</small>
          <h1>
            {state === "signed-out"
              ? "Steam sign-in required."
              : state === "denied"
                ? "Reviewer access required."
                : "Alpha data is temporarily unavailable."}
          </h1>
          <p>
            {state === "signed-out"
              ? "Use the Steam account allowlisted for question review."
              : state === "denied"
                ? "This page is limited to the Queue Arcade reviewer allowlist."
                : "The arcade is still playable; refresh this page once storage recovers."}
          </p>
          {state === "signed-out" && <SteamSignIn returnTo="/ops" className={styles.signIn} />}
          {state === "unavailable" && <Link href="/ops">Try again</Link>}
        </section>
      </main>
    </SiteChrome>
  );
}

export default async function OpsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCOUNT_SESSION_COOKIE)?.value;
  const user = token ? await getUserBySession(sessionTokenHash(token)).catch(() => null) : null;
  if (!user) return <OpsGate state="signed-out" />;
  if (!isQuestionReviewer(user)) return <OpsGate state="denied" />;

  const snapshot = await getAlphaOpsSnapshot().catch(() => null);
  if (!snapshot) return <OpsGate state="unavailable" />;
  const { sessions } = snapshot;
  const maxDailyRounds = Math.max(1, ...sessions.daily.map((day) => day.rounds));
  const catalog = GAME_CATALOGS[DEFAULT_GAME_ID];

  return (
    <main className={styles.shell} data-testid="ops-dashboard" data-access="granted">
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <span>
            <Image src={catalog.logoUrl} alt="" width={28} height={28} unoptimized />
          </span>
          <span>
            <strong>Queue Arcade</strong>
            <small>Alpha ops</small>
          </span>
        </Link>
        <div className={styles.headerActions}>
          <Link href="/calibration">
            <BarChart3 />
            Question lab
          </Link>
          <Link href="/ops">
            <RefreshCw />
            Refresh
          </Link>
          <Link href="/">
            <ArrowLeft />
            Arcade
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <span>
          <Activity /> Private alpha pulse
        </span>
        <h1>Is the arcade landing?</h1>
        <p>Anonymous visits from the last {sessions.windowDays} days. Format health uses current question revisions.</p>
      </section>

      <section className={styles.stats} aria-label="Alpha overview">
        <article>
          <Gamepad2 />
          <span>Playing now</span>
          <strong>{snapshot.activePlayers}</strong>
          <small>45-second room pulse</small>
        </article>
        <article>
          <Clock3 />
          <span>Visits</span>
          <strong>{sessions.sessions.toLocaleString("en-US")}</strong>
          <small>{sessions.averageMinutes} min average</small>
        </article>
        <article>
          <Users />
          <span>Players</span>
          <strong>{sessions.players.toLocaleString("en-US")}</strong>
          <small>salted anonymous count</small>
        </article>
        <article>
          <Repeat2 />
          <span>Return rate</span>
          <strong>{sessions.returnRate}%</strong>
          <small>{sessions.returningPlayers} came back</small>
        </article>
        <article>
          <BarChart3 />
          <span>Rounds / visit</span>
          <strong>{sessions.roundsPerSession}</strong>
          <small>{sessions.rounds.toLocaleString("en-US")} total rounds</small>
        </article>
      </section>

      <section className={styles.grid}>
        <article className={styles.activityPanel}>
          <header>
            <span>14-day activity</span>
            <strong>{sessions.accuracy}% answer accuracy</strong>
          </header>
          <div className={styles.chart} aria-label="Rounds by day">
            {sessions.daily.map((day) => (
              <div key={day.date} title={`${day.date}: ${day.rounds} rounds, ${day.players} players`}>
                <span
                  style={{ "--bar-height": `${Math.max(4, (day.rounds / maxDailyRounds) * 100)}%` } as CSSProperties}
                />
                <small>{day.date.slice(5)}</small>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className={styles.formatPanel}>
        <header>
          <div>
            <span>Format health</span>
            <small>20 answers before a difficulty call</small>
          </div>
          <strong>{catalog.contentLabel}</strong>
        </header>
        <div className={styles.formatTable} role="table" aria-label="Round format health">
          <div className={styles.formatHeader} role="row">
            <span>Round format</span>
            <span>Answers</span>
            <span>Accuracy</span>
            <span>Reports</span>
            <span>Signal</span>
          </div>
          {snapshot.formats.map((format) => (
            <div className={styles.formatRow} key={format.format} role="row" data-signal={format.signal}>
              <strong role="cell">{format.label}</strong>
              <span role="cell">{format.answers.toLocaleString("en-US")}</span>
              <span role="cell">{format.answers ? `${format.accuracy}%` : "—"}</span>
              <span role="cell">
                {format.reports} <small>{format.answers ? `· ${format.reportRate}%` : ""}</small>
              </span>
              <em role="cell">{SIGNAL_LABELS[format.signal]}</em>
            </div>
          ))}
        </div>
      </section>

      <footer>
        <ShieldCheck /> Session rows contain salted hashes and small aggregates only, then expire after{" "}
        {snapshot.retentionDays}
        days. Individual answers are not shown here.
      </footer>
      <SiteFooter current="ops" />
    </main>
  );
}
