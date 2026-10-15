#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { assertProductionConfig } from "../src/lib/production-config.mjs";

process.env.NODE_ENV = "production";
try {
  assertProductionConfig();
} catch (error) {
  console.error(JSON.stringify({ event: "startup.configuration", code: error.code, message: error.message }));
  process.exit(1);
}

const args = process.argv.slice(2);
const standalone = args[0] === "--standalone";
const require = createRequire(import.meta.url);
const command = standalone
  ? ["server.js", ...args.slice(1)]
  : [require.resolve("next/dist/bin/next"), "start", ...args];
const server = spawn(process.execPath, command, { stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("error", () => {
  console.error(JSON.stringify({ event: "startup.process", code: "SERVER_START_FAILED" }));
  process.exitCode = 1;
});
server.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGTERM" || signal === "SIGINT" ? 0 : 1);
});
