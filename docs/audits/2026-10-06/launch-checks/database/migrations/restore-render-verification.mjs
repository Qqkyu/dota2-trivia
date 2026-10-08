import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import postgres from "/home/kulmisiu/dev/dota2-trivia/node_modules/postgres/src/index.js";
import { runPostgresTool, databaseInventory } from "/home/kulmisiu/dev/dota2-trivia/scripts/database-backup.mjs";
import { migrateDatabase, ensureDatabaseSchema } from "/home/kulmisiu/dev/dota2-trivia/src/lib/database-schema.mjs";
import { grantRuntimeDatabasePrivileges } from "/home/kulmisiu/dev/dota2-trivia/scripts/database-runtime-grants.mjs";
const root = "/tmp/queue-arcade-launch-checks";
const source = path.join(root, "private-render-backup/extracted/2026-10-06T12:26Z/queue_arcade_db");
const config = JSON.parse(await fs.readFile(path.join(root, "infrastructure/restore-pg17/connection.json"), "utf8"));
const url = new URL(config.adminUrl);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55823");
process.env.PG_BIN_DIR = path.join(root, "tools/postgres17/bin");
process.env.NODE_ENV = "production";
process.env.ARCADE_AUTO_MIGRATE = "false";
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const database = `qa_launch_render_${suffix}`,
  migrationRole = `qa_render_migrator_${suffix}`,
  runtimeRole = `qa_render_runtime_${suffix}`;
const migrationPassword = randomBytes(24).toString("hex"),
  runtimePassword = randomBytes(24).toString("hex");
