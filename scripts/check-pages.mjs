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
if (!privacy.includes('href="mailto:') || privacy.includes('href="https://github.com/Qqkyu/dota2-trivia/issues"')) {
  throw new Error("Privacy contact must work without access to the private repository.");
}
if (!privacy.includes('href="mailto:contact@queuearcade.com"') || !privacy.includes("Michał Kuliński")) {
  throw new Error("The privacy page does not name the controller and the contact address.");
}

const home = await page("/");
if (!home.includes('data-testid="start-arcade"') || !home.includes('data-testid="private-room-open"')) {
  throw new Error("Home is missing Play and Play with friends.");
}

const steam = await fetch(`${appUrl}/api/auth/steam?returnTo=${encodeURIComponent("/profile")}`, {
  redirect: "manual",
  cache: "no-store",
});
const steamLocation = steam.headers.get("location") ?? "";
const steamCookie = steam.headers.get("set-cookie") ?? "";
if (
  steam.status !== 302 ||
  !steamLocation.startsWith("https://steamcommunity.com/openid/login?") ||
  !steamCookie.includes("queue_arcade_steam_state=")
) {
  throw new Error("Steam sign-in did not redirect to Steam OpenID.");
}

const badCallback = await fetch(`${appUrl}/api/auth/steam/callback?openid.mode=id_res`, {
  redirect: "manual",
  cache: "no-store",
});
if (badCallback.status !== 303 || !badCallback.headers.get("location")?.includes("/profile?authError=steam")) {
  throw new Error("A fake Steam callback was not rejected.");
}

console.log("Validated profile, calibration, privacy, and Steam OpenID start/reject.");
