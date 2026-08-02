#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { recipeAnswerKeyForItems, recipeBuilderCorrectAnswerKey } from "../src/lib/item-picker.mjs";
import { PROGRESSIVE_ROUND_GAMES } from "../src/lib/player-profile.mjs";
import { questionCalibrationRevision } from "../src/lib/question-revision.mjs";
import { reviewerSteamIds } from "../src/lib/question-review.mjs";
import { ACCOUNT_SESSION_COOKIE, sessionTokenHash } from "../src/lib/steam-auth.mjs";

const appUrl = process.env.APP_URL ?? process.env.ARCADE_APP_URL ?? "http://localhost:3000";
const appOrigin = new URL(appUrl).origin;
const configuredReviewerIds = reviewerSteamIds();
const smokeReviewerSteamId = process.env.ARCADE_SMOKE_REVIEWER_STEAM_ID?.trim() || null;
if (smokeReviewerSteamId && !/^\d{17}$/.test(smokeReviewerSteamId)) {
  throw new Error("ARCADE_SMOKE_REVIEWER_STEAM_ID must be a 17-digit SteamID64.");
}
if (smokeReviewerSteamId && !configuredReviewerIds.includes(smokeReviewerSteamId)) {
  throw new Error("The smoke reviewer must also be present in ARCADE_REVIEWER_STEAM_IDS.");
}
const settings = {
  gameId: "dota2",
  mode: "mixed",
  filter: "Mixed",
};
const [generatedQuestions, shopkeeperQuestions, soundcheckQuestions, shopkeeperCatalog, heroPickerCatalog] =
  await Promise.all(
    [
      "questions.generated.json",
      "shopkeeper-questions.json",
      "soundcheck-questions.json",
      "shopkeeper-catalog.json",
      "hero-picker.json",
    ].map(async (file) => JSON.parse(await readFile(path.join(process.cwd(), "src", "data", file), "utf8"))),
  );
const privateQuestions = [...generatedQuestions, ...shopkeeperQuestions, ...soundcheckQuestions];
const shopkeeperCatalogItems = shopkeeperCatalog.groups.flatMap((group) => group.items);
const heroPickerHeroes = heroPickerCatalog.groups.flatMap((group) => group.heroes);
const firstPlayer = `multiplayer-smoke-a-${randomUUID()}`;
const secondPlayer = `multiplayer-smoke-b-${randomUUID()}`;
const alphaSessionId = randomUUID();
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const expectedStorageBackend = process.env.DATABASE_URL?.trim() ? "postgres" : "file";
const healthResponse = await fetch(`${appUrl}/api/health`, { cache: "no-store" });
const health = await healthResponse.json();

if (
  !healthResponse.ok ||
  health.status !== "ready" ||
  health.storage?.backend !== expectedStorageBackend ||
  health.accounts?.backend !== expectedStorageBackend ||
  health.alpha?.backend !== expectedStorageBackend ||
  health.alpha?.retentionDays !== 30 ||
  health.accounts?.ok !== true ||
  health.reviews?.reviewersConfigured !== configuredReviewerIds.length
) {
  throw new Error(
    `The readiness endpoint did not confirm the ${expectedStorageBackend} vote, account, and alpha stores.`,
  );
}

const invalidDiagnostic = await fetch(`${appUrl}/api/diagnostics`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "raw browser failure text" }),
});
const acceptedDiagnostic = await fetch(`${appUrl}/api/diagnostics`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ kind: "window-error", path: "/play?private=value", fingerprint: "a1b2c3d4" }),
});
if (invalidDiagnostic.status !== 400 || acceptedDiagnostic.status !== 202) {
  throw new Error("The browser diagnostic endpoint did not reject raw payloads and accept sanitized fingerprints.");
}

const authStart = await fetch(`${appUrl}/api/auth/steam?returnTo=${encodeURIComponent("/profile")}`, {
  redirect: "manual",
});
const authLocation = authStart.headers.get("location");
const authCookie = authStart.headers.get("set-cookie") ?? "";
if (
  authStart.status !== 302 ||
  !authLocation?.startsWith("https://steamcommunity.com/openid/login?") ||
  !authCookie.includes("queue_arcade_steam_state=") ||
  !/HttpOnly/i.test(authCookie) ||
  !/SameSite=Lax/i.test(authCookie)
) {
  throw new Error("Steam OpenID did not start with a protected state cookie and official provider redirect.");
}

const rejectedCallback = await fetch(`${appUrl}/api/auth/steam/callback?openid.mode=id_res`, { redirect: "manual" });
if (
  rejectedCallback.status !== 303 ||
  !rejectedCallback.headers.get("location")?.includes("/profile?authError=steam")
) {
  throw new Error("A Steam callback without matching signed state was not rejected safely.");
}

