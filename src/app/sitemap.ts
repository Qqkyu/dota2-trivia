import type { MetadataRoute } from "next";

// Read the public address at request time: it is set on the host, not at build time.
export const dynamic = "force-dynamic";

/** The two pages meant for search results: the arcade lobby and the privacy notice. */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = new URL(process.env.ARCADE_APP_URL?.trim() || "http://localhost:3000").origin;
  return [
    { url: `${origin}/`, changeFrequency: "daily", priority: 1 },
    { url: `${origin}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
