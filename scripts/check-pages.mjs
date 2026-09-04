#!/usr/bin/env node

/**
 * Loads profile, calibration, privacy, and Steam sign-in without a browser.
 */

const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function page(path) {
  const response = await fetch(`${appUrl}${path}`, { cache: "no-store" });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} returned ${response.status}.`);
  return text;
}

const profile = await page("/profile");
if (!profile.includes('data-testid="steam-sign-in"') || !profile.includes("/api/auth/steam")) {
  throw new Error("Profile is missing Steam sign-in.");
}

const calibration = await page("/calibration");
if (!calibration.includes('data-testid="calibration-dashboard"')) {
  throw new Error("Calibration lab did not render.");
}

const privacy = await page("/privacy");
if (!privacy.includes('data-testid="site-chrome"') || !privacy.includes('data-testid="site-footer"')) {
  throw new Error("Privacy page is missing site chrome.");
}

const home = await page("/");
if (!home.includes('data-testid="start-arcade"') || !home.includes('data-testid="private-room-open"')) {
  throw new Error("Home is missing Play and Play with friends.");
}

console.log("Validated profile, calibration, privacy, and Steam sign-in markup.");
