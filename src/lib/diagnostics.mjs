export const CLIENT_DIAGNOSTIC_KINDS = ["react-boundary", "window-error", "unhandled-rejection"];

export function diagnosticFingerprint(value) {
  const input = String(value || "unknown").slice(0, 2_000);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function safeDiagnosticPath(value) {
  if (typeof value !== "string") return null;
  const pathname = value.split(/[?#]/, 1)[0];
  if (!pathname.startsWith("/") || pathname.startsWith("//") || pathname.length > 160) return null;
  return pathname;
}

export function normalizeClientDiagnostic(value) {
  if (!value || typeof value !== "object") return null;
  const candidate = value;
  const kind = CLIENT_DIAGNOSTIC_KINDS.includes(candidate.kind) ? candidate.kind : null;
  const path = safeDiagnosticPath(candidate.path);
  const fingerprint =
    typeof candidate.fingerprint === "string" && /^[a-f0-9]{8}$/.test(candidate.fingerprint)
      ? candidate.fingerprint
      : null;
  const digest =
    typeof candidate.digest === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(candidate.digest) ? candidate.digest : null;
  if (!kind || !path || !fingerprint) return null;
  return { kind, path, fingerprint, ...(digest ? { digest } : {}) };
}
