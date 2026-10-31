import { SiteChrome } from "@/components/site-chrome";
import styles from "./profile.module.css";

/**
 * Shown the instant a link to the profile is clicked, while the server reads
 * the session, the account and the room records. Without it the click gives
 * no sign for one to three seconds and gets repeated.
 */
export default function ProfileLoading() {
  return (
    <SiteChrome current="profile">
      <main className={styles.page} data-testid="profile-loading" aria-busy="true">
        <section className={styles.emptyCard}>
          <small>Personal records</small>
          <h1>Loading your records…</h1>
          <p>Accuracy, streaks, early solves and format mastery are on their way.</p>
        </section>
      </main>
    </SiteChrome>
  );
}
