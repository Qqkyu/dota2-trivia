import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { consumeRateLimit, requestClientAddress } from "../src/lib/rate-limit.mjs";

let directory;
let certificate;
let server;
let port;
let slowResponseChunks = 0;
const scope = `tls-ingress-${process.pid}-${Date.now()}`;

beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "queue-arcade-ingress-"));
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
      "-keyout",
      path.join(directory, "key.pem"),
      "-out",
      path.join(directory, "cert.pem"),
    ],
    { stdio: "ignore" },
  );
  certificate = readFileSync(path.join(directory, "cert.pem"));
  server = createServer(
    { key: readFileSync(path.join(directory, "key.pem")), cert: certificate },
    (incoming, response) => {
      if (incoming.url === "/api/health/ingress") {
        response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        response.flushHeaders();
        const interval = setInterval(() => {
          slowResponseChunks++;
          response.write(" ");
        }, 100);
        response.once("close", () => clearInterval(interval));
        return;
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }
      // Model the trusted edge contract: replace the caller's address header with
      // the TLS connection's actual peer. This is not a test of Render's ingress.
      headers.set("cf-connecting-ip", incoming.socket.remoteAddress);
      const request = new Request(`https://localhost${incoming.url}`, { headers });
      const address = requestClientAddress(request, "cf-connecting-ip");
      const result = consumeRateLimit({ scope, key: address, limit: 2 });
      response.writeHead(result.allowed ? 200 : 429);
      response.end();
    },
  );
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  port = server.address().port;
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (directory) rmSync(directory, { recursive: true, force: true });
});

function probe(index) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: "/",
        ca: certificate,
        headers: {
          "cf-connecting-ip": `192.0.2.${index}`,
          "x-real-ip": `198.51.100.${index}`,
          "x-forwarded-for": `203.0.113.${index}, 192.0.2.${index}`,
        },
      },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode));
      },
    );
    request.once("error", reject);
    request.setTimeout(5_000, () => request.destroy(new Error("Local TLS probe timed out.")));
    request.end();
  });
}

describe("TLS ingress with an overwritten client address", () => {
  it("keeps one source allowance despite forged forwarding header rotation", async () => {
    expect(await probe(1)).toBe(200);
    expect(await probe(2)).toBe(200);
    expect(await probe(3)).toBe(429);
    expect(await probe(4)).toBe(429);
  });

  it("stops the operator CLI at its absolute deadline while the TLS server keeps sending data", async () => {
    const secret = "isolated-cli-test-secret-at-least-32-characters";
    const script = fileURLToPath(new URL("../scripts/check-ingress-proof.mjs", import.meta.url));
    const started = performance.now();
    const result = await promisify(execFile)(process.execPath, [script, `https://localhost:${port}`], {
      env: {
        ...process.env,
        ARCADE_AUTH_SECRET: secret,
        INGRESS_EXPECTED_IPV4: "127.0.0.1",
        NODE_EXTRA_CA_CERTS: path.join(directory, "cert.pem"),
      },
      timeout: 14_000,
      killSignal: "SIGKILL",
    }).catch((error) => error);
    expect(result.code).toBe(1);
    expect(result.signal).toBeNull();
    expect(result.killed).toBe(false);
    expect(result.stderr).toContain("Probe connection failed.");
    expect(result.stderr).not.toContain(secret);
    expect(result.stdout).toBe("");
    expect(slowResponseChunks).toBeGreaterThan(20);
    expect(performance.now() - started).toBeLessThan(13_000);
  }, 16_000);
});
