import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@atproto/oauth-client-node"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.certified.app",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            // `frame-src` allowlists the iframe sources we explicitly
            // support: Vercel's preview comments overlay, the leaflet
            // linearDocument embed providers (YouTube + Vimeo). Without
            // these origins listed here, the rendered iframes show
            // YouTube's "This content is blocked. Contact the site
            // owner to fix the issue." in-frame message — which is
            // YouTube itself reacting to being framed from a page
            // whose CSP forbids it.
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://vercel.live; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https:; connect-src 'self' https:; frame-src 'self' https://vercel.live https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/settings/security",
        destination: "/settings",
        permanent: true,
      },
      {
        source: "/settings/account",
        destination: "/settings",
        permanent: true,
      },
      // Preserved from the prior certified-app: any existing inbound
      // links to the old /connected-apps page land on the new /apps.
      {
        source: "/connected-apps",
        destination: "/apps",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
