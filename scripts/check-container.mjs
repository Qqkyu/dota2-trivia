#!/usr/bin/env node
/** Local Docker only. Creates and removes only its own containers and network. */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

assert.equal(process.env.CONTAINER_ISOLATED, "1", "Set CONTAINER_ISOLATED=1 for this local synthetic container test");
const args = process.argv.slice(2);
assert(
  args.every(
    (arg) =>
      ["--full", "--skip-build", "--cold-media"].includes(arg) ||
      /^--players=\d+$/.test(arg) ||
      /^--rounds=\d+$/.test(arg),
  ),
  "Use --full, --skip-build, --cold-media, --players=N, and/or --rounds=N",
);
const full = args.includes("--full");
const workloadOptions = args.filter((arg) => /^--(?:players|rounds)=/.test(arg));
const playersOption = args.find((arg) => arg.startsWith("--players="));
const smallPlayers = Number(playersOption?.split("=")[1] ?? 4);
assert(!full || !playersOption, "Use --players only for the small-party check");
assert(Number.isInteger(smallPlayers) && smallPlayers >= 1 && smallPlayers <= 100, "Use one to 100 players");
const coldMediaPlayers = full ? 100 : smallPlayers;
const runs = Number(process.env.CONTAINER_RUNS ?? 1);
assert(Number.isInteger(runs) && runs >= 1 && runs <= 6, "Use one to six bounded workload runs");
const port = Number(process.env.CONTAINER_APP_PORT ?? 3323);
assert(Number.isInteger(port) && port >= 1024 && port <= 65535, "Invalid local app port");
const memoryMiB = Number(process.env.CONTAINER_MEMORY_MIB ?? 1024);
assert([512, 1024, 2048].includes(memoryMiB), "Use an explicit 512, 1024, or 2048 MiB app cap");
const cpus = Number(process.env.CONTAINER_CPUS ?? 1);
assert([0.1, 0.5, 1, 2].includes(cpus), "Use an explicit 0.1, 0.5, 1, or 2 CPU app quota");
const databaseCpus = Number(process.env.CONTAINER_DATABASE_CPUS ?? 1);
assert([0.1, 0.5, 1, 2].includes(databaseCpus), "Use an explicit 0.1, 0.5, 1, or 2 CPU database quota");
const databaseMemoryMiB = Number(process.env.CONTAINER_DATABASE_MEMORY_MIB ?? 512);
assert([256, 512, 1024].includes(databaseMemoryMiB), "Use an explicit 256, 512, or 1024 MiB database cap");
const docker = process.env.DOCKER_BIN ?? "docker";
const runId = randomBytes(4).toString("hex");
const prefix = `queue-arcade-check-${runId}`;
const image = process.env.CONTAINER_IMAGE ?? "queue-arcade-launch:local";
const output = resolve(process.env.CONTAINER_OUTPUT ?? `/tmp/${prefix}`);
await mkdir(output, { recursive: true, mode: 0o700 });
const secrets = [randomBytes(32).toString("hex"), randomBytes(32).toString("hex"), randomBytes(32).toString("hex")];
const clean = (value) => secrets.reduce((text, secret) => text.replaceAll(secret, "<redacted>"), value);
const windowsPath = (path) =>
  docker.endsWith(".exe") ? execFileSync("wslpath", ["-w", path], { encoding: "utf8" }).trim() : path;