async function seedPostgresAccount() {
  if (expectedStorageBackend !== "postgres") return null;
  const { default: postgres } = await import("postgres");
  const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 2, prepare: false });
  const suffix = randomUUID().replaceAll("-", "");
  const userId = `usr_smoke_${suffix}`;
  const steamId = smokeReviewerSteamId ?? `7656119${suffix.replace(/\D/g, "").padEnd(10, "0").slice(0, 10)}`;
  const token = `smoke_${suffix}`;
  const secondToken = `smoke_alt_${suffix}`;
  const now = Date.now();
  try {
    await sql`
      INSERT INTO queue_arcade_users (id, created_at, updated_at)
      VALUES (${userId}, ${now}, ${now})
    `;
    await sql`
      INSERT INTO queue_arcade_user_identities (
        provider, provider_user_id, user_id, display_name, avatar_url, profile_url, updated_at
      )
      VALUES (
        'steam', ${steamId}, ${userId}, 'Smoke Tester', NULL,
        ${`https://steamcommunity.com/profiles/${steamId}`}, ${now}
      )
    `;
    await sql`
      INSERT INTO queue_arcade_user_sessions (token_hash, user_id, created_at, expires_at)
      VALUES (${sessionTokenHash(token)}, ${userId}, ${now}, ${now + 60 * 60 * 1_000})
    `;
    await sql`
      INSERT INTO queue_arcade_user_sessions (token_hash, user_id, created_at, expires_at)
      VALUES (${sessionTokenHash(secondToken)}, ${userId}, ${now}, ${now + 60 * 60 * 1_000})
    `;
  } finally {
    await sql.end({ timeout: 2 });
  }
  return {
    userId,
    steamId,
    token,
    secondToken,
    headers: { Cookie: `${ACCOUNT_SESSION_COOKIE}=${token}` },
    secondHeaders: { Cookie: `${ACCOUNT_SESSION_COOKIE}=${secondToken}` },
  };
}

const smokeAccount = await seedPostgresAccount();
const accountHeaders = smokeAccount?.headers ?? {};
const secondAccountHeaders = smokeAccount?.secondHeaders ?? accountHeaders;
const effectiveAlphaVoterId = smokeAccount ? `account:${smokeAccount.userId}` : firstPlayer;
const alphaSalt = process.env.ARCADE_VOTER_SALT || "queue-arcade-local-v1";
const alphaSessionHash = createHash("sha256")
  .update(`${alphaSalt}:alpha-session:${effectiveAlphaVoterId}:${alphaSessionId}`)
  .digest("base64url");
const alphaVisitorHash = createHash("sha256")
  .update(`${alphaSalt}:alpha-visitor:${effectiveAlphaVoterId}`)
  .digest("base64url");

const guestOpsResponse = await fetch(`${appUrl}/ops`, { cache: "no-store" });
const guestOpsPage = await guestOpsResponse.text();
if (!guestOpsResponse.ok || !guestOpsPage.includes('data-access="signed-out"')) {
  throw new Error("The private alpha dashboard did not gate anonymous visitors.");
}

if (smokeAccount) {
  const meResponse = await fetch(`${appUrl}/api/me`, { headers: accountHeaders, cache: "no-store" });
  const me = await meResponse.json();
  if (
    !meResponse.ok ||
    !me.authenticated ||
    me.profile?.user?.id !== smokeAccount.userId ||
    me.profile?.user?.steamId !== smokeAccount.steamId ||
    me.profile?.stats?.answered !== 0
  ) {
    throw new Error("The seeded Steam session did not resolve to an empty Queue Arcade profile.");
  }
}

function roomUrl(playerId, roomSettings = settings) {
  const query = new URLSearchParams({ ...roomSettings, playerId });
  return `${appUrl}/api/rounds?${query}`;
}

async function readRoom(playerId, roomSettings = settings, requestHeaders = {}) {
  const response = await fetch(roomUrl(playerId, roomSettings), { cache: "no-store", headers: requestHeaders });
  if (!response.ok) throw new Error(`Room request failed with ${response.status}.`);
  return response.json();
}

async function answeringRoundWithTime(playerId, roomSettings = settings, requestHeaders = {}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snapshot = await readRoom(playerId, roomSettings, requestHeaders);
    const timeLeft = snapshot.round.answerDeadline - snapshot.serverNow;
    if (snapshot.round.phase === "answering" && timeLeft >= 4_000) return snapshot;
    await delay(Math.max(250, snapshot.round.revealDeadline - snapshot.serverNow + 150));
  }
  throw new Error("Could not join an answering phase with enough time to run the smoke test.");
}

async function vote(snapshot, playerId, answerIndex, roomSettings = settings, extraFields = {}, requestHeaders = {}) {
  const answer =
    snapshot.question?.answerMode === "item-grid"
      ? { answerIndex: 0, answerKey: shopkeeperCatalogItems[answerIndex % shopkeeperCatalogItems.length].key }
      : snapshot.question?.answerMode === "item-recipe"
        ? {
            answerIndex: 0,
            answerKey: recipeAnswerKeyForItems(
              shopkeeperCatalogItems
                .slice(answerIndex, answerIndex + snapshot.question.shopkeeper.recipeSize)
                .map((item) => item.key),
            ),
          }
        : snapshot.question?.answerMode === "hero-grid"
          ? { answerIndex: 0, answerKey: heroPickerHeroes[answerIndex % heroPickerHeroes.length].key }
          : { answerIndex };
  const response = await fetch(`${appUrl}/api/votes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...requestHeaders,
    },
    body: JSON.stringify({
      ...roomSettings,
      roundId: snapshot.round.id,
      ...answer,
      voterId: playerId,
      ...extraFields,
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Vote failed with ${response.status}: ${JSON.stringify(result)}`);
  return result;
}

async function report(snapshot, playerId, reason, roomSettings = settings, requestHeaders = {}) {
  const response = await fetch(`${appUrl}/api/reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...requestHeaders,
    },
    body: JSON.stringify({
      ...roomSettings,
      roundId: snapshot.round.id,
      reason,
      voterId: playerId,
    }),
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

function privateQuestionFor(snapshot) {
  const publicQuestion = snapshot.question;
  const keyedRound = Boolean(publicQuestion?.answerMode);
  const revealedAnswerKey = publicQuestion?.reveal?.correctAnswerKey;
  const candidates = privateQuestions.filter(
    (question) =>
      question.kind === publicQuestion?.kind &&
      question.prompt === publicQuestion?.prompt &&
      (publicQuestion?.answerMode === "item-grid"
        ? revealedAnswerKey &&
          ((["build-result", "upgrade-path"].includes(question.shopkeeper?.format) &&
            question.shopkeeper.targetItemKey === revealedAnswerKey &&
            JSON.stringify(question.shopkeeper.promptItems) ===
              JSON.stringify(publicQuestion.shopkeeper.promptItems)) ||
            (question.soundcheck?.family === "item" &&
              question.soundcheck.format === "single" &&
              question.soundcheck.clips?.[0]?.subject === revealedAnswerKey &&
              question.explanation === publicQuestion.reveal.explanation))
        : publicQuestion?.answerMode === "item-recipe"
          ? revealedAnswerKey &&
            recipeBuilderCorrectAnswerKey(question) === revealedAnswerKey &&
            question.explanation === publicQuestion.reveal.explanation
          : keyedRound
            ? publicQuestion.answerMode === "hero-grid" && revealedAnswerKey
              ? (question.answerImages?.[question.correctIndex] ?? question.image?.src)?.includes(
                  `/${revealedAnswerKey.replace("npc_dota_hero_", "")}.png`,
                ) && question.explanation === publicQuestion.reveal.explanation
              : question.shopkeeper?.targetItemKey === revealedAnswerKey
            : JSON.stringify(question.answers) === JSON.stringify(publicQuestion?.answers)),
  );
  if (candidates.length !== 1) {
    throw new Error(
      `Could not resolve one private smoke-test question from the public payload (${candidates.length}).`,
    );
  }
  return candidates[0];
}

async function alphaSessionEvent(action, extraFields = {}, requestHeaders = {}, includeOrigin = true) {
  const response = await fetch(`${appUrl}/api/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(includeOrigin ? { Origin: appOrigin } : {}),
      ...requestHeaders,
    },
    body: JSON.stringify({ action, sessionId: alphaSessionId, voterId: firstPlayer, ...extraFields }),
  });
  return { status: response.status, body: await response.json() };
}

const crossOriginlessSession = await alphaSessionEvent("start", {}, accountHeaders, false);
const retiredFeedback = await alphaSessionEvent("feedback", { feedback: "fun" }, accountHeaders);
const startedAlphaSession = await alphaSessionEvent("start", {}, accountHeaders);
if (crossOriginlessSession.status !== 403 || retiredFeedback.status !== 400 || startedAlphaSession.status !== 200) {
  throw new Error("Alpha session writes do not enforce origin, retired actions, and valid starts.");
}

const firstSnapshot = await answeringRoundWithTime(firstPlayer, settings, accountHeaders);
const secondSnapshot = await readRoom(secondPlayer);
const cachedQuestionUrl = new URL(roomUrl(firstPlayer));
cachedQuestionUrl.searchParams.set("questionRevision", firstSnapshot.questionRevision);
const cachedQuestionResponse = await fetch(cachedQuestionUrl, { cache: "no-store", headers: accountHeaders });
const cachedQuestionSnapshot = await cachedQuestionResponse.json();

if (
  firstSnapshot.round.id !== secondSnapshot.round.id ||
  firstSnapshot.round.answerDeadline !== secondSnapshot.round.answerDeadline ||
  firstSnapshot.round.revealDeadline !== secondSnapshot.round.revealDeadline ||
  firstSnapshot.round.answerDuration !== 15_000 ||
  firstSnapshot.presence?.activePlayers < 1 ||
  secondSnapshot.presence?.activePlayers < 2 ||
  "skillLevel" in firstSnapshot.room ||
  "questionId" in firstSnapshot.round ||
  firstSnapshot.question?.id !== firstSnapshot.round.id ||
  firstSnapshot.question?.reveal !== null ||
  privateQuestions.some((question) => JSON.stringify(firstSnapshot.question).includes(question.id)) ||
  !cachedQuestionResponse.ok ||
  cachedQuestionSnapshot.round?.id !== firstSnapshot.round.id ||
  cachedQuestionSnapshot.questionRevision !== firstSnapshot.questionRevision ||
  cachedQuestionSnapshot.question !== null
) {
  throw new Error("The synchronized answering round is split, malformed, or leaking private catalog data.");
}

const legacySettings = [
  { gameId: "dota2", mode: "trivia", filter: "Heroes" },
  { gameId: "dota2", mode: "shopkeeper", filter: "Items" },
  { gameId: "dota2", mode: "fogged-vision", filter: "Mixed" },
  { gameId: "dota2", mode: "map-sense", filter: "Mixed" },
  { gameId: "dota2", mode: "counterplay", filter: "Mixed" },
  { gameId: "dota2", mode: "not-a-mode", filter: "not-a-filter" },
];
const legacyRooms = await Promise.all(
  legacySettings.map((roomSettings, index) =>
    readRoom(`multiplayer-legacy-room-${index}-${randomUUID()}`, roomSettings),
  ),
);
if (
  legacyRooms.some(
    (snapshot) =>
      snapshot.room.mode !== "mixed" ||
      snapshot.room.filter !== "Mixed" ||
      snapshot.room.id !== firstSnapshot.room.id ||
      snapshot.round.id !== firstSnapshot.round.id ||
      snapshot.question?.id !== firstSnapshot.question?.id,
  )
) {
  throw new Error("A legacy mode or category setting still splits the one public Queue Arcade room.");
}

if (firstSnapshot.crowd.counts.some((count) => count !== 0) || firstSnapshot.crowd.keyCounts?.length) {
  throw new Error("The answer split leaked before the reveal.");
}

const baselineTotal = firstSnapshot.crowd.total;
const [firstVote, secondVote] = await Promise.all([
  vote(firstSnapshot, firstPlayer, 0, settings, { sessionId: alphaSessionId }, accountHeaders),
  vote(secondSnapshot, secondPlayer, 1),
]);
const duplicateVote = await vote(
  firstSnapshot,
  smokeAccount ? `forged-player-${randomUUID()}` : firstPlayer,
  3,
  settings,
  {},
  secondAccountHeaders,
);

if (!firstVote.accepted || !secondVote.accepted || duplicateVote.accepted) {
  throw new Error(
    `Vote acceptance or duplicate-vote protection failed: ${JSON.stringify({ firstVote, secondVote, duplicateVote })}`,
  );
}

const finishedAlphaSession = await alphaSessionEvent("finish", {}, accountHeaders);
if (finishedAlphaSession.status !== 200) {
  throw new Error("A completed alpha visit could not be saved.");
}

if (duplicateVote.playerVote?.answerIndex !== firstVote.playerVote?.answerIndex) {
  throw new Error("A duplicate vote did not preserve the player’s original answer.");
}
if (duplicateVote.playerVote?.answerKey !== firstVote.playerVote?.answerKey) {
  throw new Error("A duplicate keyed vote did not preserve the player’s original choice.");
}

let accountProfileVerified = false;
let accountProfilePageVerified = false;
if (smokeAccount) {
  const meResponse = await fetch(`${appUrl}/api/me`, { headers: accountHeaders, cache: "no-store" });
  const me = await meResponse.json();
  const recent = me.profile?.stats?.recentRounds?.[0];
  if (
    !meResponse.ok ||
    !me.authenticated ||
    me.profile.stats.answered !== 1 ||
    ![0, 100].includes(me.profile.stats.accuracy) ||
    recent?.roundId !== firstSnapshot.round.id ||
    "questionId" in recent ||
    "questionRevision" in recent ||
    recent?.roundGame !== firstSnapshot.round.game ||
    typeof recent?.roundFormat !== "string" ||
    !recent.roundFormat ||
    (PROGRESSIVE_ROUND_GAMES.has(firstSnapshot.round.game)
      ? ![1, 2, 3].includes(recent.answerStage)
      : recent.answerStage !== null)
  ) {
    throw new Error("An authenticated vote did not create the expected personal result exactly once.");
  }
  accountProfileVerified = true;

  const profilePageResponse = await fetch(`${appUrl}/profile`, { headers: accountHeaders, cache: "no-store" });
  const profilePage = await profilePageResponse.text();
  if (
    !profilePageResponse.ok ||
    !profilePage.includes('data-authenticated="true"') ||
    !profilePage.includes("Smoke Tester") ||
    !profilePage.includes("Format mastery") ||
    !profilePage.includes("Recent answers")
  ) {
    throw new Error("The authenticated profile page did not render the saved personal record.");
  }
  accountProfilePageVerified = true;
}

const lockedSnapshot = await readRoom(
  smokeAccount ? `different-client-${randomUUID()}` : firstPlayer,
  settings,
  secondAccountHeaders,
);
if (
  lockedSnapshot.round.id !== firstSnapshot.round.id ||
  lockedSnapshot.playerVote?.answerIndex !== firstVote.playerVote?.answerIndex ||
  lockedSnapshot.playerVote?.answerKey !== firstVote.playerVote?.answerKey ||
  lockedSnapshot.crowd.total < baselineTotal + 2 ||
  lockedSnapshot.crowd.counts.some((count) => count !== 0) ||
  lockedSnapshot.crowd.keyCounts?.length
) {
  throw new Error("The answering-phase room state is not synchronized or is leaking results.");
}

const prematureReport = await report(lockedSnapshot, firstPlayer, "unclear", settings, accountHeaders);
if (prematureReport.status !== 409) {
  throw new Error("A question report was accepted before the synchronized reveal.");
}

await delay(Math.max(250, lockedSnapshot.round.answerDeadline - lockedSnapshot.serverNow + 200));
const revealSnapshot = await readRoom(firstPlayer, settings, accountHeaders);
const keyedRound = Boolean(revealSnapshot.question?.answerMode);
const revealedKeyVoteTotal = (revealSnapshot.crowd.keyCounts ?? []).reduce((total, entry) => total + entry.count, 0);

if (
  revealSnapshot.round.id !== firstSnapshot.round.id ||
  revealSnapshot.round.phase !== "reveal" ||
  revealSnapshot.question?.reveal === null ||
  typeof revealSnapshot.question?.reveal?.correctIndex !== "number" ||
  revealSnapshot.crowd.total < baselineTotal + 2 ||
  revealSnapshot.crowd.counts.reduce((sum, count) => sum + count, 0) !== revealSnapshot.crowd.total ||
  (keyedRound
    ? revealedKeyVoteTotal !== revealSnapshot.crowd.total || !revealSnapshot.playerVote?.answerKey
    : revealedKeyVoteTotal !== 0)
) {
  throw new Error("The synchronized reveal did not expose the final round split.");
}

const firstPrivateQuestion = privateQuestionFor(revealSnapshot);
const privateQuestionId = firstPrivateQuestion.id;
const privateCalibrationRevision = questionCalibrationRevision(firstPrivateQuestion);

const acceptedReport = await report(revealSnapshot, firstPlayer, "ambiguous", settings, accountHeaders);
const duplicateReport = await report(revealSnapshot, firstPlayer, "incorrect", settings, accountHeaders);
if (
  acceptedReport.status !== 200 ||
  !acceptedReport.body.accepted ||
  acceptedReport.body.reason !== "ambiguous" ||
  duplicateReport.status !== 200 ||
  duplicateReport.body.accepted ||
  duplicateReport.body.reason !== "ambiguous"
) {
  throw new Error("Question report acceptance or per-player deduplication failed.");
}

const reportedSnapshot = await readRoom(firstPlayer, settings, accountHeaders);
if (reportedSnapshot.round.id !== revealSnapshot.round.id || reportedSnapshot.playerReport !== "ambiguous") {
  throw new Error("The synchronized room did not restore the player's question report.");
}

await delay(Math.max(250, reportedSnapshot.round.revealDeadline - reportedSnapshot.serverNow + 200));
const carryoverSnapshot = await readRoom(secondPlayer);
if (carryoverSnapshot.round.id === revealSnapshot.round.id || carryoverSnapshot.round.phase !== "answering") {
  throw new Error("The room did not advance before the report carryover check.");
}

const carryoverReport = await report(revealSnapshot, secondPlayer, "outdated");
const carryoverDuplicate = await report(revealSnapshot, secondPlayer, "incorrect");
if (
  carryoverReport.status !== 200 ||
  !carryoverReport.body.accepted ||
  carryoverReport.body.reason !== "outdated" ||
  carryoverDuplicate.status !== 200 ||
  carryoverDuplicate.body.accepted ||
  carryoverDuplicate.body.reason !== "outdated"
) {
  throw new Error("The previous question could not be reported safely after the next round began.");
}

const rateLimitPlayer = `multiplayer-rate-limit-${randomUUID()}`;
const rateLimitResponses = [];
for (let attempt = 0; attempt < 13; attempt += 1) {
  rateLimitResponses.push(
    await fetch(`${appUrl}/api/votes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...settings,
        roundId: revealSnapshot.round.id,
        answerIndex: 0,
        voterId: rateLimitPlayer,
      }),
    }),
  );
}
if (
  rateLimitResponses.slice(0, 12).some((response) => response.status !== 409) ||
  rateLimitResponses[12]?.status !== 429 ||
  !rateLimitResponses[12]?.headers.get("retry-after")
) {
  throw new Error("The vote API did not apply its per-player production guardrail.");
}

