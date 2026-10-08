const SAFE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EACCES",
  "ENOSPC",
  "ENOENT",
  "CONNECTION_CLOSED",
  "CONNECT_TIMEOUT",
  "CONNECTION_DESTROYED",
  "08000",
  "08001",
  "08003",
  "08006",
  "28P01",
  "28000",
  "3D000",
  "42P01",
  "42501",
  "53300",
  "57P01",
  "CONFIG_AUTH_SECRET_SHORT",
  "CONFIG_VOTER_SALT_SHORT",
  "CONFIG_SECRETS_EQUAL",
  "CONFIG_COUNTRIES_MISSING",
  "CONFIG_ORIGIN_INVALID",
  "CONFIG_DATABASE_INVALID",
  "CONFIG_DATABASE_MISSING",
  "CONFIG_POOL_SIZE_INVALID",
  "MIGRATION_REQUIRED",
  "MIGRATION_MISMATCH",
  "CONFIG_PROXY_INVALID",
  "CONFIG_PROXY_REQUIRED",
  "CONFIG_REVIEWERS_INVALID",
  "CONFIG_AUTO_MIGRATE_INVALID",
  "CONFIG_RETENTION_INVALID",
]);

/** Preserve a known failure category without logging a message, URL, or SQL. */
export function diagnosticErrorCode(error) {
  if (!error || typeof error !== "object") return undefined;
  if (typeof error.code === "string" && SAFE_CODES.has(error.code)) return error.code;
  const cause = error.cause;
  if (cause && typeof cause === "object" && typeof cause.code === "string" && SAFE_CODES.has(cause.code)) {
    return cause.code;
  }
  if (error.name === "TimeoutError") return "ETIMEDOUT";
  return undefined;
}
