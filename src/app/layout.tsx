import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

const metadataBase = new URL(process.env.ARCADE_APP_URL?.trim() || "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "Queue Arcade — Dota side quests between matches",
    template: "%s · Queue Arcade",
  },
  description:
    "One synchronized Dota 2 queue-time arcade with rotating trivia, recipes, spells, fog, voices, sounds, quotes, and live public-room reveals.",
  applicationName: "Queue Arcade",
  category: "game",
  keywords: ["Dota 2", "minigames", "trivia", "quiz", "queue time", "abilities", "items", "heroes"],
  alternates: { canonical: "/" },
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
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
