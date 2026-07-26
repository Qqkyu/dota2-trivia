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

export const metadata: Metadata = {
  title: {
    default: "Queue Arcade — Dota side quests between matches",
    template: "%s · Queue Arcade",
  },
  description:
    "Three fast Dota 2 queue-time minigames: classic trivia, Shopkeeper Rush, Spell Link, and a Mixed Arcade with shared answer splits.",
  applicationName: "Queue Arcade",
  category: "game",
  keywords: ["Dota 2", "minigames", "trivia", "quiz", "queue time", "abilities", "items", "heroes"],
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
