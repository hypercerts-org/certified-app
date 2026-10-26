import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.bsky.app" }],
  },
  // Extra hosts allowed to load the dev server, for example over Tailscale:
  // ALLOWED_DEV_ORIGINS=myhost.tailnet.ts.net,100.64.0.1 pnpm dev
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS?.split(",") ?? [],
}

export default nextConfig