const options = { max: 1, prepare: false, connect_timeout: 10, onnotice: () => {} };
const admin = postgres(config.adminUrl, options);
let owner, runtime;
let stage = "verify-local-server";
const evidence = {
  reviewedAt: new Date().toISOString(),
  sourceFormat: "PostgreSQL directory archive",
  destination: "unique disposable local PostgreSQL17 database",
  checks: {},
};
const localUrl = (role, password) => {
  const x = new URL(config.adminUrl);
  x.pathname = "/" + database;
  if (role) x.username = role;
  if (password) x.password = password;
  return x.href;
};
async function originalColumnInventory(sql, tables) {
  return sql.begin("isolation level repeatable read read only", async (tx) => {
    await tx`SET LOCAL TIME ZONE 'UTC'`;
    await tx`SET LOCAL DateStyle='ISO, YMD'`;
    await tx`SET LOCAL extra_float_digits=3`;
    const result = [];
    for (const table of tables) {
      const hash = createHash("sha256");
      let rows = 0;
      for await (const batch of tx`SELECT row_to_json(t)::text AS serialized FROM (SELECT ${tx(table.columns.map((c) => c.name))} FROM public.${tx(table.name)}) t ORDER BY row_to_json(t)::text COLLATE "C"`.cursor(
        500,
      )) {
        for (const row of batch) {
          hash.update(row.serialized).update("\n");
          rows++;
        }
      }
      result.push({ name: table.name, rows, sha256: hash.digest("hex") });
    }
    return result;
  });
}
try {
  const [server] =
    await admin`SELECT current_setting('server_version') AS version,current_setting('server_version_num')::integer AS version_number`;
  assert(server.version_number >= 170000 && server.version_number < 180000);
  evidence.server = server;
  const fileHashes = [];
  for (const file of (await fs.readdir(source)).sort()) {
    const data = await fs.readFile(path.join(source, file));
    fileHashes.push({ file, bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") });
  }
  evidence.sourceFiles = fileHashes;
  evidence.sourceFilesSha256 = createHash("sha256").update(JSON.stringify(fileHashes)).digest("hex");
  stage = "create-isolated-roles-and-database";
  await admin.unsafe(
    `CREATE ROLE "${migrationRole}" LOGIN PASSWORD '${migrationPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
  );
  await admin.unsafe(
    `CREATE ROLE "${runtimeRole}" LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
  );
  await admin`CREATE DATABASE ${admin(database)} OWNER ${admin(migrationRole)}`;
  owner = postgres(localUrl(migrationRole, migrationPassword), options);
  const [{ tables }] = await owner`SELECT COUNT(*)::integer AS tables FROM pg_tables WHERE schemaname='public'`;
  assert.equal(tables, 0);
  // Keep the new empty public schema; pg_restore treats it as a default schema.
  const toc = await runPostgresTool("pg_restore", ["--list", source], { captureOutput: true });
  const restoreList = path.join(root, "private-render-backup/restore-filtered.toc");
  await fs.writeFile(
    restoreList,
    toc
      .split("\n")
      .filter((line) => !/^\d+; \d+ \d+ (?:SCHEMA |COMMENT - SCHEMA )/.test(line))
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  stage = "restore-private-archive";
  const restoreStarted = Date.now();
  const restoreEnv = { ...process.env };
  for (const key of Object.keys(restoreEnv)) if (key.startsWith("PG")) delete restoreEnv[key];
  Object.assign(restoreEnv, {
    PGHOST: "127.0.0.1",
    PGPORT: "55823",
    PGDATABASE: database,
    PGUSER: migrationRole,
    PGPASSWORD: migrationPassword,
    PGSSLMODE: "disable",
    PGPASSFILE: "/dev/null",
    PGCONNECT_TIMEOUT: "10",
  });
  const errorLog = await fs.open(path.join(root, "private-render-backup/restore-errors.log"), "w", 0o600);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        path.join(root, "tools/postgres17/bin/pg_restore"),
        [
          `--dbname=${database}`,
          `--use-list=${restoreList}`,
          "--single-transaction",
          "--no-owner",
          "--no-acl",
          "--exit-on-error",
          source,
        ],
        { env: restoreEnv, stdio: ["ignore", "ignore", errorLog.fd] },
      );
      child.on("error", () =>
        reject(Object.assign(new Error("Private restore error log recorded"), { code: "PG_RESTORE_FAILED" })),
      );
      child.on("exit", (code) =>
        code === 0
          ? resolve()
          : reject(Object.assign(new Error("Private restore error log recorded"), { code: "PG_RESTORE_FAILED" })),
      );
    });
  } finally {
    await errorLog.close();
  }
  evidence.restoreMilliseconds = Date.now() - restoreStarted;
  evidence.checks.restoreSucceeded = true;
  stage = "inventory-before-migration";
  const before = await owner.begin("isolation level repeatable read read only", (tx) => databaseInventory(tx));
  evidence.before = before;
  stage = "apply-current-migrations";
  const migrationStarted = Date.now();
  evidence.appliedMigrations = await migrateDatabase(owner);
  evidence.migrationMilliseconds = Date.now() - migrationStarted;
  stage = "verify-original-row-projections";
  const projected = await originalColumnInventory(owner, before.tables);
  const expected = before.tables.map(({ name, rows, sha256 }) => ({ name, rows, sha256 }));
  assert.deepEqual(projected, expected);
  evidence.originalColumnsAfterMigration = projected;
  evidence.checks.allOriginalRowsAndColumnsUnchanged = true;
  evidence.after = await owner.begin("isolation level repeatable read read only", (tx) => databaseInventory(tx));
  stage = "apply-runtime-role-grants";
  evidence.grants = await grantRuntimeDatabasePrivileges(owner, { role: runtimeRole });
  runtime = postgres(localUrl(runtimeRole, runtimePassword), options);
  await ensureDatabaseSchema(runtime);
  const [role] =
    await runtime`SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
  assert(Object.values(role).every((v) => v === false));
  evidence.runtimeRoleFlags = role;
  const [rights] =
    await runtime`SELECT has_schema_privilege(current_user,'public','CREATE') AS schema_create,has_database_privilege(current_user,current_database(),'CREATE') AS database_create,has_database_privilege(current_user,current_database(),'TEMP') AS temporary,has_table_privilege(current_user,'queue_arcade_schema_migrations','SELECT') AS ledger_select,has_table_privilege(current_user,'queue_arcade_schema_migrations','INSERT') AS ledger_insert`;
  assert.deepEqual(rights, {
    schema_create: false,
    database_create: false,
    temporary: false,
    ledger_select: true,
    ledger_insert: false,
  });
  evidence.runtimeRights = rights;
  stage = "verify-runtime-crud-with-rollback";
  const marker = new Error("ROLLBACK_AUDIT_PROBE");
  let probeComplete = false;
  try {
    await runtime.begin(async (tx) => {
      const id = `audit-probe-${suffix}`;
      await tx`INSERT INTO queue_arcade_users (id,created_at,updated_at) VALUES (${id},1,1)`;
      await tx`UPDATE queue_arcade_users SET updated_at=2 WHERE id=${id}`;
      const [{ count }] =
        await tx`SELECT COUNT(*)::integer AS count FROM queue_arcade_users WHERE id=${id} AND updated_at=2`;
      assert.equal(count, 1);
      assert.equal((await tx`DELETE FROM queue_arcade_users WHERE id=${id}`).count, 1);
      probeComplete = true;
      throw marker;
    });
  } catch (error) {
    if (error !== marker) throw error;
  }
  assert(probeComplete);
  evidence.checks.runtimeCrudSucceededAndRolledBack = true;
  for (const query of [
    "CREATE TABLE forbidden_audit_ddl (id integer)",
    "TRUNCATE queue_arcade_users CASCADE",
    "DELETE FROM queue_arcade_schema_migrations",
  ]) {
    let denied = false;
    try {
      await runtime.unsafe(query);
    } catch (error) {
      if (error.code === "42501") denied = true;
      else throw error;
    }
    assert(denied);
  }
  evidence.checks.runtimeDdlTruncateAndLedgerWritesDenied = true;
  stage = "verify-final-data";
  const afterProbe = await owner.begin("isolation level repeatable read read only", (tx) => databaseInventory(tx));
  assert.deepEqual(afterProbe, evidence.after);
  evidence.checks.runtimeVerificationDidNotAlterData = true;
  evidence.checks.repeatMigrationNoOp = JSON.stringify(await migrateDatabase(owner)) === "[]";
  assert(evidence.checks.repeatMigrationNoOp);
  evidence.status = "passed";
  await fs.mkdir(path.join(root, "migrations"), { recursive: true });
  // Only schema metadata, counts and cryptographic hashes enter this evidence file.
  await fs.writeFile(
    path.join(root, "migrations/render-backup-migration.json"),
    JSON.stringify(evidence, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      ok: true,
      restoredTables: before.tables.length,
      restoredRows: before.tables.reduce((sum, t) => sum + t.rows, 0),
      appliedMigrations: evidence.appliedMigrations,
      originalHashesPreserved: true,
      runtimeGrantsVerified: true,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      stage,
      code: typeof error.code === "string" ? error.code : "AUDIT_FAILED",
      name: error.name,
    }),
  );
  process.exitCode = 1;
} finally {
  await runtime?.end({ timeout: 5 });
  await owner?.end({ timeout: 5 });
  await admin`DROP DATABASE IF EXISTS ${admin(database)} WITH (FORCE)`;
  await admin`DROP ROLE IF EXISTS ${admin(runtimeRole)}`;
  await admin`DROP ROLE IF EXISTS ${admin(migrationRole)}`;
  await admin.end({ timeout: 5 });
}
