/** Check names and constraints only. Never include environment values in errors. */
export function validateProductionConfig(env = process.env) {
  const failures = [];
  const fail = (variable, code) => failures.push({ variable, code });
  const value = (name) => String(env[name] ?? "").trim();
  const auth = value("ARCADE_AUTH_SECRET");
  const salt = value("ARCADE_VOTER_SALT");
  if (auth.length < 32) fail("ARCADE_AUTH_SECRET", "CONFIG_AUTH_SECRET_SHORT");
  if (salt.length < 32) fail("ARCADE_VOTER_SALT", "CONFIG_VOTER_SALT_SHORT");
  if (auth && auth === salt) fail("ARCADE_AUTH_SECRET", "CONFIG_SECRETS_EQUAL");
  if (!value("ARCADE_DATA_COUNTRIES")) fail("ARCADE_DATA_COUNTRIES", "CONFIG_COUNTRIES_MISSING");

  let localOrigin = false;
  try {
    const url = new URL(value("ARCADE_APP_URL"));
    const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    localOrigin = local;
    if (
      (!local && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      fail("ARCADE_APP_URL", "CONFIG_ORIGIN_INVALID");
    }
  } catch {
    fail("ARCADE_APP_URL", "CONFIG_ORIGIN_INVALID");
  }

  const database = value("DATABASE_URL");
  if (database) {
    try {
      if (!["postgres:", "postgresql:"].includes(new URL(database).protocol)) {
        fail("DATABASE_URL", "CONFIG_DATABASE_INVALID");
      }
    } catch {
      fail("DATABASE_URL", "CONFIG_DATABASE_INVALID");
    }
  } else if (value("ARCADE_ALLOW_FILE_STORE") !== "true") {
    fail("DATABASE_URL", "CONFIG_DATABASE_MISSING");
  }
  if (
    value("DATABASE_POOL_SIZE") &&
    (!Number.isInteger(Number(env.DATABASE_POOL_SIZE)) ||
      Number(env.DATABASE_POOL_SIZE) < 1 ||
      Number(env.DATABASE_POOL_SIZE) > 50)
  ) {
    fail("DATABASE_POOL_SIZE", "CONFIG_POOL_SIZE_INVALID");
  }
  if (!["", "none", "cf-connecting-ip", "x-real-ip", "x-forwarded-for"].includes(value("ARCADE_TRUST_PROXY"))) {
    fail("ARCADE_TRUST_PROXY", "CONFIG_PROXY_INVALID");
  } else if (!localOrigin && !value("ARCADE_TRUST_PROXY")) {
    fail("ARCADE_TRUST_PROXY", "CONFIG_PROXY_REQUIRED");
  }
  if (!["", "false", "true"].includes(value("ARCADE_AUTO_MIGRATE"))) {
    fail("ARCADE_AUTO_MIGRATE", "CONFIG_AUTO_MIGRATE_INVALID");
  }
  if (
    value("ARCADE_ROUND_RETENTION_HOURS") &&
    (!Number.isFinite(Number(env.ARCADE_ROUND_RETENTION_HOURS)) || Number(env.ARCADE_ROUND_RETENTION_HOURS) <= 0)
  ) {
    fail("ARCADE_ROUND_RETENTION_HOURS", "CONFIG_RETENTION_INVALID");
  }
  if (
    value("ARCADE_REVIEWER_STEAM_IDS")
      .split(/[\s,]+/)
      .filter(Boolean)
      .some((id) => !/^\d{17}$/.test(id))
  ) {
    fail("ARCADE_REVIEWER_STEAM_IDS", "CONFIG_REVIEWERS_INVALID");
  }
  return failures;
}

export function assertProductionConfig(env = process.env) {
  if (env.NODE_ENV !== "production" || env.NEXT_PHASE === "phase-production-build") return;
  const [failure] = validateProductionConfig(env);
  if (!failure) return;
  const error = new Error(`${failure.variable} configuration is invalid. See docs/operations.md.`);
  error.code = failure.code;
  throw error;
}
