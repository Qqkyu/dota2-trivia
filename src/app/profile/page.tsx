import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { ProfileActions } from "@/components/profile-actions";
import { SteamSignIn } from "@/components/steam-sign-in";
import { getAccountProfile, getUserBySession } from "@/lib/account-store";
import { DEFAULT_GAME_ID } from "@/lib/game-catalogs";
import { ACCOUNT_SESSION_COOKIE, sessionTokenHash } from "@/lib/steam-auth.mjs";
import { logServerError } from "@/lib/server-diagnostics";
import styles from "./profile.module.css";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

const FORMAT_LABELS: Record<string, string> = {
  "classic-ability-values": "Ability values",
  "classic-hero-stats": "Hero stats",
  "classic-item-prices": "Item prices",
  "shopkeeper-builds": "Shopkeeper builds",
  "shopkeeper-paths": "Shopkeeper paths",
  "spell-link": "Spell Link",
  "fogged-vision": "Fogged Vision",
  "echo-hunt": "Echo Hunt",
  soundcheck: "Soundcheck",
  "quote-hunt": "Quote Hunt",
  "aghanim-upgrades": "Aghanim's Lab",
  "value-order": "Order Up",
};

const ROUND_LABELS: Record<string, string> = {
  trivia: "Classic Trivia",
  shopkeeper: "Shopkeeper",
  "spell-link": "Spell Link",
  "fogged-vision": "Fogged Vision",
  "echo-hunt": "Echo Hunt",
  soundcheck: "Soundcheck",
  "quote-hunt": "Quote Hunt",
  "aghanim-lab": "Aghanim's Lab",
  "order-up": "Order Up",
};

interface ProfilePageProps {
  searchParams: Promise<{ authError?: string | string[] }>;
}

function playerInitials(displayName: string) {
  return Array.from(displayName).slice(0, 2).join("").toUpperCase();
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCOUNT_SESSION_COOKIE)?.value;
  let profile = null;
  try {
    const user = token ? await getUserBySession(sessionTokenHash(token)) : null;
    profile = user ? await getAccountProfile(user.id, DEFAULT_GAME_ID) : null;
  } catch (error) {
    logServerError("profile.render", error);
  }

  if (!profile) {
    return (
      <main className={styles.page} data-testid="profile-page" data-authenticated="false">
        <nav className={styles.topbar}>
          <Link href="/">← Queue Arcade</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
        <section className={styles.emptyCard}>
          <small>Personal records</small>
          <h1>Keep your streak.</h1>
          <p>
            Connect Steam to carry accuracy, streaks, early solves, and format mastery between browsers. Anonymous play
            stays available.
          </p>
          {params.authError && <p role="alert">Steam couldn’t verify that sign-in. Nothing was connected.</p>}
          <SteamSignIn className={styles.steamSignIn} />
        </section>
      </main>
    );
  }

  const { user, stats } = profile;
  return (
    <main className={styles.page} data-testid="profile-page" data-authenticated="true">
      <nav className={styles.topbar}>
        <Link href="/">← Queue Arcade</Link>
        <Link href="/privacy">Privacy</Link>
      </nav>

      <section className={styles.hero}>
        {user.avatarUrl ? (
          <Image className={styles.avatar} src={user.avatarUrl} alt="" width={86} height={86} />
        ) : (
          <span className={styles.avatarFallback}>{playerInitials(user.displayName)}</span>
        )}
        <div className={styles.heroCopy}>
          <small>Steam-connected player</small>
          <h1>{user.displayName}</h1>
          <a href={user.profileUrl} target="_blank" rel="noreferrer">
            View Steam profile ↗
          </a>
        </div>
        <ProfileActions />
      </section>

      <section className={styles.stats} aria-label="Lifetime records">
        <div className={styles.stat}>
          <span>Answers</span>
          <strong>{stats.answered.toLocaleString("en-US")}</strong>
        </div>
        <div className={styles.stat}>
          <span>Accuracy</span>
          <strong>{stats.accuracy}%</strong>
        </div>
        <div className={styles.stat}>
          <span>Best streak</span>
          <strong>{stats.bestStreak}</strong>
        </div>
        <div className={styles.stat}>
          <span>Live streak</span>
          <strong>{stats.currentStreak}</strong>
        </div>
        <div className={styles.stat}>
          <span>Best ten</span>
          <strong>{stats.bestTenCorrect === null ? "—" : `${stats.bestTenCorrect}/10`}</strong>
        </div>
      </section>

      <section className={styles.recordGrid}>
        <article className={styles.panel}>
          <header className={styles.formatHeader}>
            <span>Format mastery</span>
            <strong>{stats.firstStageCorrect} early solves</strong>
          </header>
          {stats.formats.length ? (
            stats.formats.map((format) => (
              <div className={styles.formatRow} key={format.format}>
                <span>{FORMAT_LABELS[format.format] ?? format.format}</span>
                <small>{format.answered} answers</small>
                <strong>{format.accuracy}%</strong>
              </div>
            ))
          ) : (
            <p className={styles.emptyRows}>Your first synchronized answer will start this profile.</p>
          )}
        </article>

        <article className={styles.panel}>
          <header className={styles.recentHeader}>
            <span>Recent answers</span>
            <strong>
              {stats.progressiveCorrect}/{stats.progressiveAnswered} staged
            </strong>
          </header>
          {stats.recentRounds.length ? (
            stats.recentRounds.map((round) => (
              <div
                className={`${styles.recentRow} ${round.correct ? styles.recentCorrect : styles.recentWrong}`}
                key={round.roundId}
              >
                <span>{ROUND_LABELS[round.roundGame] ?? round.roundGame}</span>
                <small>{round.answerStage ? `stage ${round.answerStage}` : `round ${round.roundNumber + 1}`}</small>
                <strong>{round.correct ? "✓" : "×"}</strong>
              </div>
            ))
          ) : (
            <p className={styles.emptyRows}>No connected rounds yet.</p>
          )}
        </article>
      </section>

      <p className={styles.privacyNote}>
        Only Queue Arcade answers made while connected are recorded. <Link href="/privacy">What we store</Link>
      </p>
    </main>
  );
}
