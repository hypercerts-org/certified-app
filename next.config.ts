import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Public, indexed data (src/lib/hypercerts/queries.ts): revalidated on the
  // server every minute, dropped after an hour. The browser reuses it for five
  // minutes (stale): five minutes or more puts it in the shell every link
  // prefetches, so pages open complete. Your own saves clear the browser's
  // copy at once (updateTag); others' changes show within five minutes on
  // in-app navigation, at once on a reload.
  cacheLife: {
    public: { stale: 300, revalidate: 60, expire: 3600 },
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.bsky.app" }],
  },
  // Extra hosts allowed to load the dev server, for example over Tailscale:
  // ALLOWED_DEV_ORIGINS=myhost.tailnet.ts.net,100.64.0.1 pnpm dev
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS?.split(",") ?? [],
  // Your organizations are listed in your workspace now.
  async redirects() {
    return [{ source: "/settings/organizations", destination: "/workspace", permanent: true }];
  },
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
