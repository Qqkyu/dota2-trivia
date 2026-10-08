import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { request } from "node:https";
import { isIP } from "node:net";
import { INGRESS_PROBE_PATH, ingressProbeAuthorization, ingressProbeProof } from "../src/lib/ingress-probe.mjs";

// Read-only operator check. Secrets enter through the environment and are never printed.
assert.equal(process.argv.length, 3, "Usage: node scripts/check-ingress-proof.mjs HTTPS_ORIGIN");
const origin = new URL(process.argv[2]);
assert(
  origin.protocol === "https:" &&
    !origin.username &&
    !origin.password &&
    origin.pathname === "/" &&
    !origin.search &&
    !origin.hash,
);
const expected = process.env.INGRESS_EXPECTED_IPV4;
assert.equal(isIP(expected ?? ""), 4, "Set INGRESS_EXPECTED_IPV4 to the operator's independently checked IPv4 egress.");
const env = {
  ARCADE_APP_URL: origin.origin,
  ARCADE_AUTH_SECRET: process.env.ARCADE_AUTH_SECRET,
  ARCADE_TRUST_PROXY: "none",
};

function read(url, headers) {
  return new Promise((resolve, reject) => {
    let deadline;
    const finish = (error, result) => {
      clearTimeout(deadline);
      if (error) reject(error);
      else resolve(result);
    };
    const req = request(url, { method: "GET", family: 4, headers, timeout: 10_000 }, (res) => {
      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > 8192) {
          res.destroy(new Error("Probe response too large."));
          return;
        }
        chunks.push(chunk);
      });
      res.on("error", (error) => finish(error));
      res.on("end", () => {
        try {
          finish(null, {
            status: res.statusCode,
            cache: res.headers["cache-control"],
            data: JSON.parse(Buffer.concat(chunks).toString()),
          });
        } catch {
          finish(new Error("Probe response was not JSON."));
        }
      });
    });
    // Socket timeouts reset when data arrives. This deadline also bounds a trickling response.
    deadline = setTimeout(() => req.destroy(new Error("Probe request deadline exceeded.")), 10_000);
    req.on("timeout", () => req.destroy(new Error("Probe request timed out.")));
    req.on("error", () => finish(new Error("Probe connection failed.")));
    req.end();
  });
}

const cases = [
  { name: "baseline", headers: {} },
  { name: "cloudflare-header", headers: { "CF-Connecting-IP": "192.0.2.41" } },
  { name: "real-ip-header", headers: { "X-Real-IP": "192.0.2.42" } },
  { name: "forwarded-chain", headers: { "X-Forwarded-For": "192.0.2.43, 198.51.100.44" } },
  {
    name: "combined-headers",
    headers: {
      "CF-Connecting-IP": "192.0.2.45",
      "X-Real-IP": "192.0.2.46",
      "X-Forwarded-For": "192.0.2.47, 198.51.100.48",
    },
  },
];
const checks = [];
for (const test of cases) {
  const nonce = randomBytes(32).toString("base64url");
  const authorization = ingressProbeAuthorization(env, nonce, Math.floor(Date.now() / 1000) + 45);
  const response = await read(new URL(INGRESS_PROBE_PATH, origin), { ...test.headers, Authorization: authorization });
  assert.equal(response.status, 200, `Operator authentication failed in ${test.name}.`);
  assert.equal(response.cache, "no-store");
  assert.deepEqual(Object.keys(response.data).sort(), ["nonce", "proof", "version"]);
  assert.equal(response.data.version, 1);
  assert.equal(response.data.nonce, nonce);
  // Keep values out of assertion messages. Only a pass/fail classification is retained.
  assert(
    response.data.proof === ingressProbeProof(env, nonce, expected),
    `Received header did not match independently checked egress in ${test.name}.`,
  );
  for (const address of ["192.0.2.41", "192.0.2.45", "", "unknown"])
    assert(
      response.data.proof !== ingressProbeProof(env, nonce, address),
      `Untrusted or missing header accepted in ${test.name}.`,
    );
  checks.push({ name: test.name, receivedVerifiedEgress: true, suppliedHeaderDidNotControlResult: true });
}
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      origin: origin.origin,
      ok: true,
      policyDuringCheck: "none",
      checks,
      changedConfiguration: false,
    },
    null,
    2,
  ),
);
