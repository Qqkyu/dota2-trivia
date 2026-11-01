import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
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

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "Queue Arcade — Dota 2 trivia and minigames between matches",
    template: "%s · Queue Arcade",
  },
  description:
    "Free Dota 2 trivia for the wait between Find Match and Accept: 15-second rounds on heroes, items, spells, voice lines and patch history, with the whole room's answers at every reveal.",
  applicationName: "Queue Arcade",
  category: "game",
  keywords: ["Dota 2", "Dota 2 trivia", "Dota 2 quiz", "minigames", "queue time", "heroes", "items", "abilities"],
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Queue Arcade",
    title: "Queue Arcade — Dota side quests between matches",
    description: "One live Dota arcade for the seconds between Find Match and Accept.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Queue Arcade",
    description: "Dota side quests for the time between Find Match and Accept.",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#090b0c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${radianceBold.variable}`}>{children}</body>
    </html>
  );
}
