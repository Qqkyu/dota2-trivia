import assert from "node:assert/strict";
import { once } from "node:events";
import { createConnection } from "node:net";
import { createRequire } from "node:module";
import postgresEsm from "postgres";

const postgres = process.env.POSTGRES_MODULE === "cjs" ? createRequire(import.meta.url)("postgres") : postgresEsm;

// Parent tests provide a disposable database explicitly. Never load app credentials.
const databaseUrl = process.env.TEST_DATABASE_URL;
assert(databaseUrl, "TEST_DATABASE_URL is required");
const mode = process.argv[2] ?? "transaction";
const disruption = process.argv[3] ?? "backend";
assert(["transaction", "reserved"].includes(mode));
assert(["backend", "socket"].includes(disruption));
const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
const sockets = [];
const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 5,
  onnotice: () => {},
  socket: async (options) => {
    const socket = options.path
      ? createConnection(options.path)
      : createConnection({ host: options.host[0], port: options.port[0] });
    socket.host = options.host[0];
    socket.port = options.port[0];
    await once(socket, "connect");
    sockets.push(socket);
    return socket;
  },
  connection: { application_name: "postgres_disconnect_worker", statement_timeout: 15000 },
});
const control = postgres(databaseUrl, { max: 1, connect_timeout: 5, onnotice: () => {} });
let backendPid;

async function interruptibleQuery(connection) {
  [{ pid: backendPid }] = await connection`SELECT pg_backend_pid() AS pid`;
  const pending = connection`SELECT pg_sleep(60)`.execute();
  // Observe the real server query before the parent interrupts it.
  const blocked = (async () => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const rows = await control`
        SELECT pid FROM pg_stat_activity
        WHERE pid = ${backendPid} AND wait_event = 'PgSleep'
      `;
      if (rows.length) {
        emit({ event: "blocked", pid: backendPid, mode, disruption });
        if (disruption === "socket") sockets.at(-1).destroy();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("The query did not reach pg_sleep before the test deadline");
  })();
  await Promise.all([pending, blocked]);
}

try {
  let interruption;
  try {
    if (mode === "transaction") {
      await sql.begin(interruptibleQuery);
    } else {
      const reserved = await sql.reserve();
      try {
        await interruptibleQuery(reserved);
      } finally {
        reserved.release();
      }
    }
  } catch (error) {
    assert(["57P01", "CONNECTION_CLOSED", "CONNECTION_DESTROYED"].includes(error.code), error.message);
    interruption = error.code;
    emit({ event: "interrupted", code: interruption, mode, disruption });
  }
  assert(interruption, "The interrupted query must reject");
  if (disruption === "socket") {
    await control`SELECT pg_terminate_backend(${backendPid})`;
  }
  const [recovered] = await sql`SELECT 1 AS value, pg_backend_pid() AS pid`;
  assert.equal(recovered.value, 1);
  assert.notEqual(recovered.pid, backendPid);
  // An asynchronous driver exception must remain fatal, including after promise rejection.
  await new Promise((resolve) => setTimeout(resolve, 100));
  emit({ event: "result", ok: true, recovered: true, mode, disruption, interruption });
} finally {
  await Promise.all([sql.end({ timeout: 2 }), control.end({ timeout: 2 })]);
}
