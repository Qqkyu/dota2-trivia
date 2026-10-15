#!/usr/bin/env node
/**
 * Synthetic LOCAL load only. Start a separate production server and empty store.
 * CAPACITY_ISOLATED=1 APP_URL=http://127.0.0.1:3313 node scripts/check-capacity.mjs
 * Add --full for ten rounds across the 1/20/50/100-seat matrix and mixed traffic.
 * --busy-chat rotates 10% of each party through chat each round, up to 10 messages.
 * --players=N sets the small-party size from one to 100; it cannot be combined with --full.
 * The server must use ARCADE_TRUST_PROXY=x-real-ip; addresses below are test inputs.
 * Uses the UI cadence: one-second private membership, five-second active rounds.
 * This is an HTTP/DB capacity check, not a browser or hosting-capacity benchmark.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { smokeVoteAnswer } from "./smoke-fixtures.mjs";

const args = process.argv.slice(2);
const full = args.includes("--full");
const busyChat = args.includes("--busy-chat");
const playersArg = args.find((arg) => arg.startsWith("--players="));
const smallPlayers = Number(playersArg?.split("=")[1] ?? 4);
assert(!full || !playersArg, "Use --players only for the small-party check");
assert(Number.isInteger(smallPlayers) && smallPlayers >= 1 && smallPlayers <= 100, "Use one to 100 players");
const roundsArg = args.find((arg) => arg.startsWith("--rounds="));
const roundCount = Number(roundsArg?.split("=")[1] ?? (full ? 10 : 2));
assert(
  args.every((arg) => arg === "--full" || arg === "--busy-chat" || /^--(?:rounds|players)=\d+$/.test(arg)),
  "Unknown capacity option",
);
assert(Number.isInteger(roundCount) && roundCount >= 1 && roundCount <= 20, "Use 1–20 rounds");
const origin = new URL(process.env.APP_URL ?? "http://127.0.0.1:3313");
assert(
  origin.protocol === "http:" &&
    ["127.0.0.1", "[::1]", "localhost"].includes(origin.hostname) &&
    !origin.username &&
    !origin.password &&
    origin.pathname === "/" &&
    !origin.search &&
    !origin.hash,
  "Capacity checks refuse remote URLs and require a local HTTP origin",
);
assert.equal(process.env.CAPACITY_ISOLATED, "1", "Set CAPACITY_ISOLATED=1 only for a separate synthetic test store");
const appUrl = origin.origin;
const runId = randomUUID().slice(0, 8);
const startedAt = Date.now();
const sourceSubnet = Number(process.env.CAPACITY_SOURCE_SUBNET ?? (Number.parseInt(runId.slice(0, 2), 16) % 254) + 1);
assert(
  Number.isInteger(sourceSubnet) && sourceSubnet >= 1 && sourceSubnet <= 254,
  "Use a fresh source subnet from 1 to 254",
);
const maxRuntimeMs = 15_000 + (roundCount + 2) * 22_000;
const outputPath = resolve(process.env.CAPACITY_OUTPUT ?? `/tmp/queue-arcade-capacity-${runId}.json`);
const heroes = JSON.parse(await readFile(new URL("../src/data/hero-picker.json", import.meta.url))).groups.flatMap(
  (group) => group.heroes,
);
const items = JSON.parse(
  await readFile(new URL("../src/data/shopkeeper-catalog.json", import.meta.url)),
).groups.flatMap((group) => group.items);
const scenarios = [];
let active = 0;
let peakActive = 0;
const waiters = [];
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, Math.max(0, ms)));
function boundedTime() {
  assert(Date.now() - startedAt < maxRuntimeMs, "Capacity run exceeded its time bound");
}
async function acquire() {
  if (active >= 256) {
    await new Promise((resolveWait) => waiters.push(resolveWait));
  } else {
    active += 1;
    peakActive = Math.max(peakActive, active);
  }
}
function release() {
  const next = waiters.shift();
  if (next) next();
  else active -= 1;
}
function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] * 100) / 100;
}
function summary(values) {
  return {
    count: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: values.length ? Math.round(Math.max(...values) * 100) / 100 : 0,
  };
}
function cohort(name, size, mode, groupNumber, options = {}) {
  const scenario = {
    name,
    size,
    mode,
    groupNumber,
    public: Boolean(options.public),
    media: Boolean(options.media),
    games: options.media ? ["fogged-vision", "soundcheck"] : ["trivia"],
    code: `CAP${runId}${groupNumber}`.toUpperCase(),
    requests: {},
    statuses: {},
    rounds: [],
    errors: [],
    mediaRequests: 0,
    mediaBytes: 0,
    maxMessageCount: 0,
    joined: 0,
    rejected101: false,
  };
  scenario.players = Array.from({ length: size }, (_, index) => ({
    id: `capacity-${runId}-${groupNumber}-${index}`,
    sessionId: randomUUID(),
    name: `Player ${index + 1}`,
    address: `10.${sourceSubnet}.${groupNumber}.${mode === "nat" ? 1 : index + 1}`,
    score: 0,
    correct: 0,
    recovered: 0,
    last: null,
  }));
  scenarios.push(scenario);
  return scenario;
}
async function request(scenario, player, path, { method = "GET", body, binary = false, expected = [200] } = {}) {
  boundedTime();
  const queuedAt = performance.now();
  await acquire();
  const begin = performance.now();
  const label = `${method} ${new URL(path, appUrl).pathname}`;
  try {
    const response = await fetch(new URL(path, appUrl), {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: { Origin: appUrl, "x-real-ip": player.address, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const bytes = await response.arrayBuffer();
    const payload = binary || method === "HEAD" ? null : JSON.parse(new TextDecoder().decode(bytes));
    const metric = (scenario.requests[label] ??= { durations: [], waits: [], bytes: 0 });
    metric.durations.push(performance.now() - begin);
    metric.waits.push(begin - queuedAt);
    metric.bytes += bytes.byteLength;
    scenario.statuses[response.status] = (scenario.statuses[response.status] ?? 0) + 1;
    assert(
      expected.includes(response.status),
      `${scenario.name}: ${label} returned ${response.status}: ${payload?.error ?? ""}`,
    );
    return { payload, response, bytes: bytes.byteLength };
  } finally {
    release();
  }
}
function roundPath(scenario, player, pending) {
  const query = new URLSearchParams({ gameId: "dota2", mode: "mixed", filter: "Mixed", playerId: player.id });
  if (!scenario.public) query.set("privateCode", scenario.code);
  if (pending) query.set("pendingRoundIds", pending);
  return `/api/rounds?${query}`;
}
async function readRound(scenario, player, pending) {
  return (await request(scenario, player, roundPath(scenario, player, pending))).payload;
}
async function touch(scenario, player) {
  return (
    await request(scenario, player, "/api/private-rooms", {
      method: "POST",
      body: { action: "touch", code: scenario.code, playerId: player.id },
    })
  ).payload;
}
function voteBody(scenario, player, snapshot, index) {
  return {
    gameId: "dota2",
    mode: "mixed",
    filter: "Mixed",
    ...(!scenario.public ? { privateCode: scenario.code } : {}),
    roundId: snapshot.round.id,
    voterId: player.id,
    sessionId: player.sessionId,
    ...smokeVoteAnswer(snapshot.question, index % 4, items, heroes),
  };
}
function answerMatches(answer, reveal) {
  return answer.answerKey !== undefined
    ? answer.answerKey === reveal.correctAnswerKey
    : answer.answerIndex === reveal.correctIndex;
}
function expectedPoints(question, round, vote, correct, correctCount, total) {
  if (!correct) return 0;
  const remaining = Math.max(0, Math.min(round.answerDuration, round.answerDeadline - vote.submittedAt));
  const speed = Math.round((100 * remaining) / round.answerDuration);
  const stage = remaining <= round.answerDuration / 3 ? 3 : remaining <= (round.answerDuration * 2) / 3 ? 2 : 1;
  const clueCost = ["spell-link", "aghanim-lab"].includes(round.game) ? 40 * (stage - 1) : 0;
  const base = Math.max(25, 100 + speed + 25 * (question.difficulty - 1) - clueCost);
  return base * (correctCount > 0 && correctCount * 2 < total ? 2 : 1);
}
async function mediaRead(scenario, snapshot) {
  if (!scenario.media) return;
  // A browser cancels clue requests when the answering clock ends. Do not start
  // a new probe from a snapshot taken just before that transition.
  if (snapshot.round.answerDeadline - Date.now() < 2000) {
    scenario.mediaSkippedNearDeadline = (scenario.mediaSkippedNearDeadline ?? 0) + 1;
    return;
  }
  const sources =
    snapshot.question?.audio?.clips ?? (snapshot.question?.audio?.src ? [snapshot.question.audio.src] : []);
  if (snapshot.question?.image?.src?.startsWith("/api/round-image")) sources.push(snapshot.question.image.src);
  for (const source of sources.slice(0, 2)) {
    assert(source.startsWith("/api/"), "Capacity media reads must go through the local app");
    const beganAt = Date.now();
    const outputs = await Promise.all(
      scenario.players.slice(0, 3).map(async (player) => {
        const url = new URL(source, appUrl);
        url.searchParams.set("playerId", player.id);
        const result = await request(scenario, player, url.pathname + url.search, {
          binary: true,
          expected: [200, 409],
        });
        if (result.response.status === 409) {
          assert(Date.now() >= snapshot.round.answerDeadline, "Media was rejected before its answering deadline");
          scenario.mediaExpiredInFlight = (scenario.mediaExpiredInFlight ?? 0) + 1;
          return null;
        }
        assert(result.bytes > 0, "Empty media payload");
        scenario.mediaRequests += 1;
        scenario.mediaBytes += result.bytes;
        return [result.response.headers.get("content-type"), result.bytes];
      }),
    );
    const successful = outputs.filter(Boolean);
    const boundaries = [
      5000,
      snapshot.round.game === "soundcheck" || snapshot.round.game === "echo-hunt" ? 8000 : 10000,
    ].map((offset) => snapshot.round.startedAt + offset);
    if (!boundaries.some((boundary) => beganAt < boundary && Date.now() >= boundary)) {
      assert(
        successful.every((entry) => JSON.stringify(entry) === JSON.stringify(successful[0])),
        "Shared media cut differs across callers within one clue stage",
      );
    }
  }
}
async function setup(scenario) {
  if (scenario.public) return;
  const host = scenario.players[0];
  await request(scenario, host, "/api/private-rooms", {
    method: "POST",
    body: { action: "create", code: scenario.code, playerId: host.id, name: host.name, games: scenario.games },
  });
  scenario.joined = 1;
  await Promise.all(
    scenario.players.slice(1).map(async (player) => {
      const result = await request(scenario, player, "/api/private-rooms", {
        method: "POST",
        body: { action: "join", code: scenario.code, playerId: player.id, name: player.name },
      });
      assert(result.payload.privateRoom.players.some((entry) => entry.self && entry.name === player.name));
      scenario.joined += 1;
    }),
  );
  if (scenario.size === 100) {
    const extra = { ...host, id: `capacity-${runId}-${scenario.groupNumber}-overflow` };
    const result = await request(scenario, extra, "/api/private-rooms", {
      method: "POST",
      body: { action: "join", code: scenario.code, playerId: extra.id, name: "Overflow" },
      expected: [409],
    });
    assert.equal(result.payload.error, "This party is full.");
    scenario.rejected101 = true;
  }
  const started = await request(scenario, host, "/api/private-rooms/start", {
    method: "POST",
    body: { code: scenario.code, playerId: host.id },
  });
  assert.equal(started.payload.privateRoom.players.length, scenario.size);
  await sleep(Math.max(0, started.payload.privateRoom.startedAt - Date.now()) + 100);
}
async function playRounds(scenario) {
  const host = scenario.players[0];
  for (let index = 0; index < roundCount; index += 1) {
    boundedTime();
    if (scenario.membershipError) throw scenario.membershipError;
    let initial = await readRound(scenario, host);
    if (initial.round.phase !== "answering" || initial.round.answerDeadline - initial.serverNow < 8_000) {
      await sleep(initial.round.revealDeadline - initial.serverNow + 150);
      initial = await readRound(scenario, host);
    }
    assert.equal(initial.round.phase, "answering");
    const snapshots = await Promise.all(scenario.players.map((player) => readRound(scenario, player, player.last?.id)));
    for (let playerIndex = 0; playerIndex < snapshots.length; playerIndex += 1) {
      const snapshot = snapshots[playerIndex];
      const player = scenario.players[playerIndex];
      assert.equal(snapshot.round.id, initial.round.id, `${scenario.name}: split round`);
      assert.equal(snapshot.round.answerDeadline, initial.round.answerDeadline);
      assert.equal(snapshot.question.reveal, null);
      assert.deepEqual(snapshot.crowd.counts, [0, 0, 0, 0]);
      assert.equal(snapshot.crowd.scoreSummary, null);
      assert.equal(snapshot.crowd.total, 0, "Use an empty synthetic store and separate public-room clients");
      if (player.last) {
        const recovered = snapshot.previousResults.find((entry) => entry.roundId === player.last.id);
        assert(recovered, `${scenario.name}: missing previous result for ${player.name}`);
        assert.equal(recovered.points, player.last.points);
        assert.equal(recovered.correct, player.last.correct);
        player.recovered += 1;
      }
    }
    const answers = scenario.players.map((player, playerIndex) => voteBody(scenario, player, initial, playerIndex));
    const votes = await Promise.all(
      scenario.players.map(async (player, playerIndex) => {
        const { payload } = await request(scenario, player, "/api/votes", {
          method: "POST",
          body: answers[playerIndex],
        });
        assert.equal(payload.accepted, true, `${scenario.name}: vote was not accepted`);
        assert.deepEqual(payload.counts, [0, 0, 0, 0]);
        assert.equal(payload.scoreSummary, null);
        assert.equal(payload.playerVote.answerIndex, answers[playerIndex].answerIndex);
        if (answers[playerIndex].answerKey !== undefined)
          assert.equal(payload.playerVote.answerKey, answers[playerIndex].answerKey);
        return payload.playerVote;
      }),
    );
    const duplicate = await request(scenario, host, "/api/votes", { method: "POST", body: answers[0] });
    assert.equal(duplicate.payload.accepted, false);
    assert.equal(duplicate.payload.total, scenario.size);
    assert.deepEqual(duplicate.payload.playerVote, votes[0]);
    if (!scenario.public) {
      const count = busyChat ? Math.max(1, Math.ceil(scenario.size / 10)) : 1;
      const texts = [];
      await Promise.all(
        Array.from({ length: count }, async (_, offset) => {
          const speaker = scenario.players[(index * count + offset) % scenario.size];
          const text = `Round ${index + 1} from ${speaker.name}`;
          texts.push(text);
          const chat = await request(scenario, speaker, "/api/private-rooms/messages", {
            method: "POST",
            body: { code: scenario.code, playerId: speaker.id, text },
          });
          assert(chat.payload.privateRoom.messages.some((message) => message.text === text));
          assert(chat.payload.privateRoom.messages.length <= 40);
        }),
      );
      scenario.chatTexts ??= [];
      scenario.chatTexts.push(...texts);
      const board = await touch(scenario, host);
      assert.deepEqual(
        board.privateRoom.messages.map((message) => message.text).sort(),
        scenario.chatTexts.slice(-40).sort(),
      );
      scenario.maxMessageCount = Math.max(scenario.maxMessageCount, board.privateRoom.messages.length);
    }
    await mediaRead(scenario, initial);
    // The final player deliberately misses the reveal. The next answering read
    // must recover that player's committed result without submitting a new vote.
    const returningIndex = scenario.size > 1 && index % 2 === 0 ? scenario.size - 1 : -1;
    if (returningIndex >= 0) scenario.players[returningIndex].pausedUntil = initial.round.revealDeadline + 150;
    let nextPoll = initial.round.startedAt + 5_000;
    const revealTime = initial.round.answerDeadline + 1_000;
    while (nextPoll < revealTime) {
      await sleep(nextPoll - Date.now());
      const activePlayers = scenario.players.filter((_, playerIndex) => playerIndex !== returningIndex);
      const polled = await Promise.all(
        activePlayers.map(async (player) => {
          const snapshot = await readRound(scenario, player);
          assert.equal(snapshot.round.id, initial.round.id);
          return snapshot;
        }),
      );
      if (polled[0]?.round.phase === "answering") await mediaRead(scenario, polled[0]);
      nextPoll += 5_000;
    }
    await sleep(revealTime - Date.now());
    const observer = await readRound(scenario, host);
    assert.equal(observer.round.id, initial.round.id);
    assert.equal(observer.round.phase, "reveal");
    assert.equal(observer.crowd.total, scenario.size);
    if (!scenario.public) assert.equal(observer.presence.activePlayers, scenario.size);
    const reveal = observer.question.reveal;
    assert(reveal, "Missing reveal");
    const correct = answers.map((answer) => answerMatches(answer, reveal));
    const correctCount = correct.filter(Boolean).length;
    assert.equal(observer.crowd.scoreSummary.correctCount, correctCount);
    if (answers[0].answerKey === undefined) {
      const counts = [0, 0, 0, 0];
      for (const answer of answers) counts[answer.answerIndex] += 1;
      assert.deepEqual(observer.crowd.counts, counts);
    } else {
      const counts = new Map();
      for (const answer of answers) counts.set(answer.answerKey, (counts.get(answer.answerKey) ?? 0) + 1);
      const observed = new Map(observer.crowd.keyCounts.map((entry) => [entry.answerKey, entry.count]));
      for (const [key, count] of counts) assert.equal(observed.get(key), count);
    }
    const points = votes.map((vote, playerIndex) =>
      expectedPoints(initial.question, initial.round, vote, correct[playerIndex], correctCount, scenario.size),
    );
    const revealed = await Promise.all(
      scenario.players.map(async (player, playerIndex) => {
        if (playerIndex === returningIndex) return null;
        const snapshot = await readRound(scenario, player);
        assert.equal(snapshot.round.id, initial.round.id);
        assert.equal(snapshot.crowd.total, scenario.size);
        assert.deepEqual(snapshot.playerVote, votes[playerIndex]);
        assert.equal(snapshot.crowd.scoreSummary.playerPoints, points[playerIndex]);
        return snapshot;
      }),
    );
    assert(revealed[0]);
    const correctPoints = points.filter((_, playerIndex) => correct[playerIndex]);
    assert.equal(
      observer.crowd.scoreSummary.average,
      correctPoints.length
        ? Math.round(correctPoints.reduce((sum, value) => sum + value, 0) / correctPoints.length)
        : null,
    );
    assert.equal(observer.crowd.scoreSummary.best, correctPoints.length ? Math.max(...correctPoints) : null);
    scenario.players.forEach((player, playerIndex) => {
      player.score += points[playerIndex];
      player.correct += Number(correct[playerIndex]);
      player.last = { id: initial.round.id, points: points[playerIndex], correct: correct[playerIndex] };
    });
    if (!scenario.public) {
      const board = await touch(scenario, host);
      assert.equal(board.privateRoom.players.length, scenario.size);
      for (const player of scenario.players)
        assert.equal(
          board.privateRoom.players.find((entry) => entry.name === player.name)?.score,
          player.score,
          `${scenario.name}: cumulative score for ${player.name}`,
        );
    }
    const late = await request(scenario, host, "/api/votes", { method: "POST", body: answers[0], expected: [409] });
    assert.match(late.payload.error, /closed|moved on/i);
    // Each real client warms the next audio source once it sees the reveal.
    // Do not delay its next round poll while a shared source warms.
    for (const [playerIndex, player] of scenario.players.entries()) {
      if (playerIndex === returningIndex) continue;
      const query = new URLSearchParams({ roundId: initial.round.id, playerId: player.id });
      const task = request(scenario, player, `/api/round-audio?${query}`, { method: "HEAD", expected: [204] })
        .catch((error) => {
          scenario.preloadError ??= error;
        })
        .finally(() => scenario.preloadPending.delete(task));
      scenario.preloadPending.add(task);
    }
    scenario.rounds.push({
      id: initial.round.id,
      game: initial.round.game,
      accepted: votes.length,
      correct: correctCount,
      totalPoints: points.reduce((sum, value) => sum + value, 0),
      skippedRevealPlayer: returningIndex,
    });
    console.log(
      `PASS ${scenario.name} round ${index + 1}/${roundCount}: ${votes.length} votes, ${correctCount} correct`,
    );
    if (index + 1 < roundCount) await sleep(initial.round.revealDeadline - Date.now() + 150);
  }
}
async function play(scenario) {
  await setup(scenario);
  await Promise.all(
    scenario.players.map(async (player) => {
      const result = await request(scenario, player, "/api/sessions", {
        method: "POST",
        body: { action: "start", sessionId: player.sessionId, voterId: player.id },
      });
      assert.equal(result.payload.accepted, true);
      player.sessionStarted = true;
    }),
  );
  scenario.preloadPending = new Set();
  const pending = new Set();
  const loading = new Set();
  const timer = scenario.public
    ? null
    : setInterval(() => {
        if (scenario.membershipError) return;
        for (const player of scenario.players) {
          if (player.pausedUntil > Date.now()) continue;
          if (loading.has(player.id)) {
            scenario.membershipSkipped = (scenario.membershipSkipped ?? 0) + 1;
            continue;
          }
          loading.add(player.id);
          const task = touch(scenario, player)
            .then(() => {
              scenario.membershipRequests = (scenario.membershipRequests ?? 0) + 1;
            })
            .catch((error) => {
              scenario.membershipError ??= error;
            })
            .finally(() => {
              loading.delete(player.id);
              pending.delete(task);
            });
          pending.add(task);
        }
      }, 1000);
  try {
    await playRounds(scenario);
    if (scenario.membershipError) throw scenario.membershipError;
  } finally {
    if (timer) clearInterval(timer);
    await Promise.all(pending);
    await Promise.all(scenario.preloadPending);
    delete scenario.preloadPending;
    if (scenario.preloadError) throw scenario.preloadError;
  }
}
async function cleanup(scenario) {
  await Promise.all(
    scenario.players
      .filter((player) => player.sessionStarted)
      .map(async (player) => {
        const result = await request(scenario, player, "/api/sessions", {
          method: "POST",
          body: { action: "finish", sessionId: player.sessionId, voterId: player.id },
        });
        assert.equal(result.payload.accepted, true);
      }),
  );
  if (scenario.public || !scenario.joined) return;
  for (let offset = 0; offset < scenario.players.length; offset += 25) {
    await Promise.all(
      scenario.players.slice(offset, offset + 25).map((player) =>
        request(scenario, player, "/api/private-rooms/leave", {
          method: "POST",
          body: { code: scenario.code, playerId: player.id },
          expected: [200, 403, 404],
        }),
      ),
    );
  }
}
async function expectedBursts() {
  const scenario = cohort("expected-throttles", 1, "nat", 240, { public: true });
  const player = scenario.players[0];
  const statuses = [];
  for (let index = 0; index < 20; index += 1) {
    const result = await request(scenario, player, "/api/votes", {
      method: "POST",
      body: {
        gameId: "dota2",
        mode: "mixed",
        filter: "Mixed",
        roundId: "capacity-expired-round",
        voterId: player.id,
        answerIndex: 0,
      },
      expected: [409, 429],
    });
    statuses.push(result.response.status);
    if (index >= 12) assert(Number(result.response.headers.get("retry-after")) >= 1);
  }
  assert.deepEqual(statuses.slice(0, 12), Array(12).fill(409));
  assert.deepEqual(statuses.slice(12), Array(8).fill(429));
  const admission = { ...player, address: `10.${sourceSubnet}.241.1` };
  for (let index = 0; index < 151; index += 1) {
    const caller = { ...admission, id: `capacity-${runId}-admission-${index}` };
    await request(scenario, caller, roundPath(scenario, caller), { expected: [index < 150 ? 200 : 429] });
  }
  scenario.burst = {
    expiredVotesBeforeThrottle: 12,
    rejectedVoteBurst: 8,
    admittedIdentities: 150,
    rejectedIdentity: 151,
  };
  console.log("PASS expected per-player and identity-admission throttles on separate addresses");
}
const cases = full
  ? [1, 20, 50, 100].flatMap((size, index) => [
      cohort(`${size}-seat-nat`, size, "nat", index * 2 + 1),
      cohort(`${size}-seat-distributed`, size, "distributed", index * 2 + 2),
    ])
  : [cohort("small-nat", smallPlayers, "nat", 1)];
if (full) {
  cases.push(cohort("mixed-party-a", 50, "nat", 20));
  cases.push(cohort("mixed-party-b", 50, "nat", 20));
  // Same source address, different identities and codes for the shared-NAT case.
  cases.at(-1).code += "B";
  cases.at(-1).players.forEach((player) => {
    player.id += "b";
  });
  cases.push(cohort("mixed-public", 20, "nat", 20, { public: true }));
  cases.at(-1).players.forEach((player) => {
    player.id += "p";
  });
  cases.push(cohort("small-media", 4, "distributed", 30, { media: true }));
}
let failed = false;
try {
  const results = await Promise.allSettled(cases.map((scenario) => play(scenario)));
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      failed = true;
      cases[index].errors.push(result.reason?.stack ?? String(result.reason));
      console.error(`FAIL ${cases[index].name}: ${result.reason?.message}`);
    }
  });
  await expectedBursts().catch((error) => {
    failed = true;
    scenarios.at(-1).errors.push(error.stack);
    console.error(error.message);
  });
} finally {
  for (const scenario of cases)
    await cleanup(scenario).catch((error) => {
      failed = true;
      scenario.errors.push(`Cleanup: ${error.message}`);
    });
  const result = {
    ok: !failed,
    runId,
    sourceSubnet,
    appUrl,
    full,
    busyChat,
    requestedRounds: roundCount,
    membershipPollMs: 1000,
    roundPollMs: 5000,
    startedAt,
    endedAt: Date.now(),
    peakOutstandingHttp: peakActive,
    maximumOutstandingHttp: 256,
    scenarios: scenarios.map(({ players, requests, ...scenario }) => ({
      ...scenario,
      players: players.map((player) => ({
        name: player.name,
        score: player.score,
        correct: player.correct,
        recovered: player.recovered,
        last: player.last,
      })),
      requests: Object.fromEntries(
        Object.entries(requests).map(([key, metric]) => [
          key,
          { latencyMs: summary(metric.durations), clientQueueMs: summary(metric.waits), bytes: metric.bytes },
        ]),
      ),
    })),
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(result, null, 2) + "\n");
  console.log(`Capacity result: ${outputPath}`);
}
if (failed) process.exitCode = 1;
