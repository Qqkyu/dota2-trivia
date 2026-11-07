import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ProfileActions } from "@/components/profile-actions";
import { ProfileRecords } from "@/components/profile-records";
import { SiteChrome } from "@/components/site-chrome";
import { SteamAvatar } from "@/components/steam-avatar";
import { SteamSignIn } from "@/components/steam-sign-in";
import { formatNumber } from "@/i18n/format.mjs";
import { getLocale, getTranslator } from "@/i18n/server";
import { getAccountProfile, getUserBySession } from "@/lib/account-store";
import { DEFAULT_GAME_ID } from "@/lib/game-catalogs";
import { getCalibrationSnapshot } from "@/lib/calibration-data";
import { localizedFormatPreviews } from "@/lib/format-preview-locale";
import { profileRecordsPreview } from "@/lib/profile-records-state.mjs";
import { compareFormatMastery } from "@/lib/round-identity.mjs";
import { ACCOUNT_SESSION_COOKIE, sessionTokenHash } from "@/lib/steam-auth.mjs";
import { logServerError } from "@/lib/server-diagnostics";
import { refreshSteamIdentityIfNeeded } from "@/lib/steam-profile";
import styles from "./profile.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return { title: t("meta.profile.title"), robots: { index: false, follow: true } };
}

export const dynamic = "force-dynamic";

interface ProfilePageProps {
  searchParams: Promise<{
    authError?: string | string[];
    recordsPreview?: string | string[];
    signOut?: string | string[];
  }>;
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const params = await searchParams;
  const t = await getTranslator();
  const recordsPreview = Array.isArray(params.recordsPreview) ? params.recordsPreview[0] : params.recordsPreview;
  if (recordsPreview === "short" || recordsPreview === "long") {
    const fixture = profileRecordsPreview(recordsPreview, t);
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
            <small>{t("profile.eyebrow")}</small>
            <h1>{t("profile.unavailable.title")}</h1>
            <p>{t("profile.unavailable.body")}</p>
            <a href="/profile">{t("profile.unavailable.retry")}</a>
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
            <small>{t("profile.eyebrow")}</small>
            <h1>{t("profile.empty.title")}</h1>
            <p>{t("profile.empty.body")}</p>
            {params.authError && <p role="alert">{t("profile.authError")}</p>}
            <SteamSignIn className={styles.steamSignIn} />
          </section>
        </main>
      </SiteChrome>
    );
  }

  const { user, stats } = profile;
  const locale = await getLocale();
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
            <small>{t("profile.connected")}</small>
            <h1>{user.displayName}</h1>
            <a href={user.profileUrl} target="_blank" rel="noreferrer">
              {t("profile.steamLink")}
            </a>
          </div>
          <ProfileActions signOutFailed={params.signOut === "failed"} />
        </section>

        <section className={styles.stats} aria-label={t("profile.stats.label")}>
          <div className={styles.stat}>
            <span>{t("profile.stats.answers")}</span>
            <strong>{formatNumber(locale, stats.answered)}</strong>
          </div>
          <div className={styles.stat}>
            <span>{t("profile.stats.accuracy")}</span>
            <strong>{stats.accuracy}%</strong>
          </div>
          <div className={styles.stat}>
            <span>{t("profile.stats.bestStreak")}</span>
            <strong>{stats.bestStreak}</strong>
          </div>
          <div className={styles.stat}>
            <span>{t("profile.stats.liveStreak")}</span>
            <strong>{stats.currentStreak}</strong>
          </div>
          <div className={styles.stat}>
            <span>{t("profile.stats.bestTen")}</span>
            <strong>{stats.bestTenCorrect === null ? "—" : `${stats.bestTenCorrect}/10`}</strong>
          </div>
        </section>

        <ProfileRecords
          formats={compareFormatMastery(stats.formats, roomRecords).map((row) => ({
            ...row,
            preview: localizedFormatPreviews(locale)[row.game],
          }))}
        />

        <p className={styles.privacyNote}>
          {t("profile.privacyNote")} <Link href="/privacy">{t("profile.privacyLink")}</Link>
        </p>
      </main>
    </SiteChrome>
  );
}
