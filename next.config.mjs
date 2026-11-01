// Dota art is served with no query string, and older item art with one fixed version
// query. Every other query is refused: each distinct URL would cost the optimizer a new
// upstream download and resize, so callers could otherwise mint endless work.
const STEAM_ART_HOSTS = ["cdn.cloudflare.steamstatic.com", "cdn.steamstatic.com"];
const STEAM_ART_QUERIES = ["", "?t=1593393829403"];
const STEAM_AVATAR_HOSTS = [
  "avatars.steamstatic.com",
  "avatars.akamai.steamstatic.com",
  "avatars.cloudflare.steamstatic.com",
  "avatars.fastly.steamstatic.com",
  "media.steampowered.com",
  "steamcdn-a.akamaihd.net",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  ...(process.env.QUEUE_ARCADE_DIST_DIR ? { distDir: process.env.QUEUE_ARCADE_DIST_DIR } : {}),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
        ],
      },
      {
        source: "/icon.png",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/assets/dota2/sounds/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=2592000, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      ...STEAM_ART_HOSTS.flatMap((hostname) =>
        STEAM_ART_QUERIES.map((search) => ({ protocol: "https", hostname, pathname: "/apps/dota2/images/**", search })),
      ),
      ...STEAM_AVATAR_HOSTS.map((hostname) => ({ protocol: "https", hostname, pathname: "/**", search: "" })),
    ],
    // Resized images live on the instance disk; drop the least recently used past 128 MB.
    maximumDiskCacheSize: 128 * 1024 * 1024,
  },
};

export default nextConfig;