async function command(binary, parameters, { input, log, env, allowFailure = false } = {}) {
  const child = spawn(binary, parameters, { env: env ?? process.env, stdio: ["pipe", "pipe", "pipe"] });
  const stream = log ? createWriteStream(join(output, log), { mode: 0o600 }) : null;
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (data) => {
    const text = clean(data.toString());
    stdout = (stdout + text).slice(-4_000_000);
    stream?.write(text);
  });
  child.stderr.on("data", (data) => {
    const text = clean(data.toString());
    stderr = (stderr + text).slice(-64_000);
    stream?.write(text);
  });
  child.stdin.end(input);
  const status = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code));
  });
  if (stream) await new Promise((resolveClose) => stream.end(resolveClose));
  if (status !== 0 && !allowFailure) {
    throw new Error(
      `${binary} ${parameters[0]} failed with exit ${status}: ${stderr.slice(-4000) || stdout.slice(-4000)}`,
    );
  }
  return { status, stdout, stderr };
}
const dock = (parameters, options) => command(docker, parameters, options);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const envFile = async (name, entries) => {
  const path = join(output, name);
  await writeFile(
    path,
    Object.entries(entries)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  return windowsPath(path);
};
const writeJson = (name, value) => writeFile(join(output, name), JSON.stringify(value, null, 2) + "\n");
const metricsSource = String.raw`
const fs = require('node:fs');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const {syncBuiltinESMExports} = require('node:module');
const {monitorEventLoopDelay,performance} = require('node:perf_hooks');
const delay = monitorEventLoopDelay({resolution:20});delay.enable();
let previousCpu=process.cpuUsage(),previousElu=performance.eventLoopUtilization();
const counts={fetches:{},ffmpegStarted:0,ffmpegCompleted:0,ffmpegFailed:0,ffmpegActive:0,ffmpegPeak:0};
const fetchOriginal=globalThis.fetch;
globalThis.fetch=async function(input,...rest){
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 const key=crypto.createHash('sha256').update(url.origin+url.pathname+url.search).digest('hex');
 if(url.protocol==='https:')counts.fetches[key]=(counts.fetches[key]??0)+1;
 return fetchOriginal.call(this,input,...rest);
};
const spawnOriginal=childProcess.spawn;
childProcess.spawn=function(command,...rest){
 const child=spawnOriginal.call(this,command,...rest);
 if(String(command).split('/').at(-1)==='ffmpeg'){
  counts.ffmpegStarted++;counts.ffmpegActive++;counts.ffmpegPeak=Math.max(counts.ffmpegPeak,counts.ffmpegActive);
  child.once('close',code=>{counts.ffmpegActive--;counts.ffmpegCompleted++;if(code!==0)counts.ffmpegFailed++;});
 }
 return child;
};syncBuiltinESMExports();
const cgroup=(name)=>{try{return fs.readFileSync('/sys/fs/cgroup/'+name,'utf8').trim();}catch{return null;}};
setInterval(()=>{
 const cpu=process.cpuUsage(),elu=performance.eventLoopUtilization();
 const row={at:Date.now(),pid:process.pid,memory:process.memoryUsage(),eventLoopMaxMs:delay.max/1e6,eventLoopP99Ms:delay.percentile(99)/1e6,eventLoopUtilization:performance.eventLoopUtilization(elu,previousElu).utilization,cpuUserMicros:cpu.user-previousCpu.user,cpuSystemMicros:cpu.system-previousCpu.system,cgroupMemory:cgroup('memory.current'),cgroupPeak:cgroup('memory.peak'),cgroupEvents:cgroup('memory.events'),cgroupCpu:cgroup('cpu.stat'),media:counts};
 fs.appendFileSync('/tmp/launch-process-'+process.pid+'.jsonl',JSON.stringify(row)+'\n');
 previousCpu=cpu;previousElu=elu;delay.reset();
},1000).unref();
`;
const network = `${prefix}-network`;
const pg = `${prefix}-postgres`;
const app = `${prefix}-app`;
const owned = [];
let networkCreated = false;
const report = {
  ok: false,
  runId,
  image,
  full,
  runs,
  limits: { cpus, memoryMiB, swapMiB: 0, databaseCpus, databaseMemoryMiB },
  startedAt: Date.now(),
  workloads: [],
};
try {
  const context = (await dock(["context", "inspect", "--format", "{{json .Endpoints.docker.Host}}"])).stdout.trim();
  const endpoint = process.env.DOCKER_HOST ?? JSON.parse(context);
  assert(/^(unix|npipe):/.test(endpoint), "This check refuses remote Docker endpoints");
  const info = JSON.parse((await dock(["info", "--format", "{{json .}}"])).stdout);
  for (const key of ["MemoryLimit", "SwapLimit", "CpuCfsQuota"]) assert.equal(info[key], true, `${key} unavailable`);
  report.engine = Object.fromEntries(
    ["ServerVersion", "OperatingSystem", "Architecture", "CgroupVersion", "NCPU", "MemTotal"].map((key) => [
      key,
      info[key],
    ]),
  );
  if (!args.includes("--skip-build")) {
    console.log("Building the repository Dockerfile with its content-review gate.");
    await dock(["build", "--tag", image, "--progress", "plain", windowsPath(process.cwd())], { log: "build.log" });
  }
  report.imageId = JSON.parse((await dock(["image", "inspect", image, "--format", "{{json .Id}}"])).stdout);
  await dock(["network", "create", network]);
  networkCreated = true;
  const pgEnv = await envFile("postgres.env", {
    POSTGRES_USER: "arcade_admin",
    POSTGRES_PASSWORD: secrets[0],
    POSTGRES_DB: "arcade_check",
  });
  const postgresImage = "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24";
  owned.push(pg);
  await dock([
    "run",
    "--detach",
    "--name",
    pg,
    "--network",
    network,
    "--network-alias",
    "database",
    "--cpus",
    String(databaseCpus),
    "--memory",
    `${databaseMemoryMiB}m`,
    "--memory-swap",
    `${databaseMemoryMiB}m`,
    "--env-file",
    pgEnv,
    postgresImage,
  ]);
  for (let attempt = 0; ; attempt++) {
    const ready = await dock(
      ["exec", pg, "pg_isready", "-h", "127.0.0.1", "-U", "arcade_admin", "-d", "arcade_check"],
      {
        allowFailure: true,
      },
    );
    if (ready.status === 0) break;
    assert(attempt < 60, "PostgreSQL startup timed out");
    await sleep(1000);
  }
  const databaseLimits = await dock([
    "exec",
    pg,
    "cat",
    "/sys/fs/cgroup/cpu.max",
    "/sys/fs/cgroup/memory.max",
    "/sys/fs/cgroup/memory.swap.max",
  ]);
  const [databaseCpu, databaseMemory, databaseSwap] = databaseLimits.stdout.trim().split("\n");
  const databaseVersion = await dock([
    "exec",
    pg,
    "psql",
    "-t",
    "-A",
    "-U",
    "arcade_admin",
    "-d",
    "arcade_check",
    "-c",
    "SHOW server_version",
  ]);
  report.databaseRuntime = {
    version: databaseVersion.stdout.trim(),
    cpu: databaseCpu,
    memory: databaseMemory,
    swap: databaseSwap,
  };
  const [databaseQuota, databasePeriod] = databaseCpu.split(" ").map(Number);
  assert.equal(databaseQuota / databasePeriod, databaseCpus);
  assert.equal(Number(databaseMemory), databaseMemoryMiB * 1024 ** 2);
  assert.equal(Number(databaseSwap), 0);
  await dock(
    ["exec", "--interactive", pg, "psql", "-v", "ON_ERROR_STOP=1", "-U", "arcade_admin", "-d", "arcade_check"],
    {
      input: `CREATE ROLE arcade_migration LOGIN PASSWORD '${secrets[1]}';
CREATE ROLE arcade_runtime LOGIN PASSWORD '${secrets[2]}';
ALTER DATABASE arcade_check OWNER TO arcade_migration;
ALTER SCHEMA public OWNER TO arcade_migration;
`,
    },
  );
  const migrationEnv = await envFile("migration.env", {
    DATABASE_URL: `postgres://arcade_migration:${secrets[1]}@database:5432/arcade_check`,
    ARCADE_DATABASE_RUNTIME_ROLE: "arcade_runtime",
  });
  for (const script of ["migrate-db.mjs", "grant-runtime-db.mjs"]) {
    console.log(`Checking packaged ${script}.`);
    await dock(["run", "--rm", "--network", network, "--env-file", migrationEnv, image, "node", `scripts/${script}`], {
      log: script + ".log",
    });
  }
  const appUrl = `http://127.0.0.1:${port}`;
  const appEnv = await envFile("app.env", {
    DATABASE_URL: `postgres://arcade_runtime:${secrets[2]}@database:5432/arcade_check`,
    DATABASE_POOL_SIZE: "5",
    ARCADE_AUTO_MIGRATE: "false",
    ARCADE_ALLOW_FILE_STORE: "false",
    ARCADE_APP_URL: appUrl,
    ARCADE_TRUST_PROXY: "x-real-ip",
    ARCADE_AUTH_SECRET: randomBytes(32).toString("hex"),
    ARCADE_VOTER_SALT: randomBytes(32).toString("hex"),
    ARCADE_DATA_COUNTRIES: "Isolated local synthetic test",
    NODE_OPTIONS: "--require=/tmp/launch-metrics.cjs",
  });
  owned.push(app);
  await dock([
    "create",
    "--name",
    app,
    "--network",
    network,
    "--publish",
    `127.0.0.1:${port}:3000`,
    "--cpus",
    String(cpus),
    "--memory",
    `${memoryMiB}m`,
    "--memory-swap",
    `${memoryMiB}m`,
    "--pids-limit",
    "256",
    "--env-file",
    appEnv,
    image,
  ]);
  const metricsPath = join(output, "launch-metrics.cjs");
  await writeFile(metricsPath, metricsSource);
  await dock(["cp", windowsPath(metricsPath), `${app}:/tmp/launch-metrics.cjs`]);
  await dock(["start", app]);
  let health;
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(appUrl + "/api/health", { signal: AbortSignal.timeout(2000) });
      health = await response.json();
      if (response.ok && health.status === "ready") break;
    } catch {}
    assert(attempt < 60, "Application readiness timed out");
    await sleep(1000);
  }
  for (const key of ["storage", "accounts", "alpha"]) assert.equal(health[key].backend, "postgres");
  report.health = health;
  const runtime = await dock([
    "exec",
    app,
    "node",
    "-e",
    `const fs=require('fs');console.log(JSON.stringify({node:process.version,uid:process.getuid(),buildId:fs.readFileSync('.next/BUILD_ID','utf8').trim(),cpu:fs.readFileSync('/sys/fs/cgroup/cpu.max','utf8').trim(),memory:fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim(),swap:fs.readFileSync('/sys/fs/cgroup/memory.swap.max','utf8').trim()}))`,
  ]);
  report.runtime = JSON.parse(runtime.stdout.trim());
  assert.equal(report.runtime.uid, 1001);
  assert(report.runtime.node.startsWith("v22."));
  assert.equal(Number(report.runtime.memory), memoryMiB * 1024 ** 2);
  assert.equal(Number(report.runtime.swap), 0);
  const [quota, period] = report.runtime.cpu.split(" ").map(Number);
  assert.equal(quota / period, cpus);
  await command(process.execPath, ["scripts/check-security-headers.mjs"], {
    env: { ...process.env, APP_URL: appUrl },
    log: "headers.log",
  });
  await dock([
    "exec",
    app,
    "ffmpeg",
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=44100",
    "-t",
    "0.1",
    "-threads",
    "1",
    "-f",
    "mp3",
    "-y",
    "/tmp/native-check.mp3",
  ]);
  const native = await dock([
    "exec",
    app,
    "node",
    "-e",
    "const fs=require('fs');const stat=fs.statSync('/tmp/native-check.mp3');if(!stat.size)process.exit(1);console.log(stat.size);fs.unlinkSync('/tmp/native-check.mp3')",
  ]);
  report.nativeEncodedBytes = Number(native.stdout.trim());
  if (full || args.includes("--cold-media")) {
    console.log(`Checking ${coldMediaPlayers} concurrent readers of cold Soundcheck, Echo Hunt, and image stages.`);
    await command(process.execPath, ["scripts/check-cold-media.mjs"], {
      env: {
        ...process.env,
        APP_URL: appUrl,
        CAPACITY_ISOLATED: "1",
        COLD_MEDIA_PLAYERS: String(coldMediaPlayers),
        COLD_MEDIA_OUTPUT: join(output, "cold-media.json"),
      },
      log: "cold-media.log",
    });
    await sleep(1100);
    const mediaCounters = await dock([
      "exec",
      app,
      "node",
      "-e",
      "const fs=require('fs');const rows=fs.readdirSync('/tmp').filter(n=>/^launch-process-\\d+\\.jsonl$/.test(n)).map(n=>JSON.parse(fs.readFileSync('/tmp/'+n,'utf8').trim().split('\\n').at(-1)));console.log(JSON.stringify(rows.map(r=>r.media)))",
    ]);
    report.coldMedia = JSON.parse(await readFile(join(output, "cold-media.json"), "utf8"));
    report.coldMedia.processCounters = JSON.parse(mediaCounters.stdout.trim());
    const conversions = report.coldMedia.processCounters.reduce((total, counts) => total + counts.ffmpegStarted, 0);
    const failedConversions = report.coldMedia.processCounters.reduce(
      (total, counts) => total + counts.ffmpegFailed,
      0,
    );
    assert.equal(conversions, 2, "The two shared MP3 clue cuts must each spawn ffmpeg only once");
    assert.equal(failedConversions, 0, "A cold MP3 clue conversion failed");
  }
  for (let index = 0; index < runs; index++) {
    console.log(`Running ${full ? "466-player" : "small-party"} workload ${index + 1}/${runs}.`);
    const resultPath = join(output, `capacity-${index + 1}.json`);
    const result = await command(
      process.execPath,
      ["scripts/check-capacity.mjs", ...(full ? ["--full", "--busy-chat"] : []), ...workloadOptions],
      {
        env: {
          ...process.env,
          APP_URL: appUrl,
          CAPACITY_ISOLATED: "1",
          CAPACITY_SOURCE_SUBNET: String(100 + index),
          CAPACITY_OUTPUT: resultPath,
        },
        log: `capacity-${index + 1}.log`,
        allowFailure: true,
      },
    );
    const capacity = JSON.parse(await readFile(resultPath, "utf8"));
    report.workloads.push({
      ok: capacity.ok,
      startedAt: capacity.startedAt,
      endedAt: capacity.endedAt,
      file: `capacity-${index + 1}.json`,
    });
    assert.equal(result.status, 0, `Workload ${index + 1} failed; inspect its JSON and log`);
  }
  const aggregateSql = `SELECT json_build_object('sessions',COUNT(*),'finished',COUNT(finished_at),'rounds',COALESCE(SUM(rounds_answered),0),'correct',COALESCE(SUM(correct_answers),0)) FROM queue_arcade_alpha_sessions; SELECT COUNT(*) FROM queue_arcade_alpha_round_events;`;
  const aggregate = await dock(
    [
      "exec",
      "--interactive",
      pg,
      "psql",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "arcade_admin",
      "-d",
      "arcade_check",
    ],
    { input: aggregateSql },
  );
  const [counts, events] = aggregate.stdout.trim().split("\n");
  report.database = { ...JSON.parse(counts), events: Number(events) };
  const all = await Promise.all(
    report.workloads.map(async (workload) => JSON.parse(await readFile(join(output, workload.file), "utf8"))),
  );
  const expected = { sessions: 0, finished: 0, rounds: 0, correct: 0, events: 0 };
  for (const run of all)
    for (const scenario of run.scenarios.filter((entry) => entry.rounds.length)) {
      expected.sessions += scenario.size;
      expected.finished += scenario.size;
      for (const round of scenario.rounds) {
        expected.rounds += round.accepted;
        expected.events += round.accepted;
        expected.correct += round.correct;
      }
    }
  assert.deepEqual(report.database, expected);
  await dock(["exec", app, "node", "scripts/cleanup-db.mjs", "--dry-run"], { log: "cleanup.log" });
  report.correctnessPassed = true;
  const latencies = all.flatMap((run) => run.scenarios.filter((scenario) => scenario.rounds.length));
  report.latency = {
    targetMs: 1000,
    roundP95Max: Math.max(...latencies.map((scenario) => scenario.requests["GET /api/rounds"].latencyMs.p95)),
    voteP95Max: Math.max(...latencies.map((scenario) => scenario.requests["POST /api/votes"].latencyMs.p95)),
  };
  report.latency.met = report.latency.roundP95Max <= 1000 && report.latency.voteP95Max <= 1000;
  assert(report.latency.met, "Correctness passed but the one-second p95 latency target failed");
  report.ok = true;
} catch (error) {
  report.error = clean(error.stack ?? String(error));
  console.error(report.error);
  process.exitCode = 1;
} finally {
  if (owned.includes(app)) {
    const state = await dock(
      ["inspect", app, "--format", '{"state":{{json .State}},"restartCount":{{.RestartCount}}}'],
      { allowFailure: true },
    );
    if (state.status === 0) {
      report.finalState = JSON.parse(state.stdout);
      if (
        report.finalState.state.OOMKilled ||
        !report.finalState.state.Running ||
        report.finalState.restartCount !== 0
      ) {
        report.ok = false;
        report.error ??= "Application container stopped, restarted, or was killed by its memory limit";
        process.exitCode = 1;
      }
      if (report.ok && report.finalState.state.Health?.Status !== "healthy") {
        report.ok = false;
        report.error = "The image HEALTHCHECK did not become healthy";
        process.exitCode = 1;
      }
    }
    await dock(["logs", app], { log: "app.log", allowFailure: true });
    await dock(["cp", `${app}:/tmp`, windowsPath(join(output, "container-tmp"))], { allowFailure: true });
    if (report.finalState?.state.Running) {
      const stopAt = Date.now();
      const stopped = await dock(["stop", "--time", "15", app], { allowFailure: true });
      const afterStop = await dock(["inspect", app, "--format", "{{json .State}}"], { allowFailure: true });
      report.shutdown = { milliseconds: Date.now() - stopAt, status: stopped.status };
      if (afterStop.status === 0) report.shutdown.state = JSON.parse(afterStop.stdout);
      // Next exits with 128 + SIGTERM after its asynchronous shutdown finishes.
      if (
        stopped.status !== 0 ||
        ![0, 143].includes(report.shutdown.state?.ExitCode) ||
        report.shutdown.state?.OOMKilled ||
        report.shutdown.milliseconds >= 15_000
      ) {
        report.ok = false;
        report.error ??= "The app did not stop cleanly after SIGTERM";
        process.exitCode = 1;
      }
    }
  }
  for (const name of owned.reverse()) await dock(["rm", "--force", "--volumes", name], { allowFailure: true });
  if (networkCreated) await dock(["network", "rm", network], { allowFailure: true });
  report.endedAt = Date.now();
  report.scriptSha256 = createHash("sha256")
    .update(await readFile(new URL(import.meta.url)))
    .digest("hex");
  await writeJson("container-result.json", report);
  console.log(`Container result: ${join(output, "container-result.json")}`);
}
