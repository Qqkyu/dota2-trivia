import { verifyDatabaseSchema } from "../src/lib/database-schema.mjs";
import { connectDatabase, normalizeDatabaseCliConnection } from "./database-backup.mjs";
import { grantRuntimeDatabasePrivileges } from "./database-runtime-grants.mjs";

const connectionString = process.env.DATABASE_URL?.trim();
const role = process.env.ARCADE_DATABASE_RUNTIME_ROLE?.trim();
if (!connectionString || !role) throw new Error("DATABASE_URL and ARCADE_DATABASE_RUNTIME_ROLE are required.");
if (process.argv.length > 2) throw new Error("Usage: node scripts/grant-runtime-db.mjs");

const connection = normalizeDatabaseCliConnection(connectionString, {
  schema: process.env.ARCADE_DATABASE_SCHEMA?.trim() || undefined,
  applicationName: "queue-arcade-grants",
});
const { schema } = connection;
const sql = connectDatabase(connection.connectionString, schema, connection.applicationName);
try {
  await verifyDatabaseSchema(sql);
  const grants = await grantRuntimeDatabasePrivileges(sql, { role, schema });
  console.log(JSON.stringify({ ok: true, ...grants }));
} finally {
  await sql.end({ timeout: 5 });
}
