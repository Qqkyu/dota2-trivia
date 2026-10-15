import assert from "node:assert/strict";
import net from "node:net";
import { once } from "node:events";
import { createRequire } from "node:module";
import postgresEsm from "postgres";

const postgres = process.env.POSTGRES_MODULE === "cjs" ? createRequire(import.meta.url)("postgres") : postgresEsm;
assert(process.env.TEST_DATABASE_URL, "TEST_DATABASE_URL is required");
const target = new URL(process.env.TEST_DATABASE_URL);
assert(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "Use a disposable loopback database");
const mode = process.argv[2];
assert(["once", "reset-once", "repeated", "clean-close", "mixed-window"].includes(mode));
const applicationName = `driver_startup_${process.pid}`;
const control = postgres(target.href, { max: 1, prepare: false, connect_timeout: 5, onnotice: () => {} });
await control`SELECT 1`;
const pairs = [];
const clients = new Set();
const terminations = [];
let interruptions = 0;
let enabled = true;
const proxy = net.createServer((client) => {
  clients.add(client);
  client.on("close", () => clients.delete(client));
  client.on("error", () => {});
  if (mode === "clean-close" && enabled) {
    interruptions++;
    client.end();
    return;
  }
  const upstream = net.connect(Number(target.port || 5432), target.hostname);
  upstream.pipe(client);
  client.on("data", (chunk) => {
    if (enabled && mode === "mixed-window" && interruptions < 3 && chunk.includes(Buffer.from("pg_catalog.pg_type"))) {
      interruptions++;
      upstream.destroy();
      if (interruptions === 2) client.resetAndDestroy();
      else client.end();
      return;
    }
    if (enabled && (mode === "repeated" || interruptions === 0) && chunk.includes(Buffer.from("pg_catalog.pg_type"))) {
      interruptions++;
      if (mode === "reset-once") {
        upstream.destroy();
        client.resetAndDestroy();
        return;
      }
      // The real server authenticates the connection, but never receives its type-discovery SQL.
      const task =
        control`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = ${applicationName}`.then(
          (rows) => {
            assert.equal(rows.length, 1);
          },
        );
      terminations.push(task);
      // Keep failure attached until the normal control-flow assertion awaits it.
      task.catch(() => {});
    } else upstream.write(chunk);
  });
  client.on("error", () => {});
  upstream.on("error", () => {});
  client.on("close", () => upstream.destroy());
  upstream.on("close", () => client.end());
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
  connect_timeout: 1,
  backoff: 0.1,
  onnotice: () => {},
  connection: { application_name: applicationName },
});
try {
  const started = Date.now();
  const first = await sql`SELECT 1 AS value`.catch((error) => ({ error: error.code }));
  if (mode === "once") assert.equal(first[0]?.value, 1);
  else {
    assert(["CONNECTION_CLOSED", "57P01", "ECONNRESET", "EPIPE"].includes(first.error));
    assert(Date.now() - started < 5000, "Repeated startup interruption must settle within the connection deadline");
  }
  assert(interruptions > 0 && interruptions < 20);
  if (mode === "mixed-window") {
    // A socket error must clear the earlier clean-close retry window.
    assert.equal(first.error, "ECONNRESET");
    assert.equal(interruptions, 2);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const [row] = await sql`SELECT 2 AS value`;
    assert.equal(row.value, 2, "A later startup run must have its own retry window");
    assert.equal(interruptions, 3);
  }
  enabled = false;
  await Promise.all(terminations);
  for (let value = 1; value <= 3; value++) {
    const [row] = await sql`SELECT ${value}::integer AS value`;
    assert.equal(row.value, value);
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  process.stdout.write(`${JSON.stringify({ ok: true, mode, recoveredQueries: 3 })}\n`);
} finally {
  await Promise.all([sql.end({ timeout: 0 }), control.end({ timeout: 0 })]);
  for (const client of clients) client.destroy();
  for (const [client, upstream] of pairs) {
    client.destroy();
    upstream.destroy();
  }
  await new Promise((resolve) => proxy.close(resolve));
}