const calibrationResponse = await fetch(`${appUrl}/api/calibration?gameId=dota2`, { cache: "no-store" });
const calibration = await calibrationResponse.json();
const calibratedQuestion = calibration.records?.find(
  (record) => record.questionRevision === privateCalibrationRevision,
);
const serializedCalibration = JSON.stringify(calibration);
if (
  !calibrationResponse.ok ||
  calibration.totals?.questions !== calibration.records?.length ||
  !calibratedQuestion ||
  calibratedQuestion.reports?.ambiguous < 1 ||
  calibratedQuestion.reports?.outdated < 1 ||
  calibratedQuestion.reportTotal < 2 ||
  calibratedQuestion.signal?.status !== "reported" ||
  calibratedQuestion.review?.status !== "open" ||
  calibratedQuestion.questionId !== calibratedQuestion.questionRevision ||
  serializedCalibration.includes(privateQuestionId) ||
  serializedCalibration.includes("reporters") ||
  serializedCalibration.includes(firstPlayer)
) {
  throw new Error("The calibration endpoint did not expose safe aggregate report signals.");
}

const reviewPayload = {
  gameId: "dota2",
  questionId: privateQuestionId,
  questionRevision: calibratedQuestion.questionRevision,
  state: "reviewed",
};
const unauthenticatedReview = await fetch(`${appUrl}/api/calibration`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json", Origin: appOrigin },
  body: JSON.stringify(reviewPayload),
});
if (unauthenticatedReview.status !== 401) {
  throw new Error("An anonymous player was allowed to mutate the question review queue.");
}

