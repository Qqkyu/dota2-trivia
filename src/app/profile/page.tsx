import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ProfileActions } from "@/components/profile-actions";
import { ProfileRecords } from "@/components/profile-records";
import { SiteChrome } from "@/components/site-chrome";
import { SteamAvatar } from "@/components/steam-avatar";
import { SteamSignIn } from "@/components/steam-sign-in";
import { getAccountProfile, getUserBySession } from "@/lib/account-store";
import { DEFAULT_GAME_ID } from "@/lib/game-catalogs";
import { getCalibrationSnapshot } from "@/lib/calibration-data";
import { formatPreviewsFromQuestions } from "@/lib/format-preview.mjs";
import { profileRecordsPreview } from "@/lib/profile-records-state.mjs";
import { compareFormatMastery } from "@/lib/round-identity.mjs";
import { triviaQuestions } from "@/lib/trivia";
import { ACCOUNT_SESSION_COOKIE, sessionTokenHash } from "@/lib/steam-auth.mjs";
import { logServerError } from "@/lib/server-diagnostics";
import { refreshSteamIdentityIfNeeded } from "@/lib/steam-profile";
import styles from "./profile.module.css";

export const metadata: Metadata = { title: "Profile", robots: { index: false, follow: true } };
export const dynamic = "force-dynamic";

const formatPreviews = formatPreviewsFromQuestions(triviaQuestions);

interface ProfilePageProps {
  searchParams: Promise<{
    authError?: string | string[];
    recordsPreview?: string | string[];
    signOut?: string | string[];
  }>;
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const params = await searchParams;
  const recordsPreview = Array.isArray(params.recordsPreview) ? params.recordsPreview[0] : params.recordsPreview;
  if (recordsPreview === "short" || recordsPreview === "long") {
    const fixture = profileRecordsPreview(recordsPreview);
    return (
      <main className={styles.page} data-testid="profile-records-preview" data-size={recordsPreview}>
        <ProfileRecords formats={fixture.formats} />
      </main>
    );
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ACCOUNT_SESSION_COOKIE)?.value;
  let profile = null;
  let unavailable = false;
  let roomRecords: Array<{ game: string; total: number; correct: number }> = [];
  try {
    const user = token ? await getUserBySession(sessionTokenHash(token)) : null;
    const enriched = user ? await refreshSteamIdentityIfNeeded(user) : null;
    profile = enriched ? await getAccountProfile(enriched.id, DEFAULT_GAME_ID) : null;
  } catch (error) {
    logServerError("profile.render", error);
    unavailable = true;
  }
  if (profile) {
    try {
      const calibration = await getCalibrationSnapshot(DEFAULT_GAME_ID);
      roomRecords = calibration.records.map((record) => ({
        game: record.game,
        total: record.total,
        correct: record.correct,
      }));
    } catch (error) {
      logServerError("profile.room-compare", error);
    }
  }

  if (unavailable) {
    return (
      <SiteChrome current="profile">
        <main className={styles.page} data-testid="profile-unavailable">
          <section className={styles.emptyCard} role="alert">
            <small>Personal records</small>
            <h1>Your profile is unavailable.</h1>
            <p>We could not load your records. Try again when the connection returns.</p>
            <a href="/profile">Try again</a>
          </section>
        </main>
      </SiteChrome>
    );
  }

  if (!profile) {
    return (
      <SiteChrome current="profile">
        <main className={styles.page} data-testid="profile-page" data-authenticated="false">
          <section className={styles.emptyCard}>
            <small>Personal records</small>
            <h1>Keep your streak.</h1>
            <p>
              Connect Steam to carry accuracy, streaks, early solves, and format mastery between browsers. Anonymous
              play stays available.
            </p>
            {params.authError && <p role="alert">Steam couldn’t verify that sign-in. Nothing was connected.</p>}
            <SteamSignIn className={styles.steamSignIn} />
          </section>
        </main>
      </SiteChrome>
    );
  }

  const { user, stats } = profile;
  return (
    <SiteChrome current="profile">
      <main className={styles.page} data-testid="profile-page" data-authenticated="true">
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
          <ProfileActions signOutFailed={params.signOut === "failed"} />
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
          formats={compareFormatMastery(stats.formats, roomRecords).map((row) => ({
            ...row,
            preview: formatPreviews[row.game],
          }))}
        />

        <p className={styles.privacyNote}>
          Only Queue Arcade answers made while connected are recorded. <Link href="/privacy">What we store</Link>
        </p>
      </main>
    </SiteChrome>
  );
}
