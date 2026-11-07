import { Fragment, type ReactNode } from "react";
import type { Metadata } from "next";
import { SiteChrome } from "@/components/site-chrome";
import { getLocale, getTranslator } from "@/i18n/server";
import { configuredDataCountries } from "@/lib/auth-session";
import styles from "./privacy.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return {
    title: t("meta.privacy.title"),
    description: t("meta.privacy.description"),
    alternates: { canonical: "/privacy" },
  };
}
export const dynamic = "force-dynamic";

const CONTACT = "contact@queuearcade.com";
const UPDATED: Record<string, string> = { en: "7 November 2026", ru: "7 ноября 2026" };
/** ARCADE_DATA_COUNTRIES is English; a Russian sentence needs the prepositional case. */
const RUSSIAN_COUNTRIES: Record<string, string> = { Germany: "Германии" };

/** Puts links or code into the `{name}` slots of a message, so each sentence stays one message. */
function fill(message: string, slots: Record<string, ReactNode>) {
  return message.split(/(\{\w+\})/).map((part, index) => {
    const slot = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={index}>{slot && slot in slots ? slots[slot] : part}</Fragment>;
  });
}

export default async function PrivacyPage() {
  const locale = await getLocale();
  const t = await getTranslator();
  const dataCountries = configuredDataCountries();
  const email = <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;
  return (
    <SiteChrome current="privacy">
      <main className={styles.page}>
        <h1>{t("privacy.title")}</h1>
        <p className={styles.intro}>{t("privacy.intro")}</p>

        <section>
          <h2>{t("privacy.who.title")}</h2>
          <p>{fill(t("privacy.who.body"), { email })}</p>
        </section>

        <section>
          <h2>{t("privacy.browser.title")}</h2>
          <ul>
            <li>{t("privacy.browser.id")}</li>
            <li>{t("privacy.browser.score")}</li>
            <li>{t("privacy.browser.settings")}</li>
            <li>
              {fill(t("privacy.browser.cookies"), {
                sessionCookie: <code>queue_arcade_session</code>,
                stateCookie: <code>queue_arcade_steam_state</code>,
              })}
            </li>
          </ul>
          <p>{t("privacy.browser.note")}</p>
        </section>

        <section>
          <h2>{t("privacy.server.title")}</h2>
          <ul>
            <li>{t("privacy.server.answers")}</li>
            <li>{t("privacy.server.visits")}</li>
            <li>{t("privacy.server.reports")}</li>
            <li>{t("privacy.server.party")}</li>
            <li>{t("privacy.server.crashes")}</li>
            <li>{t("privacy.server.ip")}</li>
          </ul>
        </section>

        <section>
          <h2>{t("privacy.steam.title")}</h2>
          <p>{t("privacy.steam.intro")}</p>
          <ul>
            <li>{t("privacy.steam.id")}</li>
            <li>{t("privacy.steam.name")}</li>
            <li>{t("privacy.steam.answers")}</li>
            <li>{t("privacy.steam.session")}</li>
          </ul>
          <p>
            {fill(t("privacy.steam.body"), {
              link: (
                <a href="https://steamcommunity.com/dev/apiterms" target="_blank" rel="noreferrer">
                  {t("privacy.steam.termsLink")}
                </a>
              ),
            })}
          </p>
        </section>

        <section>
          <h2>{t("privacy.art.title")}</h2>
          <p>{t("privacy.art.body")}</p>
        </section>

        <section>
          <h2>{t("privacy.basis.title")}</h2>
          <ul>
            <li>{t("privacy.basis.contract")}</li>
            <li>{t("privacy.basis.interest")}</li>
          </ul>
        </section>

        <section>
          <h2>{t("privacy.processors.title")}</h2>
          <ul>
            <li>
              {t("privacy.processors.render", {
                countries: locale === "ru" ? (RUSSIAN_COUNTRIES[dataCountries] ?? dataCountries) : dataCountries,
              })}
            </li>
            <li>{t("privacy.processors.valve")}</li>
          </ul>
          <p>{t("privacy.processors.none")}</p>
        </section>

        <section>
          <h2>{t("privacy.retention.title")}</h2>
          <ul>
            <li>{t("privacy.retention.answers")}</li>
            <li>{t("privacy.retention.visits")}</li>
            <li>{t("privacy.retention.sessions")}</li>
            <li>{t("privacy.retention.reports")}</li>
            <li>{t("privacy.retention.profile")}</li>
          </ul>
          <p>{t("privacy.retention.body")}</p>
        </section>

        <section>
          <h2>{t("privacy.rights.title")}</h2>
          <p>{fill(t("privacy.rights.body"), { email })}</p>
          <p>
            {fill(t("privacy.rights.complaint"), {
              uodo: (
                <a href="https://uodo.gov.pl/en" target="_blank" rel="noreferrer">
                  UODO
                </a>
              ),
            })}
          </p>
          <p className={styles.intro}>{t("privacy.updated", { date: UPDATED[locale] })}</p>
        </section>
      </main>
    </SiteChrome>
  );
}
