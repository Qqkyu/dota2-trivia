import { NextResponse } from "next/server";
import { rateLimitRequest } from "@/lib/api-protection";
import { normalizeClientDiagnostic } from "@/lib/diagnostics.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > 2_048) {
    return NextResponse.json({ error: "Diagnostic payload too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 2_048) {
      return NextResponse.json({ error: "Diagnostic payload too large." }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid diagnostic payload." }, { status: 400 });
  }
  const diagnostic = normalizeClientDiagnostic(body);
  if (!diagnostic) return NextResponse.json({ error: "Invalid diagnostic payload." }, { status: 400 });

  const rateLimited = rateLimitRequest(request, "diagnostics", "browser-error", 6);
  if (rateLimited) return rateLimited;

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
