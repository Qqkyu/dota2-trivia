import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { LocaleProvider } from "@/i18n/provider";
import { getLocale, getTranslator, messagesFor } from "@/i18n/server";
import "./globals.css";

// HTML needs a fresh CSP nonce and the runtime public origin on every request.
export const dynamic = "force-dynamic";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});
// Subset of radiance-bold.otf (Latin, digits, punctuation) as WOFF2: 16 KB
// instead of 48 KB on the wire, and text paints in the fallback until it lands.
const radianceBold = localFont({
  src: "./fonts/radiance-bold.woff2",
  variable: "--font-radiance",
  weight: "700",
  display: "swap",
});

const metadataBase = new URL(process.env.ARCADE_APP_URL?.trim() || "http://localhost:3000");

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslator();
  return {
    metadataBase,
    title: {
      default: t("meta.title"),
      template: "%s · Queue Arcade",
    },
    description: t("meta.description"),
    applicationName: "Queue Arcade",
    category: "game",
    keywords: t("meta.keywords").split(", "),
    openGraph: {
      type: "website",
      url: "/",
      siteName: "Queue Arcade",
      title: t("meta.og.title"),
      description: t("meta.og.description"),
    },
    twitter: {
      card: "summary_large_image",
      title: "Queue Arcade",
      description: t("meta.twitter.description"),
    },
  };
}

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#090b0c",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className={`${geistSans.variable} ${geistMono.variable} ${radianceBold.variable}`}>
        <LocaleProvider locale={locale} messages={messagesFor(locale)}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