let reviewWorkflowVerified = false;
if (smokeAccount && smokeReviewerSteamId === smokeAccount.steamId) {
  const saveReview = await fetch(`${appUrl}/api/calibration`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Origin: appOrigin, ...accountHeaders },
    body: JSON.stringify(reviewPayload),
  });
  const savedReview = await saveReview.json();
  if (!saveReview.ok || savedReview.review?.status !== "reviewed") {
    throw new Error("The allowlisted Steam reviewer could not resolve an open question signal.");
  }

  const reviewedCalibration = await fetch(`${appUrl}/api/calibration?gameId=dota2`, { cache: "no-store" }).then(
    (response) => response.json(),
  );
  const reviewedQuestion = reviewedCalibration.records?.find(
    (record) => record.questionRevision === calibratedQuestion.questionRevision,
  );
  if (reviewedQuestion?.review?.status !== "reviewed") {
    throw new Error("The reviewed question state was not restored from persistent calibration storage.");
  }

  const reopeningReport = await report(revealSnapshot, `multiplayer-review-reopen-${randomUUID()}`, "unclear");
  if (reopeningReport.status !== 200 || !reopeningReport.body.accepted) {
    throw new Error("A fresh player report could not be recorded for the review reopening check.");
  }

  const reopenedCalibration = await fetch(`${appUrl}/api/calibration?gameId=dota2`, { cache: "no-store" }).then(
    (response) => response.json(),
  );
  const reopenedQuestion = reopenedCalibration.records?.find(
    (record) => record.questionRevision === calibratedQuestion.questionRevision,
  );
  if (reopenedQuestion?.review?.status !== "open") {
    throw new Error("A reviewed question did not reopen when a new independent report arrived.");
  }

  const quarantineReview = await fetch(`${appUrl}/api/calibration`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Origin: appOrigin, ...accountHeaders },
    body: JSON.stringify({ ...reviewPayload, state: "quarantined" }),
  });
  const quarantined = await quarantineReview.json();
  if (!quarantineReview.ok || quarantined.review?.status !== "quarantined") {
    throw new Error("The allowlisted Steam reviewer could not quarantine a reviewed question.");
  }
  reviewWorkflowVerified = true;
}

