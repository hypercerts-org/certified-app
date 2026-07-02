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
    const isProd = process.env.NODE_ENV === "production";

    // `frame-src` allowlists the iframe sources we explicitly support:
    // Vercel's preview comments overlay, the leaflet linearDocument embed
    // providers (YouTube + Vimeo). Without these origins listed here, the
    // rendered iframes show YouTube's "This content is blocked. Contact the
    // site owner to fix the issue." in-frame message — which is YouTube
    // itself reacting to being framed from a page whose CSP forbids it.
    //
    // Dev addendum: Next.js + React in dev mode use `eval()` for HMR /
    // source-map / debug callstacks, and the Next dev server's HMR
    // WebSocket runs on `ws://`. Without `'unsafe-eval'` and `ws:` in dev,
    // client-side React never hydrates — every page renders SSR-only and
    // useEffect-based data fetches (e.g. the /welcome network-stats tiles)
    // stall on their loading placeholders. Production keeps the strict policy.
    //
    // `frame-ancestors` differs by route: everything defaults to `'none'`
    // (no framing), but the public `/embed/*` routes are designed to be
    // embedded on third-party sites (the contributor-board share-embed
    // iframe), so they open it to `*`.
    const scriptSrc = isProd
      ? "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://vercel.live"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://vercel.live";
    const connectSrc = isProd
      ? "connect-src 'self' https:"
      : "connect-src 'self' https: ws: wss:";
    const contentSecurityPolicy = (frameAncestors: string) =>
      `default-src 'self'; ${scriptSrc}; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https:; ${connectSrc}; frame-src 'self' https://vercel.live https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com; frame-ancestors ${frameAncestors}; base-uri 'self'; form-action 'self'`;

    const commonHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
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
    ];

    return [
      {
        // Every route EXCEPT `/embed/*`: lock framing down entirely with
        // both X-Frame-Options: DENY and CSP frame-ancestors 'none'.
        source: "/((?!embed/).*)",
        headers: [
          ...commonHeaders,
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy("'none'"),
          },
        ],
      },
      {
        // `/embed/*` is the public, framable embed surface (the
        // contributor-board iframe creators paste onto their own sites).
        // Omit X-Frame-Options entirely — it has no allowlist form, so any
        // value would break cross-origin framing — and open CSP
        // frame-ancestors so partner pages can embed it.
        source: "/embed/:path*",
        headers: [
          ...commonHeaders,
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy("*"),
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
      // The standalone /search (people-search) page was folded into
      // /explore. Redirect old / indexed links so they don't 404.
      {
        source: "/search",
        destination: "/explore",
        permanent: true,
      },
      // Preserved from the prior certified-app: any existing inbound
      // links to the old /connected-apps page land on the new /apps.
      {
        source: "/connected-apps",
        destination: "/apps",
        permanent: true,
      },
      // Handle-forward URL migration. Profiles and record detail pages
      // moved to the root, handle-first scheme; the legacy DID-based
      // paths 308 to the new form so previously shared links don't die.
      // The `:did` segment may be a handle or a DID — either resolves on
      // the new route (a DID then canonicalizes to the handle on load).
      {
        source: "/profile/:handle",
        destination: "/:handle",
        permanent: true,
      },
      {
        source: "/activity/:did/:rkey",
        destination: "/:did/activity/:rkey",
        permanent: true,
      },
      {
        source: "/project/:did/:rkey",
        destination: "/:did/project/:rkey",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
