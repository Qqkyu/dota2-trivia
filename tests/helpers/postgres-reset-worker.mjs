import assert from "node:assert/strict";
import net from "node:net";
import { once } from "node:events";
import { createRequire } from "node:module";
import postgresEsm from "postgres";

const postgres = process.env.POSTGRES_MODULE === "cjs" ? createRequire(import.meta.url)("postgres") : postgresEsm;
assert(process.env.TEST_DATABASE_URL, "TEST_DATABASE_URL is required");
const target = new URL(process.env.TEST_DATABASE_URL);
assert(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "Use a disposable loopback database");
const pairs = [];
const proxy = net.createServer((client) => {
  const upstream = net.connect(Number(target.port || 5432), target.hostname);
  client.pipe(upstream).pipe(client);
  client.on("error", () => {});
  upstream.on("error", () => {});
  pairs.push([client, upstream]);
});
proxy.listen(0, "127.0.0.1");
await once(proxy, "listening");
const sql = postgres(target.href, {
  host: "127.0.0.1",
  port: proxy.address().port,
  ssl: false,
  max: 1,
  prepare: false,
  connect_timeout: 5,
  onnotice: () => {},
  connection: { statement_timeout: 15000 },
});
const control = postgres(target.href, { max: 1, prepare: false, connect_timeout: 5, onnotice: () => {} });
let pid;
async function deadline(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Recovered query timed out")), 5000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
try {
  const failure = await sql
    .begin(async (tx) => {
      [{ pid }] = await tx`SELECT pg_backend_pid() AS pid`;
      const pending = tx`SELECT pg_sleep(60)`.execute();
      const reset = (async () => {
        const until = Date.now() + 5000;
        while (Date.now() < until) {
          const rows = await control`SELECT pid FROM pg_stat_activity WHERE pid = ${pid} AND wait_event = 'PgSleep'`;
          if (rows.length) {
            const [client, upstream] = pairs[0];
            upstream.destroy();
            // Send a real TCP reset. Clean socket destruction does not exercise the error/close gap.
            client.resetAndDestroy();
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        throw new Error("The interrupted query did not reach the server");
      })();
      await Promise.all([pending, reset]);
    })
    .catch((error) => error);
  assert(["CONNECTION_CLOSED", "ECONNRESET", "EPIPE"].includes(failure.code));
  await control`SELECT pg_terminate_backend(${pid})`;
  for (let value = 1; value <= 3; value++) {
    const [row] = await deadline(sql`SELECT ${value}::integer AS value`);
    assert.equal(row.value, value);
  }
  // Retain normal process-fatal behavior for asynchronous driver exceptions.
  await new Promise((resolve) => setTimeout(resolve, 100));
  process.stdout.write(`${JSON.stringify({ ok: true, recoveredQueries: 3 })}\n`);
} finally {
  await Promise.all([sql.end({ timeout: 0 }), control.end({ timeout: 0 })]);
  for (const [client, upstream] of pairs) {
    client.destroy();
    upstream.destroy();
  }
  await new Promise((resolve) => proxy.close(resolve));
}
