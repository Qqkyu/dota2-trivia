import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ProfileActions } from "@/components/profile-actions";
import { ProfileRecords } from "@/components/profile-records";
import { SteamAvatar } from "@/components/steam-avatar";
import { SteamSignIn } from "@/components/steam-sign-in";
import { getAccountProfile, getUserBySession } from "@/lib/account-store";
import { DEFAULT_GAME_ID } from "@/lib/game-catalogs";
import { answerStageLabel, compactElapsedLabel, groupFormatMastery, liveRoundIdentity } from "@/lib/round-identity.mjs";
import { ACCOUNT_SESSION_COOKIE, sessionTokenHash } from "@/lib/steam-auth.mjs";
import { logServerError } from "@/lib/server-diagnostics";
import { refreshSteamIdentityIfNeeded } from "@/lib/steam-profile";
import styles from "./profile.module.css";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

interface ProfilePageProps {
  searchParams: Promise<{ authError?: string | string[] }>;
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCOUNT_SESSION_COOKIE)?.value;
  let profile = null;
  try {
    const user = token ? await getUserBySession(sessionTokenHash(token)) : null;
    const enriched = user ? await refreshSteamIdentityIfNeeded(user) : null;
    profile = enriched ? await getAccountProfile(enriched.id, DEFAULT_GAME_ID) : null;
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
        <SteamAvatar
          className={styles.avatar}
          fallbackClassName={styles.avatarFallback}
          src={user.avatarUrl}
          name={user.displayName}
          width={86}
          height={86}
        />
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

      <ProfileRecords
        formats={groupFormatMastery(stats.formats)}
        recent={stats.recentRounds.map((round) => {
          const identity = liveRoundIdentity(round.roundGame);
          const stage = answerStageLabel(round.answerStage);
          const elapsed = compactElapsedLabel(round.submittedAt);
          return {
            roundId: round.roundId,
            game: round.roundGame,
            label: identity?.label ?? round.roundGame,
            correct: round.correct,
            detail: [stage, elapsed].filter(Boolean).join(" · ") || null,
          };
        })}
      />

      <p className={styles.privacyNote}>
        Only Queue Arcade answers made while connected are recorded. <Link href="/privacy">What we store</Link>
      </p>
    </main>
  );
}
