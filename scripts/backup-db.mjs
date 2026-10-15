import { backupDatabase } from "./database-backup.mjs";

try {
  if (process.argv.length !== 3 || process.argv[2].startsWith("-")) {
    throw Object.assign(new Error(), { code: "BACKUP_USAGE_REQUIRES_NEW_DIRECTORY" });
  }
  const result = await backupDatabase({ connectionString: process.env.DATABASE_URL, outputDirectory: process.argv[2] });
  console.log(JSON.stringify({ ok: true, ...result }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, code: /^[A-Z0-9_]+$/.test(error?.code) ? error.code : "BACKUP_FAILED" }));
  process.exitCode = 1;
}
