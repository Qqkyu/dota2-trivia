import { NextResponse } from "next/server";
import { preflightRateLimit, readJsonBody, requestOriginAllowed } from "@/lib/api-protection";
import { normalizeClientDiagnostic } from "@/lib/diagnostics.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const limited = preflightRateLimit(request, "diagnostics", 6);
  if (limited) return limited;
  const parsed = await readJsonBody(request, { maxBytes: 2_048 });
  if ("response" in parsed) return parsed.response;
  const { body } = parsed;
  const diagnostic = normalizeClientDiagnostic(body);
  if (!diagnostic) return NextResponse.json({ error: "Invalid diagnostic payload." }, { status: 400 });

  console.error(
    "[queue-arcade:client-error]",
    JSON.stringify({
      at: new Date().toISOString(),
      ...diagnostic,
      release: process.env.RENDER_GIT_COMMIT?.slice(0, 12) || "local",
    }),
  );
  return new NextResponse(null, { status: 202, headers: { "Cache-Control": "no-store" } });
}
