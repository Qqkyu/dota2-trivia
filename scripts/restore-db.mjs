import { restoreDatabase } from "./database-backup.mjs";

try {
  if (process.argv.length !== 3 || process.argv[2].startsWith("-")) {
    throw Object.assign(new Error(), { code: "RESTORE_USAGE_REQUIRES_BACKUP_DIRECTORY" });
  }
  const result = await restoreDatabase({
    connectionString: process.env.RESTORE_DATABASE_URL,
    inputDirectory: process.argv[2],
  });
  console.log(JSON.stringify({ ok: true, ...result }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, code: /^[A-Z0-9_]+$/.test(error?.code) ? error.code : "RESTORE_FAILED" }));
  process.exitCode = 1;
}
