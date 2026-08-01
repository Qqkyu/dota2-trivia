import type { Instrumentation } from "next";
import { diagnosticPath, logServerError } from "@/lib/server-diagnostics";

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
