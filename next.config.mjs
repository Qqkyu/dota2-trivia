/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  ...(process.env.QUEUE_ARCADE_DIST_DIR ? { distDir: process.env.QUEUE_ARCADE_DIST_DIR } : {}),
  async headers() {
    return [
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
      {
        protocol: "https",
        hostname: "cdn.cloudflare.steamstatic.com",
        pathname: "/apps/dota2/images/**",
      },
      {
        protocol: "https",
        hostname: "cdn.steamstatic.com",
        pathname: "/apps/dota2/images/**",
      },
      ...[
        "avatars.steamstatic.com",
        "avatars.akamai.steamstatic.com",
        "avatars.cloudflare.steamstatic.com",
        "avatars.fastly.steamstatic.com",
        "media.steampowered.com",
        "steamcdn-a.akamaihd.net",
      ].map((hostname) => ({ protocol: "https", hostname, pathname: "/**" })),
    ],
  },
};

export default nextConfig;
