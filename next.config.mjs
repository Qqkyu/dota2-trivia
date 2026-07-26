/** @type {import('next').NextConfig} */
const nextConfig = {
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
    ],
  },
};

export default nextConfig;
