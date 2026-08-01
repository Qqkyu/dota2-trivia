import type { Metadata } from "next";
import Link from "next/link";
import { configuredDataCountries } from "@/lib/auth-session";
import styles from "./privacy.module.css";

export const metadata: Metadata = { title: "Privacy" };
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const dataCountries = configuredDataCountries();
  return (
    <main className={styles.page}>
      <Link href="/">← Queue Arcade</Link>
      <h1>Privacy, without fog.</h1>
      <p className={styles.intro}>
        Queue Arcade can be played anonymously. Connecting Steam is optional and exists only to preserve your personal
        records.
      </p>

      <section>
        <h2>When you play anonymously</h2>
        <p>
          The browser creates a random player identifier. The server salts and hashes it before storage. Raw public-room
          votes expire after two hours; anonymous question-level answer and report totals remain for content
          calibration.
        </p>
      </section>

      <section>
        <h2>Alpha measurements</h2>
        <p>
          To improve the arcade, we count visits, completed rounds, correct answers, and return visits. Player and visit
          identifiers are salted and hashed before they are stored; the private owner dashboard shows aggregates only.
          Alpha visit summaries expire after 30 days. The live “playing now” count stays only in server memory and
          forgets inactive players after 45 seconds.
        </p>
      </section>

      <section>
        <h2>When you connect Steam</h2>
        <p>We store only the data needed for your Queue Arcade profile:</p>
        <ul>
          <li>your verified SteamID;</li>
          <li>your current public Steam name and avatar when profile enrichment is configured;</li>
          <li>your Queue Arcade answers, timestamps, streaks, and format statistics;</li>
          <li>a one-way hash of the session token placed in your browser.</li>
        </ul>
        <p>We never receive or store your Steam password, Dota match history, friends list, or inventory.</p>
      </section>

      <section>
        <h2>Retention and deletion</h2>
        <p>
          Connected profile results remain until you delete the profile. Sessions expire after 30 days. “Delete profile”
          removes the Steam identity, sessions, and saved personal results together. Connected data is stored in{" "}
          <strong>{dataCountries}</strong>. Deletion also removes alpha visit summaries linked to that account.
        </p>
      </section>

      <section>
        <h2>Crash diagnostics</h2>
        <p>
          If the app fails, it sends a short error fingerprint, error type, and page path so the failure can be counted
          and fixed. Error text, stack traces, URL queries, and player identifiers are not sent by the browser.
        </p>
      </section>

      <section>
        <h2>Steam and contact</h2>
        <p>
          Steam authentication and optional public-profile enrichment are provided by Valve under the{" "}
          <a href="https://steamcommunity.com/dev/apiterms" target="_blank" rel="noreferrer">
            Steam Web API terms
          </a>
          . Steam data is presented as-is and as available, without a promise of accuracy or uninterrupted access; Valve
          and its suppliers limit liability as described in those terms. Queue Arcade is an unofficial fan project and
          is not affiliated with Valve. Questions about stored data can be opened in the project’s{" "}
          <a href="https://github.com/Qqkyu/dota2-trivia/issues" target="_blank" rel="noreferrer">
            GitHub issue tracker
          </a>
          .
        </p>
      </section>
    </main>
  );
}
