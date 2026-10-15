import { DATABASE_SCHEMA_VERSION, migrateDatabase } from "../src/lib/database-schema.mjs";
import { connectDatabase, normalizeDatabaseCliConnection } from "./database-backup.mjs";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required. Export it before running the migration.");
if (process.argv.length > 2) throw new Error("Usage: node scripts/migrate-db.mjs");

const connection = normalizeDatabaseCliConnection(connectionString, {
  schema: process.env.ARCADE_DATABASE_SCHEMA?.trim() || undefined,
  applicationName: "queue-arcade-migration",
});
const sql = connectDatabase(connection.connectionString, connection.schema, connection.applicationName);
try {
  const applied = await migrateDatabase(sql);
  console.log(JSON.stringify({ ok: true, applied, version: DATABASE_SCHEMA_VERSION }));
} finally {
  await sql.end({ timeout: 5 });
}
