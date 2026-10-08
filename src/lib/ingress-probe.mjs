import { createHmac, timingSafeEqual } from "node:crypto";

export const INGRESS_PROBE_PATH = "/api/health/ingress";
const NONCE = /^[A-Za-z0-9_-]{43}$/;
const SIGNATURE = /^[a-f0-9]{64}$/;

function settings(env) {
  if (env.ARCADE_TRUST_PROXY !== "none") return null;
  const secret = env.ARCADE_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) return null;
  try {
    const url = new URL(env.ARCADE_APP_URL);
    const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (
      (!local && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    return { origin: url.origin, secret };
  } catch {
    return null;
  }
}

function validNonce(nonce) {
  return (
    typeof nonce === "string" && NONCE.test(nonce) && Buffer.from(nonce, "base64url").toString("base64url") === nonce
  );
}

function mac(secret, purpose, values) {
  const key = createHmac("sha256", secret).update(`queue-arcade:ingress-probe:v1:${purpose}`).digest();
  return createHmac("sha256", key).update(JSON.stringify(values)).digest("hex");
}

/** Operator-side request signing. It does not change a trust policy. */
export function ingressProbeAuthorization(env, nonce, expiresAt) {
  const config = settings(env);
  if (!config || !validNonce(nonce) || !Number.isSafeInteger(expiresAt))
    throw new Error("Invalid ingress probe configuration.");
  const signature = mac(config.secret, "request", ["GET", config.origin, INGRESS_PROBE_PATH, expiresAt, nonce]);
  return `ArcadeIngress v1.${expiresAt}.${nonce}.${signature}`;
}

/** A response binds only this request's received Cloudflare header, never a raw address. */
export function ingressProbeProof(env, nonce, address) {
  const config = settings(env);
  if (!config || !validNonce(nonce) || typeof address !== "string" || address.length > 256) return null;
  return mac(config.secret, "response", [config.origin, INGRESS_PROBE_PATH, nonce, address]);
}

export function authenticateIngressProbe(request, env = process.env, now = Date.now()) {
  const config = settings(env);
  if (!config || request.method !== "GET") return null;
  const url = new URL(request.url);
  if (url.pathname !== INGRESS_PROBE_PATH || url.search || url.hash) return null;
  const authorization = request.headers.get("authorization");
  if (!authorization || authorization.length > 180) return null;
  const match = /^ArcadeIngress v1\.([0-9]{10})\.([A-Za-z0-9_-]{43})\.([a-f0-9]{64})$/.exec(authorization);
  if (!match || !validNonce(match[2]) || !SIGNATURE.test(match[3])) return null;
  const expiresAt = Number(match[1]);
  const seconds = Math.floor(now / 1000);
  if (expiresAt <= seconds || expiresAt > seconds + 60) return null;
  const expected = mac(config.secret, "request", ["GET", config.origin, INGRESS_PROBE_PATH, expiresAt, match[2]]);
  if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(match[3], "hex"))) return null;
  return { nonce: match[2] };
}
