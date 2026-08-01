import { reportClientError } from "@/lib/client-diagnostics";

try {
  window.addEventListener("error", (event) => {
    reportClientError(event.error ?? event.message, "window-error");
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportClientError(event.reason, "unhandled-rejection");
  });
} catch {
  // Instrumentation must never prevent the application from starting.
}
