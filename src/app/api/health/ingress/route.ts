import { NextResponse } from "next/server";
import { authenticateIngressProbe, ingressProbeProof } from "@/lib/ingress-probe.mjs";
import { consumeRateLimit } from "@/lib/rate-limit.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
const unavailable = () => NextResponse.json({ error: "Not found" }, { status: 404, headers });

export async function GET(request: Request) {
  const authenticated = authenticateIngressProbe(request);
  if (!authenticated) return unavailable();
  const address = request.headers.get("cf-connecting-ip") ?? "";
  const proof = ingressProbeProof(process.env, authenticated.nonce, address);
  if (!proof) return unavailable();
  const budget = consumeRateLimit({ scope: "operator-ingress-proof", key: "global", limit: 24 });
  if (!budget.allowed) return unavailable();
  return NextResponse.json({ version: 1, nonce: authenticated.nonce, proof }, { headers });
}
