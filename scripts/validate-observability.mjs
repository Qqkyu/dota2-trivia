#!/usr/bin/env node

import {
  CLIENT_DIAGNOSTIC_KINDS,
  diagnosticFingerprint,
  normalizeClientDiagnostic,
  safeDiagnosticPath,
} from "../src/lib/diagnostics.mjs";

const fingerprint = diagnosticFingerprint("TypeError|render failed|private stack");
const normalized = normalizeClientDiagnostic({
  kind: "react-boundary",
  path: "/play?session=private#round",
  fingerprint,
  digest: "next_safe-reference-42",
  message: "must never leave the browser",
  stack: "must never leave the browser either",
  playerId: "private-player",
});

if (
  CLIENT_DIAGNOSTIC_KINDS.join(",") !== "react-boundary,window-error,unhandled-rejection" ||
  !/^[a-f0-9]{8}$/.test(fingerprint) ||
  diagnosticFingerprint("TypeError|render failed|private stack") !== fingerprint ||
  diagnosticFingerprint("a different failure") === fingerprint ||
  safeDiagnosticPath("/profile?token=secret#stats") !== "/profile" ||
  safeDiagnosticPath("//outside.example/path") !== null ||
  safeDiagnosticPath(`/${"a".repeat(161)}`) !== null ||
  normalized?.path !== "/play" ||
  normalized?.kind !== "react-boundary" ||
  normalized?.fingerprint !== fingerprint ||
  normalized?.digest !== "next_safe-reference-42" ||
  "message" in normalized ||
  "stack" in normalized ||
  "playerId" in normalized
) {
  throw new Error("Privacy-safe diagnostic normalization or fingerprinting changed unexpectedly.");
}

for (const invalid of [
  null,
  {},
  { kind: "unknown", path: "/", fingerprint },
  { kind: "window-error", path: "https://outside.example", fingerprint },
  { kind: "window-error", path: "/", fingerprint: "not-a-fingerprint" },
]) {
  if (normalizeClientDiagnostic(invalid) !== null) {
    throw new Error("An unsafe or malformed browser diagnostic was accepted.");
  }
}

console.log("Validated privacy-safe crash fingerprints, paths, and browser diagnostic payloads.");
