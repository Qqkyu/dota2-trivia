import type { Metadata } from "next";
import { SiteChrome } from "@/components/site-chrome";
import { configuredDataCountries } from "@/lib/auth-session";
import styles from "./privacy.module.css";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Queue Arcade stores when you play anonymously or connect Steam, who processes it, where it is kept, and for how long.",
  alternates: { canonical: "/privacy" },
};
export const dynamic = "force-dynamic";

const CONTACT = "contact@queuearcade.com";
const UPDATED = "6 November 2026";

export default function PrivacyPage() {
  const dataCountries = configuredDataCountries();
  return (
    <SiteChrome current="privacy">
      <main className={styles.page}>
        <h1>Privacy, without fog.</h1>
        <p className={styles.intro}>
          Queue Arcade is a free fan project. You can play without an account. This page lists what the site stores,
          why, who else processes it, and for how long.
        </p>

        <section>
          <h2>Who is responsible</h2>
          <p>
            Michał Kuliński runs Queue Arcade and decides how its data is used. Under the GDPR he is the controller.
            Write to <a href={`mailto:${CONTACT}`}>{CONTACT}</a> with any question about your data.
          </p>
        </section>

        <section>
          <h2>What stays in your browser</h2>
          <ul>
            <li>a random player ID, so your answer counts once and you keep your seat in a party;</li>
            <li>your guest score, streak and lifetime statistics;</li>
            <li>
              your volume and mute settings, your party name, an unsent chat message and a few flags for sound playback;
            </li>
            <li>
              if you sign in with Steam, a session cookie (<code>queue_arcade_session</code>, 30 days) and, during
              sign-in only, a security cookie (<code>queue_arcade_steam_state</code>, 10 minutes).
            </li>
          </ul>
          <p>
            The game or a feature you chose needs each of these, so the site does not ask for cookie consent and shows
            no cookie banner. There are no advertising or tracking cookies. Clearing this site&apos;s data in your
            browser removes all of it.
          </p>
        </section>

        <section>
          <h2>What the server stores</h2>
          <ul>
            <li>
              Your answers, with a salted hash of your player ID instead of the ID itself. The server deletes single
              answers after two hours. Totals per question, such as how many players picked each answer, stay without
              any ID, so wrong or unfair questions can be found and fixed.
            </li>
            <li>
              Visit counts. Each visit gets a random ID that your browser does not keep. The server counts visits,
              rounds and correct answers to see which rounds work. It does not link visits to each other or to you, and
              it deletes these records after 30 days. The &quot;playing now&quot; number lives only in server memory for
              45 seconds.
            </li>
            <li>
              Question reports, with a salted hash of your player ID, so one player&apos;s report counts once. The
              server deletes that hash after 90 days and keeps only the number of reports.
            </li>
            <li>Party names and chat stay in server memory only and are gone when the party ends.</li>
            <li>
              Crash reports. If the page fails, your browser sends the error type, a short fingerprint, the page path
              and, if there is one, the framework&apos;s error code. It does not send error text, stack traces, URL
              queries or any ID.
            </li>
            <li>
              Your IP address, as a salted hash in memory only. It limits abuse such as vote flooding for about a
              minute, and it caps how many parties one connection can open for as long as a party you created exists.
              The server never writes it to storage.
            </li>
          </ul>
        </section>

        <section>
          <h2>When you sign in with Steam</h2>
          <p>We store only the data your profile needs:</p>
          <ul>
            <li>your verified SteamID;</li>
            <li>your current public Steam name and avatar, when Steam publishes them;</li>
            <li>your Queue Arcade answers, timestamps, streaks and statistics for each round type;</li>
            <li>a one-way hash of the session token in your browser.</li>
          </ul>
          <p>
            We never receive your Steam password, match history, friends list or inventory. Valve runs the sign-in on
            the Steam website under its own privacy policy, and the server asks Steam for your public name and avatar.
            Valve provides Steam authentication and profile data under the{" "}
            <a href="https://steamcommunity.com/dev/apiterms" target="_blank" rel="noreferrer">
              Steam Web API terms
            </a>
            , as available and without a promise of accuracy. Queue Arcade is not affiliated with Valve.
          </p>
        </section>

        <section>
          <h2>Game art</h2>
          <p>
            Hero, item and ability pictures and Steam avatars belong to Valve. Your browser loads them from this site,
            not from Valve. The server fetches each picture from Valve once and keeps a copy, so your IP address does
            not reach Valve while you play.
          </p>
        </section>

        <section>
          <h2>Why this is allowed</h2>
          <ul>
            <li>
              We keep your Steam profile and its results to provide the profile you sign up for (GDPR Article 6(1)(b)).
            </li>
            <li>
              Everything else on this page rests on our legitimate interest in running a fair, working and secure game
              (GDPR Article 6(1)(f)). You can object to it at any time; see your rights below.
            </li>
          </ul>
        </section>

        <section>
          <h2>Who else processes it</h2>
          <ul>
            <li>
              Render Services, Inc. hosts the site and its database in {dataCountries}. Render is a US company. Its data
              processing terms include the EU standard contractual clauses, and it is certified under the EU-US Data
              Privacy Framework. Render&apos;s network, run with Cloudflare, sees your IP address while it delivers the
              site.
            </li>
            <li>Valve, only when you sign in with Steam.</li>
          </ul>
          <p>No one else receives your data. The site has no ads and no analytics services.</p>
        </section>

        <section>
          <h2>How long</h2>
          <ul>
            <li>single answers: two hours;</li>
            <li>visit records: 30 days;</li>
            <li>Steam sign-in sessions: 30 days;</li>
            <li>the player hash on a question report: 90 days;</li>
            <li>your Steam profile and its results: until you delete the profile.</li>
          </ul>
          <p>
            The server removes expired records when it starts and once a minute while it runs. Deleted records can
            remain in database backups until those backups expire; the database host keeps its backups for 3 days.
          </p>
        </section>

        <section>
          <h2>Your rights</h2>
          <p>
            You can ask for a copy of your data, a correction, deletion, a restriction or a copy you can take elsewhere,
            and you can object to processing based on legitimate interest. Signed-in players can delete their profile,
            sessions and saved results themselves on the profile page. Guest data is linked only to the random ID in
            your browser, so clearing this site&apos;s data ends that link. For anything else, write to{" "}
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>
          <p>
            You can also complain to a data protection authority, such as the Polish{" "}
            <a href="https://uodo.gov.pl/en" target="_blank" rel="noreferrer">
              UODO
            </a>{" "}
            or the authority where you live.
          </p>
          <p className={styles.intro}>Last updated {UPDATED}.</p>
        </section>
      </main>
    </SiteChrome>
  );
}
