import { afterEach, describe, expect, it, vi } from "vitest";
import { connectDatabase, normalizeDatabaseCliConnection } from "../scripts/database-backup.mjs";

afterEach(() => vi.unstubAllEnvs());

describe("operator database connection isolation", () => {
  it("uses explicit defaults when the URL omits a port, password and TLS options", async () => {
    for (const [key, value] of Object.entries({
      PGHOST: "wrong-host",
      PGPORT: "1",
      PGUSER: "wrong-user",
      PGUSERNAME: "wrong-user",
      PGPASSWORD: "secret-that-must-not-be-used",
      PGDATABASE: "wrong-database",
      PGSSL: "require",
      PGSSLNEGOTIATION: "direct",
      PGDEBUG: "true",
      PGTARGETSESSIONATTRS: "standby",
      PGAPPNAME: "wrong-application",
    }))
      vi.stubEnv(key, value);
    const sql = connectDatabase("postgres://operator@127.0.0.1/arcade");
    try {
      expect(sql.options).toMatchObject({
        host: ["127.0.0.1"],
        port: [5432],
        user: "operator",
        database: "arcade",
        ssl: false,
        sslnegotiation: null,
        debug: false,
        target_session_attrs: "read-write",
        connection: { application_name: "queue-arcade-recovery", search_path: "public" },
      });
      expect(await sql.options.pass()).toBe("");
    } finally {
      await sql.end();
    }
  });

  it("preserves one validated schema and application label in legacy CLI URLs", () => {
    const result = normalizeDatabaseCliConnection(
      "postgres://operator@localhost/arcade?search_path=case_123&application_name=migration-123&sslmode=require",
    );
    expect(result.schema).toBe("case_123");
    expect(result.applicationName).toBe("migration-123");
    expect(new URL(result.connectionString).search).toBe("?sslmode=require");
  });

  it.each([
    "search_path=public,other",
    "search_path=public&search_path=other",
    "search_path=",
    "search_path=public%0A",
    "application_name=one&application_name=two",
    "application_name=bad%0Alabel",
    "application_name=migration%0A",
    "options=-c%20search_path=other",
    "hostaddr=127.0.0.2",
    "sslmode=disable&sslmode=verify-full",
  ])("rejects ambiguous or unsupported URL settings before connection: %s", (query) => {
    expect(() => normalizeDatabaseCliConnection(`postgres://operator@localhost/arcade?${query}`)).toThrow();
  });

  it("rejects conflicting environment and URL schemas", () => {
    expect(() =>
      normalizeDatabaseCliConnection("postgres://operator@localhost/arcade?search_path=one", { schema: "two" }),
    ).toThrow("DATABASE_SCHEMA_INVALID");
  });

  it("rejects trailing newlines in labels supplied directly to the connection factory", () => {
    expect(() => connectDatabase("postgres://operator@localhost/arcade", "public\n")).toThrow(
      "DATABASE_SCHEMA_INVALID",
    );
    expect(() => connectDatabase("postgres://operator@localhost/arcade", "public", "migration\n")).toThrow(
      "DATABASE_APPLICATION_NAME_INVALID",
    );
  });
});
