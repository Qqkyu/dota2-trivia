import { describe, expect, it } from "vitest";
import {
  CLIENT_DIAGNOSTIC_KINDS,
  diagnosticFingerprint,
  normalizeClientDiagnostic,
  safeDiagnosticPath,
} from "../src/lib/diagnostics.mjs";

const fingerprint = diagnosticFingerprint("TypeError|render failed|private stack");

describe("diagnostics", () => {
  it("fingerprints deterministically", () => {
    expect([...CLIENT_DIAGNOSTIC_KINDS]).toEqual(["react-boundary", "window-error", "unhandled-rejection"]);
    expect(fingerprint).toMatch(/^[a-f0-9]{8}$/);
    expect(diagnosticFingerprint("TypeError|render failed|private stack")).toBe(fingerprint);
    expect(diagnosticFingerprint("a different failure")).not.toBe(fingerprint);
  });

  it("keeps only the pathname", () => {
    expect(safeDiagnosticPath("/profile?token=secret#stats")).toBe("/profile");
    expect(safeDiagnosticPath("//outside.example/path")).toBeNull();
    expect(safeDiagnosticPath(`/${"a".repeat(161)}`)).toBeNull();
  });

  it("strips anything that is not kind, path, fingerprint, or digest", () => {
    const normalized = normalizeClientDiagnostic({
      kind: "react-boundary",
      path: "/play?session=private#round",
      fingerprint,
      digest: "next_safe-reference-42",
      message: "must never leave the browser",
      stack: "must never leave the browser either",
      playerId: "private-player",
    });
    expect(normalized).toEqual({
      kind: "react-boundary",
      path: "/play",
      fingerprint,
      digest: "next_safe-reference-42",
    });
  });

  it.each([
    null,
    {},
    { kind: "unknown", path: "/", fingerprint },
    { kind: "window-error", path: "https://outside.example", fingerprint },
    { kind: "window-error", path: "/", fingerprint: "not-a-fingerprint" },
  ])("rejects malformed payload %o", (invalid) => {
    expect(normalizeClientDiagnostic(invalid)).toBeNull();
  });
});
