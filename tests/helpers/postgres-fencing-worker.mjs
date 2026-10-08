import assert from "node:assert/strict";
import { createRequire } from "node:module";
import postgresEsm from "postgres";

const postgres = process.env.POSTGRES_MODULE === "cjs" ? createRequire(import.meta.url)("postgres") : postgresEsm;
assert(process.env.TEST_DATABASE_URL, "TEST_DATABASE_URL is required");
const operation = process.argv[2];
assert(["query", "commit", "rollback", "queued"].includes(operation));
const options = { max: 1, max_pipeline: 1, prepare: false, connect_timeout: 5, onnotice: () => {} };
const pool = postgres(process.env.TEST_DATABASE_URL, options);
const control = postgres(process.env.TEST_DATABASE_URL, options);
let finish;
try {
  if (operation === "queued") {
    let queries;
    const failure = await pool
      .begin((sql) => {
        queries = [
          sql`SELECT pg_terminate_backend(pg_backend_pid())`.execute(),
          sql`SELECT 1`.execute(),
          sql`SELECT 2`.execute(),
        ];
        return Promise.allSettled(queries);
      })
      .catch((error) => error);
    assert(["57P01", "CONNECTION_CLOSED"].includes(failure.code));
    const results = await Promise.allSettled(queries);
    assert.deepEqual(
      results.map((result) => result.status),
      ["rejected", "rejected", "rejected"],
    );
    assert.equal((await pool`SELECT 1 AS value`)[0].value, 1);
  } else {
    let ready;
    const entered = new Promise((resolve) => {
      ready = resolve;
    });
    const gate = new Promise((resolve, reject) => {
      finish = (error) => (error ? reject(error) : resolve());
    });
    const failed = pool
      .begin(async (sql) => {
        const [{ pid }] = await sql`SELECT pg_backend_pid() AS pid`;
        ready({ stale: sql, pid });
        await gate;
      })
      .catch((error) => error);
    const { stale, pid } = await entered;
    await control`SELECT pg_terminate_backend(${pid})`;
    const failure = await failed;
    assert.equal(failure.code, "CONNECTION_CLOSED");
    await pool.begin(async (sql) => {
      const [{ before }] = await sql`SELECT txid_current()::text AS before`;
      if (operation === "query") {
        await assert.rejects(stale`SELECT 1`, { code: "CONNECTION_CLOSED" });
      }
      finish(operation === "rollback" ? new Error("Synthetic late callback failure") : undefined);
      await new Promise((resolve) => setImmediate(resolve));
      const [{ after }] = await sql`SELECT txid_current()::text AS after`;
      assert.equal(after, before, "The old callback must not commit or roll back the replacement transaction");
    });
    assert.equal((await pool`SELECT 1 AS value`)[0].value, 1);
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  process.stdout.write(`${JSON.stringify({ ok: true, operation })}\n`);
} finally {
  finish?.();
  await Promise.all([pool.end({ timeout: 2 }), control.end({ timeout: 2 })]);
}
