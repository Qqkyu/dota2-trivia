import { diagnosticFingerprint, safeDiagnosticPath } from "@/lib/diagnostics.mjs";
import { diagnosticErrorCode } from "@/lib/diagnostic-error-code.mjs";

function errorParts(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack ?? "" };
  return { name: typeof error, message: String(error), stack: "" };
}

function firstErrorFrame(stack: string) {
  const frame = stack
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .find((line) => line.startsWith("at "));
  return frame?.replace(/[?#][^\s)]*/g, "").slice(0, 240) || undefined;
}

function safeContext(context: Record<string, unknown>) {
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(context)) {
    if (!/^[a-z][a-z0-9_-]{0,39}$/i.test(key)) continue;
    if (typeof value === "string") result[key] = value.replace(/[\r\n]/g, " ").slice(0, 160);
    else if (typeof value === "number" || typeof value === "boolean") result[key] = value;
  }
  return result;
}

export function logServerError(event: string, error: unknown, context: Record<string, unknown> = {}) {
  const parts = errorParts(error);
  const fingerprint = diagnosticFingerprint(`${parts.name}|${parts.message}|${parts.stack}`);
  const safeEvent = event.replace(/[^a-z0-9_.-]/gi, "-").slice(0, 80);
  const frame = firstErrorFrame(parts.stack);
  const errorCode = diagnosticErrorCode(error);
  console.error(
    "[queue-arcade:error]",
    JSON.stringify({
      ...safeContext(context),
      at: new Date().toISOString(),
      event: safeEvent,
      fingerprint,
      errorName: parts.name.slice(0, 80),
      ...(errorCode ? { errorCode } : {}),
      ...(frame ? { frame } : {}),
      release: process.env.RENDER_GIT_COMMIT?.slice(0, 12) || "local",
    }),
  );
  return fingerprint;
}

export function diagnosticPath(value: unknown) {
  return safeDiagnosticPath(value) ?? "/unknown";
}
