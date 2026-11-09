import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Public, indexed data (src/lib/hypercerts/queries.ts): fresh for a minute,
  // revalidated in the background, dropped after an hour.
  cacheLife: {
    public: { stale: 60, revalidate: 60, expire: 3600 },
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.bsky.app" }],
  },
  // Extra hosts allowed to load the dev server, for example over Tailscale:
  // ALLOWED_DEV_ORIGINS=myhost.tailnet.ts.net,100.64.0.1 pnpm dev
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS?.split(",") ?? [],
  // Only the embeds may be framed by other sites. Everything else, sign-in and
  // profile editing included, refuses framing (clickjacking).
  async headers() {
    return [
      {
        source: "/:path((?!embed/).*)",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
