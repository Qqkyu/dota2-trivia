import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import postgresEsm from "postgres";

const postgres = process.env.POSTGRES_MODULE === "cjs" ? createRequire(import.meta.url)("postgres") : postgresEsm;
assert(process.env.TEST_DATABASE_URL, "TEST_DATABASE_URL is required");
const target = new URL(process.env.TEST_DATABASE_URL);
assert(["postgres:", "postgresql:"].includes(target.protocol), "Use an explicit Postgres database URL");
assert(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "Use a disposable loopback database");
assert(target.pathname.length > 1, "Name the disposable database explicitly");
const options = {
  host: target.hostname.replace(/^\[|\]$/g, ""),
  port: Number(target.port || 5432),
  ssl: false,
  max: 5,
  prepare: false,
  connect_timeout: 5,
  onnotice: () => {},
  connection: { statement_timeout: 5000 },
};
const pool = postgres(target.href, options);
const control = postgres(target.href, { ...options, max: 1 });
const table = `driver_pool_recovery_${process.pid}_${randomBytes(6).toString("hex")}`;
const releases = [];
const pending = [];
let tableCreated = false;

function startBatch(offset) {
  const entered = [];
  const results = [];
  const gates = [];
  for (let index = 0; index < 5; index++) {
    let announce;
    let failedBeforeEntry;
    entered.push(
      new Promise((resolve, reject) => {
        announce = resolve;
        failedBeforeEntry = reject;
      }),
    );
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    releases.push(release);
    gates.push(release);
    const result = pool
      .begin(async (transaction) => {
        const [{ pid }] = await transaction`SELECT pg_backend_pid() AS pid`;
        await transaction`INSERT INTO ${transaction(table)} (transaction_id) VALUES (${offset + index})`;
        announce(pid);
        await gate;
      })
      .then(
        () => ({ status: "fulfilled" }),
        (error) => {
          failedBeforeEntry(error);
          return { status: "rejected", error };
        },
      );
    results.push(result);
    pending.push(result);
  }
  return { entered: Promise.all(entered), results, release: () => gates.forEach((release) => release()) };
}

try {
  await control`CREATE TABLE ${control(table)} (transaction_id integer PRIMARY KEY)`;
  tableCreated = true;
  const first = startBatch(0);
  const firstPids = await first.entered;
  assert.equal(new Set(firstPids).size, 5, "Five transactions must hold distinct pool connections");
  const [{ terminated }] = await control`SELECT pg_terminate_backend(${firstPids[0]}) AS terminated`;
  assert.equal(terminated, true);
  const interrupted = await first.results[0];
  assert.equal(interrupted.status, "rejected");
  assert(["CONNECTION_CLOSED", "57P01"].includes(interrupted.error.code));
  first.release();
  const firstResults = await Promise.all(first.results);
  assert.equal(firstResults.filter((result) => result.status === "rejected").length, 1);
  assert.equal(firstResults.filter((result) => result.status === "fulfilled").length, 4);
  const firstRows = await control`SELECT transaction_id FROM ${control(table)} ORDER BY transaction_id`;
  assert.deepEqual(
    firstRows.map((row) => row.transaction_id),
    [1, 2, 3, 4],
  );

  const second = startBatch(5);
  const secondPids = await second.entered;
  assert.equal(new Set(secondPids).size, 5, "The recovered pool must run five simultaneous transactions");
  assert(!secondPids.includes(firstPids[0]), "The terminated backend must not be reused");
  second.release();
  const secondResults = await Promise.all(second.results);
  assert(secondResults.every((result) => result.status === "fulfilled"));
  const rows = await control`SELECT transaction_id FROM ${control(table)} ORDER BY transaction_id`;
  assert.deepEqual(
    rows.map((row) => row.transaction_id),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  process.stdout.write(
    `${JSON.stringify({ ok: true, poolSize: 5, interruptedTransactions: 1, committedTransactions: 9 })}\n`,
  );
} finally {
  releases.forEach((release) => release());
  try {
    await pool.end({ timeout: 2 });
    await Promise.all(pending);
  } finally {
    try {
      if (tableCreated) await control`DROP TABLE IF EXISTS ${control(table)}`;
    } finally {
      await control.end({ timeout: 2 });
    }
  }
}
