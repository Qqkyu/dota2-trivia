import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString("base64");
  const development = process.env.NODE_ENV === "development";
  // Dev-only allowance so impeccable live mode can load. Guarded by NODE_ENV.
  // 'strict-dynamic' ignores host allowances, so the development policy omits it.
  const liveDev = development ? " http://localhost:8400" : "";
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${development ? " 'unsafe-eval'" + liveDev : " 'strict-dynamic'"}`,
    // Timers, fog, progress bars, and positioning use React style attributes.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.steamstatic.com https://media.steampowered.com https://steamcdn-a.akamaihd.net https://www.dota2.com",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    `connect-src 'self'${development ? " ws: wss:" + liveDev : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/|assets/|arcade/|icon.png|favicon.ico|opengraph-image).*)"],
};