let alphaOpsVerified = false;
if (smokeAccount && smokeReviewerSteamId === smokeAccount.steamId) {
  const opsResponse = await fetch(`${appUrl}/ops`, { headers: accountHeaders, cache: "no-store" });
  const opsPage = await opsResponse.text();
  if (
    !opsResponse.ok ||
    !opsPage.includes('data-testid="ops-dashboard"') ||
    !opsPage.includes('data-access="granted"') ||
    !opsPage.includes("Format health") ||
    !opsPage.includes("Rounds / visit")
  ) {
    throw new Error("The allowlisted Steam reviewer could not open the private alpha dashboard.");
  }
  alphaOpsVerified = true;
}

let persisted;
let questionRevision;
let accountStoreVerified = false;

if (expectedStorageBackend === "postgres") {
  const { default: postgres } = await import("postgres");
  const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 2, prepare: false });
  try {
    const rounds = await sql`
      SELECT round_id, room_id
      FROM queue_arcade_rounds
      WHERE round_id = ${firstSnapshot.round.id}
    `;
    const questions = await sql`
      SELECT question_revision, report_ambiguous, report_outdated
      FROM queue_arcade_question_stats
      WHERE game_id = 'dota2' AND question_id = ${privateQuestionId}
      ORDER BY updated_at DESC
      LIMIT 1
    `;
    const voterHashes = await sql`
      SELECT voter_hash
      FROM queue_arcade_round_votes
      WHERE round_id = ${firstSnapshot.round.id}
    `;
    const reporterHashes = await sql`
      SELECT reporter_hash
      FROM queue_arcade_question_reporters
      WHERE game_id = 'dota2' AND question_id = ${privateQuestionId}
    `;
    const questionReviews = await sql`
      SELECT state, report_total_at_review, signal_status_at_review
      FROM queue_arcade_question_reviews
      WHERE game_id = 'dota2'
        AND question_id = ${privateQuestionId}
        AND question_revision = ${calibratedQuestion.questionRevision}
    `;
    const alphaSessions = await sql`
      SELECT session_hash, visitor_hash, started_at, last_seen_at, finished_at,
        rounds_answered, correct_answers
      FROM queue_arcade_alpha_sessions
      WHERE session_hash = ${alphaSessionHash}
    `;
    const personalRounds = smokeAccount
      ? await sql`
          SELECT round_id, question_id, round_game, round_format, correct, answer_stage, submitted_at
          FROM queue_arcade_player_rounds
          WHERE user_id = ${smokeAccount.userId} AND round_id = ${firstSnapshot.round.id}
        `
      : [];
    const sessions = smokeAccount
      ? await sql`
          SELECT token_hash
          FROM queue_arcade_user_sessions
          WHERE user_id = ${smokeAccount.userId}
        `
      : [];
    const storedText = JSON.stringify({ rounds, questions, voterHashes, reporterHashes, alphaSessions });
    persisted = rounds.length === 1;
    questionRevision = questions[0]?.question_revision;
    if (storedText.includes(firstPlayer) || storedText.includes(secondPlayer)) {
      throw new Error("A raw anonymous player ID was written to Postgres.");
    }
    if (
      voterHashes.length < 2 ||
      reporterHashes.length < 2 ||
      [...voterHashes, ...reporterHashes].some((row) => !/^[A-Za-z0-9_-]{43}$/.test(Object.values(row)[0]))
    ) {
      throw new Error("Postgres did not persist salted anonymous voter hashes.");
    }
    const alphaSession = alphaSessions[0];
    if (
      !alphaSession ||
      alphaSession.session_hash !== alphaSessionHash ||
      alphaSession.visitor_hash !== alphaVisitorHash ||
      Number(alphaSession.rounds_answered) !== 1 ||
      alphaSession.finished_at === null ||
      storedText.includes(alphaSessionId)
    ) {
      throw new Error("Postgres did not persist the minimal hashed alpha visit.");
    }
    if (Number(questions[0]?.report_ambiguous) < 1 || Number(questions[0]?.report_outdated) < 1) {
      throw new Error("The anonymous question reports were not written to Postgres.");
    }
    if (
      reviewWorkflowVerified &&
      (questionReviews.length !== 1 ||
        questionReviews[0]?.state !== "quarantined" ||
        Number(questionReviews[0]?.report_total_at_review) < 3 ||
        questionReviews[0]?.signal_status_at_review !== "reported")
    ) {
      throw new Error("The protected question review state was not persisted safely in Postgres.");
    }
    if (smokeAccount) {
      const personalRound = personalRounds[0];
      if (
        personalRounds.length !== 1 ||
        personalRound.round_id !== firstSnapshot.round.id ||
        personalRound.question_id !== privateQuestionId ||
        personalRound.round_game !== firstSnapshot.round.game ||
        typeof personalRound.round_format !== "string" ||
        !personalRound.round_format ||
        Number(personalRound.submitted_at) !== firstVote.playerVote.submittedAt ||
        typeof personalRound.correct !== "boolean" ||
        sessions.length !== 2 ||
        !sessions.some((session) => session.token_hash === sessionTokenHash(smokeAccount.token)) ||
        !sessions.some((session) => session.token_hash === sessionTokenHash(smokeAccount.secondToken)) ||
        JSON.stringify(sessions).includes(smokeAccount.token) ||
        JSON.stringify(sessions).includes(smokeAccount.secondToken)
      ) {
        throw new Error("Postgres did not persist the authenticated result and hashed session safely.");
      }
      accountStoreVerified = true;
    }
  } finally {
    await sql.end({ timeout: 2 });
  }
} else {
  const configuredDataFile = process.env.ARCADE_DATA_FILE?.trim();
  const dataFile = path.resolve(process.cwd(), configuredDataFile || ".data/queue-arcade-votes.json");
  const persistedText = await readFile(dataFile, "utf8");
  const persistedState = JSON.parse(persistedText);
  const question = Object.values(persistedState.questions ?? {}).find(
    (candidate) => candidate.questionId === privateQuestionId && candidate.questionRevision,
  );
  persisted = persistedText.includes(firstSnapshot.round.id) && persistedState.version === 3;
  questionRevision = question?.questionRevision;

  if (persistedText.includes(firstPlayer) || persistedText.includes(secondPlayer)) {
    throw new Error("A raw anonymous player ID was written to file storage.");
  }
  if (!persistedText.includes('"ambiguous"') || !persistedText.includes('"outdated"')) {
    throw new Error("The anonymous question reports were not written to file storage.");
  }
  const configuredAlphaFile = process.env.ARCADE_ALPHA_DATA_FILE?.trim();
  const alphaFile = path.resolve(process.cwd(), configuredAlphaFile || ".data/queue-arcade-alpha.json");
  const alphaText = await readFile(alphaFile, "utf8");
  const alphaState = JSON.parse(alphaText);
  const alphaSession = alphaState.sessions?.[alphaSessionHash];
  if (
    alphaState.version !== 1 ||
    !alphaSession ||
    alphaSession.visitorHash !== alphaVisitorHash ||
    alphaSession.roundsAnswered !== 1 ||
    !alphaSession.finishedAt ||
    alphaText.includes(firstPlayer) ||
    alphaText.includes(alphaSessionId)
  ) {
    throw new Error("The file backend did not persist the minimal hashed alpha visit safely.");
  }
}

