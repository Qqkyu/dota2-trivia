import { cleanupDatabase } from "../src/lib/database-schema.mjs";
import { connectDatabase, normalizeDatabaseCliConnection } from "./database-backup.mjs";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required. Export it before running cleanup.");
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--dry-run")) throw new Error("Usage: node scripts/cleanup-db.mjs [--dry-run]");

const connection = normalizeDatabaseCliConnection(connectionString, {
  schema: process.env.ARCADE_DATABASE_SCHEMA?.trim() || undefined,
  applicationName: "queue-arcade-cleanup",
});
const sql = connectDatabase(connection.connectionString, connection.schema, connection.applicationName);
try {
  const result = await cleanupDatabase(sql, { dryRun: args.includes("--dry-run") });
  console.log(JSON.stringify({ ok: true, ...result }));
} finally {
  await sql.end({ timeout: 5 });
}
