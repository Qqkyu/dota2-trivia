import type { MetadataRoute } from "next";

// Read the public address at request time: it is set on the host, not at build time.
export const dynamic = "force-dynamic";

/**
 * Crawlers may read every page; the API and the private ops page stay out.
 * Pages that should not appear in results (play, party, profile, calibration)
 * say so with a `noindex` robots meta instead, which crawlers can only read
 * when the page itself is not disallowed here.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = new URL(process.env.ARCADE_APP_URL?.trim() || "http://localhost:3000").origin;
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/ops"] }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
