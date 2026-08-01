import { diagnosticFingerprint } from "@/lib/diagnostics.mjs";

type ClientDiagnosticKind = "react-boundary" | "window-error" | "unhandled-rejection";

const sentFingerprints = new Set<string>();

function errorParts(reason: unknown) {
  if (reason instanceof Error) {
    const digest = "digest" in reason && typeof reason.digest === "string" ? reason.digest : undefined;
    return { name: reason.name, message: reason.message, stack: reason.stack ?? "", digest };
  }
  return { name: typeof reason, message: String(reason), stack: "", digest: undefined };
}

export function reportClientError(reason: unknown, kind: ClientDiagnosticKind) {
  try {
    const parts = errorParts(reason);
    const fingerprint = diagnosticFingerprint(`${kind}|${parts.name}|${parts.message}|${parts.stack}`);
    if (sentFingerprints.has(fingerprint)) return;
    sentFingerprints.add(fingerprint);
    if (sentFingerprints.size > 40) sentFingerprints.delete(sentFingerprints.values().next().value ?? "");

    const payload = JSON.stringify({
      kind,
      path: window.location.pathname,
      fingerprint,
      ...(parts.digest ? { digest: parts.digest } : {}),
    });
    const blob = new Blob([payload], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/diagnostics", blob)) return;
    void fetch("/api/diagnostics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Diagnostics must never become a second application failure.
  }
}
