import { execFile, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const worker = fileURLToPath(new URL("./helpers/postgres-disconnect-worker.mjs", import.meta.url));
const fencingWorker = fileURLToPath(new URL("./helpers/postgres-fencing-worker.mjs", import.meta.url));
const resetWorker = fileURLToPath(new URL("./helpers/postgres-reset-worker.mjs", import.meta.url));
const startupWorker = fileURLToPath(new URL("./helpers/postgres-startup-worker.mjs", import.meta.url));
const poolWorker = fileURLToPath(new URL("./helpers/postgres-pool-recovery-worker.mjs", import.meta.url));

describe.skipIf(!databaseUrl)("Postgres driver interruption recovery", () => {
  it.each(["esm", "cjs"])(
    "isolates one interrupted transaction in a five-connection %s pool and restores all capacity",
    async (module) => {
      const { stdout, stderr } = await promisify(execFile)(process.execPath, [poolWorker], {
        env: { ...process.env, TEST_DATABASE_URL: databaseUrl, POSTGRES_MODULE: module },
        timeout: 15000,
        killSignal: "SIGKILL",
      });
      expect(JSON.parse(stdout)).toEqual({
        ok: true,
        poolSize: 5,
        interruptedTransactions: 1,
        committedTransactions: 9,
      });
      expect(stderr).toBe("");
    },
    20000,
  );
  it.each(
    ["esm", "cjs"].flatMap((module) =>
      ["once", "reset-once", "repeated", "clean-close", "mixed-window"].map((mode) => [module, mode]),
    ),
  )(
    "settles %s startup %s interruption and accepts later queries",
    async (module, mode) => {
      const { stdout, stderr } = await promisify(execFile)(process.execPath, [startupWorker, mode], {
        env: { ...process.env, TEST_DATABASE_URL: databaseUrl, POSTGRES_MODULE: module },
        timeout: 10000,
        killSignal: "SIGKILL",
      });
      expect(JSON.parse(stdout)).toEqual({ ok: true, mode, recoveredQueries: 3 });
      expect(stderr).toBe("");
    },
    15000,
  );
  it.each(["esm", "cjs"])(
    "recovers repeated %s queries after a real TCP reset",
    async (module) => {
      const { stdout, stderr } = await promisify(execFile)(process.execPath, [resetWorker], {
        env: { ...process.env, TEST_DATABASE_URL: databaseUrl, POSTGRES_MODULE: module },
        timeout: 15000,
        killSignal: "SIGKILL",
      });
      expect(JSON.parse(stdout)).toEqual({ ok: true, recoveredQueries: 3 });
      expect(stderr).toBe("");
    },
    20000,
  );
  it.each([
    ["esm", "transaction", "socket"],
    ["cjs", "transaction", "socket"],
    ["esm", "transaction", "backend"],
    ["cjs", "transaction", "backend"],
    ["esm", "reserved", "socket"],
    ["cjs", "reserved", "socket"],
  ])(
    "survives and reconnects after %s %s %s interruption",
    async (module, mode, disruption) => {
      const admin = postgres(databaseUrl, { max: 1, connect_timeout: 5, onnotice: () => {} });
      const child = spawn(process.execPath, [worker, mode, disruption], {
        env: { ...process.env, TEST_DATABASE_URL: databaseUrl, POSTGRES_MODULE: module },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const events = [];
      let stderr = "";
      let interruption;
      let parseError;
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      const lines = createInterface({ input: child.stdout });
      lines.on("line", (line) => {
        try {
          const event = JSON.parse(line);
          events.push(event);
          if (event.event === "blocked" && disruption === "backend") {
            interruption = admin`SELECT pg_terminate_backend(${event.pid})`.execute();
          }
        } catch (error) {
          parseError = error;
        }
      });
      const timer = setTimeout(() => child.kill("SIGKILL"), 15000);
      try {
        const result = await new Promise((resolve, reject) => {
          child.once("error", reject);
          child.once("exit", (code, signal) => resolve({ code, signal }));
        });
        await interruption;
        expect(parseError).toBeUndefined();
        expect(result, stderr).toEqual({ code: 0, signal: null });
        expect(events.map((event) => event.event)).toEqual(["blocked", "interrupted", "result"]);
        expect(events.at(-1)).toMatchObject({ ok: true, recovered: true, mode, disruption });
        expect(stderr).not.toMatch(/TypeError|uncaught/i);
      } finally {
        clearTimeout(timer);
        lines.close();
        if (child.exitCode === null) child.kill("SIGKILL");
        await admin.end({ timeout: 2 });
      }
    },
    20000,
  );

  it.each(
    ["esm", "cjs"].flatMap((module) =>
      ["query", "commit", "rollback", "queued"].map((operation) => [module, operation]),
    ),
  )(
    "rejects %s stale or queued %s work without damaging the next transaction",
    async (module, operation) => {
      const { stdout, stderr } = await promisify(execFile)(process.execPath, [fencingWorker, operation], {
        env: { ...process.env, TEST_DATABASE_URL: databaseUrl, POSTGRES_MODULE: module },
        timeout: 15000,
        killSignal: "SIGKILL",
      });
      expect(JSON.parse(stdout)).toEqual({ ok: true, operation });
      expect(stderr).toBe("");
    },
    20000,
  );
});
