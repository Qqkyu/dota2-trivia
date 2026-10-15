import { describe, expect, it } from "vitest";
import { assertProductionConfig, validateProductionConfig } from "../src/lib/production-config.mjs";
import { diagnosticErrorCode } from "../src/lib/diagnostic-error-code.mjs";
import { requestClientAddress } from "../src/lib/rate-limit.mjs";

const valid = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://app:private-password@localhost/arcade",
  ARCADE_APP_URL: "https://arcade.example",
  ARCADE_AUTH_SECRET: "a".repeat(32),
  ARCADE_VOTER_SALT: "b".repeat(32),
  ARCADE_DATA_COUNTRIES: "Germany",
  ARCADE_TRUST_PROXY: "x-real-ip",
};

describe("production configuration boundary", () => {
  it("accepts separate secrets, a canonical origin and Postgres", () => {
    expect(validateProductionConfig(valid)).toEqual([]);
    expect(() => assertProductionConfig(valid)).not.toThrow();
  });
  it("accepts explicit Cloudflare header trust without enabling it from Render metadata", () => {
    expect(validateProductionConfig({ ...valid, ARCADE_TRUST_PROXY: "cf-connecting-ip" })).toEqual([]);
    expect(validateProductionConfig({ ...valid, ARCADE_TRUST_PROXY: undefined, RENDER: "true" })).toContainEqual({
      variable: "ARCADE_TRUST_PROXY",
      code: "CONFIG_PROXY_REQUIRED",
    });
  });
  it("fails before listening without exposing secret values", () => {
    const env = { ...valid, ARCADE_AUTH_SECRET: "private-short-secret", DATABASE_URL: "private-bad-connection" };
    const failures = validateProductionConfig(env);
    expect(failures.map((entry) => entry.code)).toContain("CONFIG_AUTH_SECRET_SHORT");
    expect(failures.map((entry) => entry.code)).toContain("CONFIG_DATABASE_INVALID");
    expect(JSON.stringify(failures)).not.toContain("private-");
    expect(() => assertProductionConfig(env)).toThrow("ARCADE_AUTH_SECRET configuration is invalid");
  });
  it("rejects cross-purpose secrets, insecure or noncanonical origins and unknown proxy modes", () => {
    expect(validateProductionConfig({ ...valid, ARCADE_VOTER_SALT: valid.ARCADE_AUTH_SECRET })).toContainEqual({
      variable: "ARCADE_AUTH_SECRET",
      code: "CONFIG_SECRETS_EQUAL",
    });
    for (const origin of ["http://arcade.example", "https://arcade.example/path", "https://user:pass@arcade.example"]) {
      expect(validateProductionConfig({ ...valid, ARCADE_APP_URL: origin })).toContainEqual({
        variable: "ARCADE_APP_URL",
        code: "CONFIG_ORIGIN_INVALID",
      });
    }
    expect(validateProductionConfig({ ...valid, ARCADE_TRUST_PROXY: "all" })).toContainEqual({
      variable: "ARCADE_TRUST_PROXY",
      code: "CONFIG_PROXY_INVALID",
    });
  });
  it("requires an explicit public policy and permits conservative shared limits before ingress verification", () => {
    for (const mode of [undefined, ""]) {
      expect(validateProductionConfig({ ...valid, ARCADE_TRUST_PROXY: mode })).toContainEqual({
        variable: "ARCADE_TRUST_PROXY",
        code: "CONFIG_PROXY_REQUIRED",
      });
      expect(
        validateProductionConfig({ ...valid, ARCADE_APP_URL: "http://127.0.0.1:3210", ARCADE_TRUST_PROXY: mode }),
      ).toEqual([]);
    }
    expect(validateProductionConfig({ ...valid, ARCADE_TRUST_PROXY: "none" })).toEqual([]);
    expect(() => assertProductionConfig({ ...valid, ARCADE_TRUST_PROXY: "none" })).not.toThrow();
    const request = new Request(valid.ARCADE_APP_URL, {
      headers: {
        "cf-connecting-ip": "192.0.2.50",
        "x-real-ip": "192.0.2.51",
        "x-forwarded-for": "192.0.2.52",
      },
    });
    expect(requestClientAddress(request, "none")).toBe("unknown");
  });
  it("requires an explicit opt-in for file storage and permits builds without deployment secrets", () => {
    expect(validateProductionConfig({ ...valid, DATABASE_URL: "" })).toContainEqual({
      variable: "DATABASE_URL",
      code: "CONFIG_DATABASE_MISSING",
    });
    expect(validateProductionConfig({ ...valid, DATABASE_URL: "", ARCADE_ALLOW_FILE_STORE: "true" })).toEqual([]);
    expect(() =>
      assertProductionConfig({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" }),
    ).not.toThrow();
    expect(() => assertProductionConfig({ NODE_ENV: "development" })).not.toThrow();
  });
});

it("logs known operational categories but never arbitrary error codes or messages", () => {
  expect(diagnosticErrorCode({ code: "28P01", message: "password=secret" })).toBe("28P01");
  expect(diagnosticErrorCode({ cause: { code: "ECONNREFUSED" } })).toBe("ECONNREFUSED");
  expect(diagnosticErrorCode({ code: "secret-token-value" })).toBeUndefined();
});
