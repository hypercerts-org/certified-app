import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@atproto/oauth-client-node"],
  // Next 16 dev blocks /_next/* requests (including the HMR WebSocket)
  // when the request Origin doesn't match the canonical localhost form.
  // Our PUBLIC_URL convention is 127.0.0.1 (for OAuth + cookie reasons),
  // so without this allowlist, HMR fails with ERR_INVALID_HTTP_RESPONSE
  // and React never hydrates on the page.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
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
            //
            // Dev addendum: Next.js + React in dev mode use `eval()` for
            // HMR / source-map / debug callstacks, and the Next dev
            // server's HMR WebSocket runs on `ws://`. Without
            // `'unsafe-eval'` and `ws:` in dev, client-side React never
            // hydrates — every page renders SSR-only and useEffect-based
            // data fetches (e.g. the /welcome network-stats tiles) stall
            // on their loading placeholders. Production keeps the strict
            // policy.
            value:
              process.env.NODE_ENV === "production"
                ? "default-src 'self'; script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://vercel.live; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https:; connect-src 'self' https:; frame-src 'self' https://vercel.live https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
                : "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://vercel.live; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https:; connect-src 'self' https: ws: wss:; frame-src 'self' https://vercel.live https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
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