if (!persisted) {
  throw new Error("The synchronized round was not written to persistent storage.");
}
if (!/^q1_[A-Za-z0-9_-]{22}$/.test(questionRevision ?? "")) {
  throw new Error("Persistent calibration data is not keyed by a stable question revision.");
}

let accountDeletionVerified = false;
if (smokeAccount) {
  const deletion = await fetch(`${appUrl}/api/me`, {
    method: "DELETE",
    headers: { ...accountHeaders, Origin: new URL(appUrl).origin },
  });
  const deletionBody = await deletion.json();
  const signedOut = await fetch(`${appUrl}/api/me`, { headers: accountHeaders, cache: "no-store" }).then((response) =>
    response.json(),
  );
  const secondSignedOut = await fetch(`${appUrl}/api/me`, {
    headers: secondAccountHeaders,
    cache: "no-store",
  }).then((response) => response.json());
  if (
    !deletion.ok ||
    !deletionBody.deleted ||
    signedOut.authenticated !== false ||
    secondSignedOut.authenticated !== false
  ) {
    throw new Error("Deleting a connected profile did not invalidate its active session.");
  }

  const { default: postgres } = await import("postgres");
  const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 2, prepare: false });
  try {
    const remaining = await sql`
      SELECT
        (SELECT COUNT(*) FROM queue_arcade_users WHERE id = ${smokeAccount.userId}) AS users,
        (SELECT COUNT(*) FROM queue_arcade_user_identities WHERE user_id = ${smokeAccount.userId}) AS identities,
        (SELECT COUNT(*) FROM queue_arcade_user_sessions WHERE user_id = ${smokeAccount.userId}) AS sessions,
        (SELECT COUNT(*) FROM queue_arcade_player_rounds WHERE user_id = ${smokeAccount.userId}) AS rounds,
        (SELECT COUNT(*) FROM queue_arcade_alpha_sessions WHERE session_hash = ${alphaSessionHash}) AS alpha_sessions
    `;
    if (Object.values(remaining[0] ?? {}).some((count) => Number(count) !== 0)) {
      throw new Error("Profile deletion did not cascade through identity, session, and result records.");
    }
    accountDeletionVerified = true;
  } finally {
    await sql.end({ timeout: 2 });
  }
}

