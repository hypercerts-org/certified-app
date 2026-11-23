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
  // Images are sent to the Server Actions that publish them: an activity's
  // up to 5 MB, a project's banner up to 10 MB (the lexicon's limits). The
  // default limit is 1 MB.
  experimental: {
    serverActions: { bodySizeLimit: "11mb" },
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.bsky.app" }],
  },
  // Hosts allowed to load the dev server besides localhost. 127.0.0.1 always:
  // local sign-in only works there (atproto's loopback client), and Next
  // blocks its dev connection from any other host, which leaves pages without
  // JavaScript (nothing opens, nothing switches). More, for example over
  // Tailscale: ALLOWED_DEV_ORIGINS=myhost.tailnet.ts.net,100.64.0.1 pnpm dev
  allowedDevOrigins: ["127.0.0.1", ...(process.env.ALLOWED_DEV_ORIGINS?.split(",") ?? [])],
  // Your organizations are listed in your workspace now.
  async redirects() {
    return [{ source: "/settings/organizations", destination: "/workspace", permanent: true }];
  },
  // Only the embeds may be framed by other sites. Everything else, sign-in and
  // profile editing included, refuses framing (clickjacking).
  async headers() {
    return [
      {
        // Every response: no MIME sniffing, and only the origin in the
        // Referer sent to other sites (profile pages link out a lot).
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
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
