import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import postgres from "postgres";
import { DATABASE_SCHEMA_VERSION, verifyDatabaseSchema } from "../src/lib/database-schema.mjs";

const FORMAT_VERSION = 1;

export function backupError(code) {
  return Object.assign(new Error(code), { code });
}

export function parseDatabaseConnection(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw backupError("DATABASE_URL_INVALID");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    url.pathname.length < 2 ||
    url.hash
  ) {
    throw backupError("DATABASE_URL_INVALID");
  }
  const allowed = new Set(["sslmode", "sslrootcert", "connect_timeout", "target_session_attrs"]);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1)
      throw backupError("DATABASE_URL_OPTION_UNSUPPORTED");
  }
  const sslmode = url.searchParams.get("sslmode") ?? "disable";
  const sslrootcert = url.searchParams.get("sslrootcert");
  const timeout = Number(url.searchParams.get("connect_timeout") ?? 10);
  const target = url.searchParams.get("target_session_attrs") ?? "read-write";
  if (
    !["disable", "require", "verify-full"].includes(sslmode) ||
    (sslrootcert && sslrootcert !== "system") ||
    !Number.isInteger(timeout) ||
    timeout < 1 ||
    timeout > 60 ||
    !["read-write", "read-only", "primary", "standby", "prefer-standby"].includes(target)
  ) {
    throw backupError("DATABASE_URL_OPTION_UNSUPPORTED");
  }
  const result = {
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: Number(url.port || 5432),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    ssl: sslmode !== "disable" || sslrootcert === "system",
    timeout,
    target,
  };
  if (Object.values(result).some((value) => typeof value === "string" && value.includes("\0")))
    throw backupError("DATABASE_URL_INVALID");
  return result;
}

function connectionIdentity(connectionString) {
  const { host, port, database } = parseDatabaseConnection(connectionString);
  return createHash("sha256").update(`${host.toLowerCase()}:${port}/${database}`).digest("hex");
}

function validateDatabaseLabels(schema, applicationName) {
  if (typeof schema !== "string" || !/^[a-z_]/.test(schema) || /[^a-z0-9_]/.test(schema)) {
    throw backupError("DATABASE_SCHEMA_INVALID");
  }
  if (
    typeof applicationName !== "string" ||
    applicationName.length < 1 ||
    applicationName.length > 63 ||
    /[^a-zA-Z0-9_.:-]/.test(applicationName)
  ) {
    throw backupError("DATABASE_APPLICATION_NAME_INVALID");
  }
}

/** Keep legacy CLI schema labels explicit without accepting arbitrary startup options. */
export function normalizeDatabaseCliConnection(connectionString, { schema, applicationName } = {}) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw backupError("DATABASE_URL_INVALID");
  }
  for (const key of ["search_path", "application_name"]) {
    if (url.searchParams.getAll(key).length > 1) throw backupError("DATABASE_URL_OPTION_UNSUPPORTED");
  }
  const urlSchema = url.searchParams.get("search_path");
  if (schema && urlSchema !== null && schema !== urlSchema) throw backupError("DATABASE_SCHEMA_INVALID");
  schema ??= urlSchema ?? "public";
  applicationName = url.searchParams.get("application_name") ?? applicationName ?? "queue-arcade-operator";
  validateDatabaseLabels(schema, applicationName);
  url.searchParams.delete("search_path");
  url.searchParams.delete("application_name");
  parseDatabaseConnection(url.href);
  return { connectionString: url.href, schema, applicationName };
}

export function connectDatabase(connectionString, schema = "public", applicationName = "queue-arcade-recovery") {
  const config = parseDatabaseConnection(connectionString);
  validateDatabaseLabels(schema, applicationName);
  return postgres({
    host: [config.host],
    port: [config.port],
    database: config.database,
    username: config.username,
    password: () => config.password,
    ssl: config.ssl,
    sslnegotiation: null,
    debug: false,
    target_session_attrs: config.target,
    max: 1,
    connect_timeout: config.timeout,
    prepare: false,
    onnotice: () => {},
    connection: { application_name: applicationName, search_path: schema },
  });
}

