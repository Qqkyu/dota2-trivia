/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  ...(process.env.QUEUE_ARCADE_DIST_DIR ? { distDir: process.env.QUEUE_ARCADE_DIST_DIR } : {}),
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
      ].map((hostname) => ({ protocol: "https", hostname, pathname: "/**" })),
    ],
  },
};

export default nextConfig;
