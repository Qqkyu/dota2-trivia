import { afterEach, expect, test } from "vitest";
import { createServer as createHttpServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";

const helper = new URL("../scripts/lib/health-readiness.mjs", import.meta.url).href;
const servers = [];
const sockets = new Set();

afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.closeAllConnections?.();
          server.close(resolve);
        }),
    ),
  );
});

async function listen(server) {
  servers.push(server);
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}/api/health`;
}

function child(source) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const process = spawn(
      globalThis.process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      import { readHealthWithDeadline } from ${JSON.stringify(helper)};
      ${source}
    `,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    const guard = setTimeout(() => process.kill("SIGKILL"), 3000);
    process.stdout.on("data", (data) => {
      stdout += data;
    });
    process.stderr.on("data", (data) => {
      stderr += data;
    });
    process.once("error", (error) => {
      clearTimeout(guard);
      reject(error);
    });
    process.once("close", (code, signal) => {
      clearTimeout(guard);
      resolve({ code, signal, stdout, stderr, elapsed: Date.now() - started });
    });
  });
}

test("startup cleanup runs when the peer closes during native fetch parser initialization", async () => {
  const url = await listen(createTcpServer((socket) => socket.end()));
  const result = await child(`
    const compile = WebAssembly.compile;
    let compiled = 0;
    WebAssembly.compile = async function(...args) {
      const module = await compile.apply(this, args);
      compiled += 1;
      console.log("parser compiled");
      // Exercise a no-handle interval while native fetch awaits its parser.
      await new Promise((resolve) => setTimeout(resolve, 100).unref());
      return module;
    };
    try {
      await readHealthWithDeadline(${JSON.stringify(url)}, 300);
      throw new Error("A closed peer cannot return ready health");
    } catch (error) {
      if (!["TimeoutError", "TypeError"].includes(error.name)) throw error;
      console.log("request settled:", error.name);
    } finally {
      console.log("startup cleanup reached");
      console.log("parser compile calls:", compiled);
    }
  `);
  // Node 22 loads the native fetch parser through WebAssembly.compile on first use.
  // Node 24 does not, so the hook has nothing to intercept there and the cleanup
  // assertions below are the whole test.
  expect(result.stdout).toContain(
    result.stdout.includes("parser compiled") ? "parser compile calls: 1" : "parser compile calls: 0",
  );
  expect(result.code, result.stderr).toBe(0);
  expect(result.signal).toBeNull();
  expect(result.stdout).toContain("request settled:");
  expect(result.stdout).toContain("startup cleanup reached");
  expect(result.elapsed).toBeLessThan(2000);
});

test("the deadline rejects even if a pending fetch does not react to abort", async () => {
  const result = await child(`
    globalThis.fetch = () => new Promise(() => {});
    try {
      await readHealthWithDeadline("http://127.0.0.1:3323/api/health", 50);
      throw new Error("Expected a request deadline");
    } catch (error) {
      console.log(error.name);
    } finally {
      console.log("startup cleanup reached");
    }
  `);
  expect(result.code, result.stderr).toBe(0);
  expect(result.signal).toBeNull();
  expect(result.stdout).toContain("TimeoutError");
  expect(result.stdout).toContain("startup cleanup reached");
  expect(result.elapsed).toBeLessThan(2000);
});

test("the same deadline covers a stalled JSON response body", async () => {
  const url = await listen(
    createHttpServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.write('{"status":');
    }),
  );
  const result = await child(`
    try { await readHealthWithDeadline(${JSON.stringify(url)}, 75); }
    catch (error) { console.log(error.name); }
    finally { console.log("startup cleanup reached"); }
  `);
  expect(result.code, result.stderr).toBe(0);
  expect(result.signal).toBeNull();
  expect(result.stdout).toContain("TimeoutError");
  expect(result.stdout).toContain("startup cleanup reached");
});

test.each([200, 503])("returns the %i health response and clears the request timer", async (status) => {
  const url = await listen(
    createHttpServer((_request, response) => {
      response.writeHead(status, { "content-type": "application/json", connection: "close" });
      response.end(JSON.stringify({ status: status === 200 ? "ready" : "starting" }));
    }),
  );
  const result = await child(`
    console.log(JSON.stringify(await readHealthWithDeadline(${JSON.stringify(url)}, 10000)));
  `);
  expect(result.code, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({
    ok: status === 200,
    health: { status: status === 200 ? "ready" : "starting" },
  });
  expect(result.elapsed).toBeLessThan(2000);
});

test("a malformed JSON response rejects and clears the request timer", async () => {
  const url = await listen(
    createHttpServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json", connection: "close" });
      response.end("not-json");
    }),
  );
  const result = await child(`
    try { await readHealthWithDeadline(${JSON.stringify(url)}, 10000); }
    catch (error) { console.log(error.name); }
  `);
  expect(result.code, result.stderr).toBe(0);
  expect(result.stdout).toContain("SyntaxError");
  expect(result.elapsed).toBeLessThan(2000);
});
