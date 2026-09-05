#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ARCADE_LOBBY_PATH,
  PARTY_ARCADE_PATH,
  PUBLIC_ARCADE_PATH,
  arcadeViewForPathname,
} from "../src/lib/arcade-navigation.mjs";
import { LIVE_ARCADE_MODES, PUBLIC_ARCADE_MODE } from "../src/lib/arcade-games.mjs";

const modes = [...LIVE_ARCADE_MODES];
const failures = [];

if (modes.length !== 1 || modes[0] !== PUBLIC_ARCADE_MODE) {
  failures.push("The game catalog exposes more than one public arcade room.");
}
if (
  ARCADE_LOBBY_PATH !== "/" ||
  PUBLIC_ARCADE_PATH !== "/play" ||
  PARTY_ARCADE_PATH !== "/party" ||
  arcadeViewForPathname(ARCADE_LOBBY_PATH) !== "lobby" ||
  arcadeViewForPathname(PUBLIC_ARCADE_PATH) !== "play" ||
  arcadeViewForPathname(PARTY_ARCADE_PATH) !== "party" ||
  arcadeViewForPathname("/calibration") !== "lobby"
) {
  failures.push("The lobby, party, and live arcade no longer resolve to distinct canonical paths.");
}

const [chromeSource, footerSource, profileSource, privacySource, globalCss, arcadeSource, partyPage] =
  await Promise.all(
    [
      "src/components/site-chrome.tsx",
      "src/components/site-footer.tsx",
      "src/app/profile/page.tsx",
      "src/app/privacy/page.tsx",
      "src/app/globals.css",
      "src/components/queue-arcade.tsx",
      "src/app/party/page.tsx",
    ].map((file) => readFile(path.join(process.cwd(), file), "utf8")),
  );
if (
  !chromeSource.includes('data-testid="site-home"') ||
  !chromeSource.includes("ARCADE_LOBBY_PATH") ||
  !footerSource.includes('data-testid="site-footer"') ||
  !footerSource.includes('href: "/profile"') ||
  !footerSource.includes('href: "/privacy"') ||
  !footerSource.includes('href: "/calibration"') ||
  !profileSource.includes('<SiteChrome current="profile"') ||
  !privacySource.includes('<SiteChrome current="privacy"') ||
  !globalCss.includes("scrollbar-gutter: stable")
) {
  failures.push("Non-play pages no longer share a home brand and Profile / Privacy / Calibration footer.");
}

if (
  !arcadeSource.includes("PARTY_ARCADE_PATH") ||
  !arcadeSource.includes("href={PARTY_ARCADE_PATH}") ||
  !partyPage.includes("partyStart")
) {
  failures.push("Play with friends must be a shareable /party link, not only client state.");
}

if (failures.length) {
  throw new Error(failures.join("\n"));
}

console.log("Navigation validation passed: canonical / and /play views plus legacy mode fallbacks are intact.");
