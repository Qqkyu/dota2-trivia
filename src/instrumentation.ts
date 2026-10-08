import type { Instrumentation } from "next";
import { diagnosticPath, logServerError } from "@/lib/server-diagnostics";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { assertProductionConfig } = await import("@/lib/production-config.mjs");
  assertProductionConfig();
  const { startStoreMaintenance } = await import("@/lib/store-maintenance");
  startStoreMaintenance();
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  logServerError("request.unhandled", error, {
    method: request.method,
    path: diagnosticPath(request.path),
    route: context.routePath.slice(0, 160),
    routeType: context.routeType,
    router: context.routerKind,
    ...(context.renderSource ? { renderSource: context.renderSource } : {}),
  });
};