/** Secrets stay in the child environment, never its arguments or returned errors. */
export async function runPostgresTool(name, args, { connectionString, outputFd, captureOutput = false } = {}) {
  const binary = process.env.PG_BIN_DIR ? path.join(process.env.PG_BIN_DIR, name) : name;
  const env = { ...process.env };
  // libpq has destination overrides such as PGHOSTADDR that postgres.js does not use.
  // The explicit URL must select the same server for preflight and the native client.
  for (const key of Object.keys(env)) if (key.startsWith("PG")) delete env[key];
  env.PGCONNECT_TIMEOUT = "10";
  env.PGPASSFILE = process.platform === "win32" ? "NUL" : "/dev/null";
  if (connectionString) {
    const config = parseDatabaseConnection(connectionString);
    // PGDATABASE is a database name, not a connection URI. libpq does not expand a URI from it.
    env.PGHOST = config.host;
    env.PGPORT = String(config.port);
    env.PGDATABASE = config.database;
    env.PGUSER = config.username;
    env.PGPASSWORD = config.password;
    env.PGCONNECT_TIMEOUT = String(config.timeout);
    env.PGTARGETSESSIONATTRS = config.target;
    // Both clients verify the server certificate. "require" is deliberately stricter here.
    env.PGSSLMODE = config.ssl ? "verify-full" : "disable";
    if (config.ssl) env.PGSSLROOTCERT = "system";
    env.PGAPPNAME = `queue-arcade-${name}`;
    if (name === "pg_restore" && args.includes("--dbname=")) {
      // Supply only the database name in this argument; the credentials stay in the environment.
      const dbname = env.PGDATABASE.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
      args = args.map((arg) => (arg === "--dbname=" ? `--dbname=dbname='${dbname}'` : arg));
    }
  }
  return new Promise((resolve, reject) => {
    let output = "";
    const child = spawn(binary, args, {
      env,
      stdio: ["ignore", outputFd ?? (captureOutput ? "pipe" : "ignore"), "pipe"],
    });
    if (captureOutput)
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
        if (output.length > 4_000_000) {
          child.kill();
          reject(backupError("POSTGRES_TOOL_OUTPUT_LIMIT"));
        }
      });
    child.stderr.resume();
    child.once("error", () => reject(backupError(`${name.toUpperCase()}_UNAVAILABLE`)));
    child.once("exit", (code, signal) => {
      if (code === 0) resolve(output);
      else reject(backupError(`${name.toUpperCase()}_${signal ? "INTERRUPTED" : "FAILED"}`));
    });
  });
}