console.log(
  JSON.stringify(
    {
      roomId: firstSnapshot.room.id,
      roundId: firstSnapshot.round.id,
      deadlinesMatch: true,
      hiddenDuringAnswering: true,
      duplicateRejected: true,
      finalTotal: revealSnapshot.crowd.total,
      persisted: true,
      persistenceBackend: expectedStorageBackend,
      steamOpenIdBoundaryVerified: true,
      accountProfileVerified,
      accountProfilePageVerified,
      accountStoreVerified,
      accountDeletionVerified,
      stableQuestionRevision: true,
      apiRateLimitVerified: true,
      voterIdsHashed: true,
      reportRejectedBeforeReveal: true,
      reportDeduplicated: true,
      playerReportRestored: true,
      reportCarriesIntoNextRound: true,
      calibrationAggregates: true,
      diagnosticsBoundaryVerified: true,
      reviewWorkflowVerified,
      roomPresenceVerified: firstSnapshot.presence?.activePlayers >= 1 && secondSnapshot.presence?.activePlayers >= 2,
      alphaSessionVerified: true,
      alphaOpsVerified,
      legacyModesCollapsedIntoPublicRoom: legacySettings.map(({ mode }) => mode),
      sharedDifficultyPoolVerified: true,
      legacyLevelSettingsIgnored: true,
      allPublicModeAndCategorySilosRemoved: true,
      questionPayloadCacheVerified: true,
    },
    null,
    2,
  ),
);