export async function fileHash(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

/** Read all app rows in a stable order without holding their JSON in memory. */
export async function databaseInventory(sql) {
  await sql`SET LOCAL TIME ZONE 'UTC'`;
  await sql`SET LOCAL DateStyle = 'ISO, YMD'`;
  await sql`SET LOCAL extra_float_digits = 3`;
  const [{ schema }] = await sql`SELECT current_schema() AS schema`;
  if (!schema) throw backupError("DATABASE_SCHEMA_MISSING");
  const tables = await sql`
    SELECT c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${schema} AND c.relkind IN ('r', 'p')
    ORDER BY c.relname COLLATE "C"
  `;
  if (!tables.length || tables.some(({ name }) => !name.startsWith("queue_arcade_"))) {
    throw backupError("DEDICATED_APP_SCHEMA_REQUIRED");
  }
  const result = [];
  for (const { name } of tables) {
    const columns = await sql`
      SELECT column_name AS name, data_type AS type, is_nullable AS nullable, column_default AS "default"
      FROM information_schema.columns WHERE table_schema = ${schema} AND table_name = ${name}
      ORDER BY ordinal_position
    `;
    const hash = createHash("sha256");
    let rows = 0;
    // Sorting the canonical row text also works for tables without a primary key.
    // PostgreSQL can spill this sort to disk; the Node process streams one batch at a time.
    for await (const batch of sql`
      SELECT row_to_json(t)::text AS serialized FROM ${sql(schema)}.${sql(name)} t
      ORDER BY row_to_json(t)::text COLLATE "C"
    `.cursor(500)) {
      for (const { serialized } of batch) {
        hash.update(serialized).update("\n");
        rows += 1;
      }
    }
    result.push({ name, rows, sha256: hash.digest("hex"), columns: [...columns] });
  }
  return { schema, tables: result };
}

async function syncFile(filename) {
  const file = await open(filename, "r");
  try {
    await file.sync();
  } finally {
    await file.close();
  }
}

/** Create a new private directory; manifest.json is written only after the complete dump. */
export async function backupDatabase({
  connectionString,
  outputDirectory,
  schema = process.env.ARCADE_DATABASE_SCHEMA || "public",
}) {
  if (!connectionString) throw backupError("DATABASE_URL_REQUIRED");
  const sourceIdentity = connectionIdentity(connectionString);
  const directory = path.resolve(outputDirectory);
  const startedAt = Date.now();
  // mkdir without recursive reserves this path and refuses any existing backup.
  await mkdir(directory, { mode: 0o700 });
  let sql;
  try {
    sql = connectDatabase(connectionString, schema);
    const dumpPath = path.join(directory, "backup.dump");
    const partialPath = path.join(directory, "backup.dump.partial");
    let serverVersion;
    const inventory = await sql.begin("isolation level repeatable read read only", async (transaction) => {
      await verifyDatabaseSchema(transaction);
      const [{ snapshot, version }] = await transaction`
        SELECT pg_export_snapshot() AS snapshot, current_setting('server_version_num') AS version
      `;
      serverVersion = Number(version);
      const inventory = await databaseInventory(transaction);
      const file = await open(partialPath, "wx", 0o600);
      try {
        await runPostgresTool(
          "pg_dump",
          [
            "--format=custom",
            "--compress=6",
            `--snapshot=${snapshot}`,
            `--schema="${inventory.schema.replaceAll('"', '""')}"`,
            "--no-owner",
            "--no-acl",
          ],
          { connectionString, outputFd: file.fd },
        );
        await file.sync();
      } finally {
        await file.close();
      }
      return inventory;
    });
    await runPostgresTool("pg_restore", ["--list", partialPath]);
    await rename(partialPath, dumpPath);
    const dump = { file: "backup.dump", bytes: (await stat(dumpPath)).size, sha256: await fileHash(dumpPath) };
    const manifest = {
      formatVersion: FORMAT_VERSION,
      schemaVersion: DATABASE_SCHEMA_VERSION,
      startedAt: new Date(startedAt).toISOString(),
      completedAt: new Date().toISOString(),
      sourceIdentity,
      serverVersion,
      dump,
      ...inventory,
    };
    const manifestPath = path.join(directory, "manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await syncFile(manifestPath);
    await syncFile(directory);
    await syncFile(path.dirname(directory));
    return {
      directory,
      tables: inventory.tables.length,
      rows: inventory.tables.reduce((n, t) => n + t.rows, 0),
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    // Only remove the new directory reserved by this call. Existing paths never reach here.
    await rm(directory, { recursive: true, force: true });
    throw error;
  } finally {
    await sql?.end({ timeout: 5 });
  }
}

export async function readBackup(directory) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  } catch {
    throw backupError("BACKUP_MANIFEST_INVALID");
  }
  if (
    manifest.formatVersion !== FORMAT_VERSION ||
    manifest.schemaVersion !== DATABASE_SCHEMA_VERSION ||
    manifest.dump?.file !== "backup.dump" ||
    !Number.isSafeInteger(manifest.dump.bytes) ||
    manifest.dump.bytes <= 0 ||
    !/^[a-f0-9]{64}$/.test(manifest.dump.sha256) ||
    !/^[a-f0-9]{64}$/.test(manifest.sourceIdentity) ||
    typeof manifest.schema !== "string" ||
    !Array.isArray(manifest.tables) ||
    !manifest.tables.length ||
    manifest.tables.some(
      (table) =>
        typeof table.name !== "string" ||
        !table.name.startsWith("queue_arcade_") ||
        !Number.isSafeInteger(table.rows) ||
        table.rows < 0 ||
        !/^[a-f0-9]{64}$/.test(table.sha256) ||
        !Array.isArray(table.columns),
    )
  )
    throw backupError("BACKUP_MANIFEST_INVALID");
  const filename = path.join(directory, manifest.dump.file);
  const file = await stat(filename);
  if (!file.isFile() || file.size !== manifest.dump.bytes || (await fileHash(filename)) !== manifest.dump.sha256) {
    throw backupError("BACKUP_CHECKSUM_MISMATCH");
  }
  return { manifest, filename };
}

export async function assertEmptyRestoreTarget(sql) {
  const objects = await sql`
    SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
      AND n.nspname NOT LIKE 'pg_temp_%'
    UNION ALL
    SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    UNION ALL
    SELECT typname AS name FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
  `;
  if (objects.length) throw backupError("RESTORE_TARGET_NOT_EMPTY");
}

/** Restore only into an empty isolated database. The caller supplies the migration owner. */
export async function restoreDatabase({ connectionString, inputDirectory }) {
  if (!connectionString) throw backupError("RESTORE_DATABASE_URL_REQUIRED");
  const targetIdentity = connectionIdentity(connectionString);
  const directory = path.resolve(inputDirectory);
  const startedAt = Date.now();
  const { manifest, filename } = await readBackup(directory);
  if (targetIdentity === manifest.sourceIdentity) throw backupError("RESTORE_TARGET_IS_SOURCE");
  const tableOfContents = await runPostgresTool("pg_restore", ["--list", filename], { captureOutput: true });
  const sql = connectDatabase(connectionString, manifest.schema);
  try {
    await assertEmptyRestoreTarget(sql);
    const [{ clients }] = await sql`
      SELECT COUNT(*)::integer AS clients FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend'
    `;
    if (clients) throw backupError("RESTORE_TARGET_IN_USE");
    const existingSchemas = await sql`SELECT nspname FROM pg_namespace WHERE nspname = ${manifest.schema}`;
    // pg_dump -n includes CREATE SCHEMA public. A newly created database already has it.
    // Keep the existing empty schema and its owner/grants. Do not drop it or require database CREATE.
    let restoreListDirectory;
    try {
      const args = ["--dbname=", "--single-transaction", "--no-owner", "--no-acl", "--exit-on-error"];
      if (existingSchemas.length) {
        const schemaEntries = tableOfContents
          .split("\n")
          .filter((line) => !/^\d+; \d+ \d+ (?:SCHEMA |COMMENT - SCHEMA )/.test(line));
        restoreListDirectory = await mkdtemp(path.join(os.tmpdir(), "queue-restore-list-"));
        const restoreList = path.join(restoreListDirectory, "toc.list");
        await writeFile(restoreList, `${schemaEntries.join("\n")}\n`, { mode: 0o600, flag: "wx" });
        args.push(`--use-list=${restoreList}`);
      }
      // The helper replaces this marker with a database-only argument, keeping credentials private.
      await runPostgresTool("pg_restore", [...args, filename], { connectionString });
    } finally {
      if (restoreListDirectory) await rm(restoreListDirectory, { recursive: true, force: true });
    }
    const inventory = await sql.begin("isolation level repeatable read read only", async (transaction) => {
      await verifyDatabaseSchema(transaction);
      return databaseInventory(transaction);
    });
    if (JSON.stringify(inventory) !== JSON.stringify({ schema: manifest.schema, tables: manifest.tables })) {
      throw backupError("RESTORE_INTEGRITY_MISMATCH");
    }
    return {
      directory,
      verified: true,
      tables: inventory.tables.length,
      rows: inventory.tables.reduce((n, t) => n + t.rows, 0),
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
