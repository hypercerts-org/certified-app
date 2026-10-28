import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@atproto/oauth-client-node"],
  // Client router cache: dynamic segments (/explore, /groups, profile
  // and record-detail routes) default to staleTime 0 in Next 15/16,
  // so every repeat Link/bottom-nav navigation refetches an RSC shell
  // whose real data comes from client hooks with their own caches.
  // 30s lets a just-visited shell be reused. Sign-in goes through a
  // full reload (oauth/callback), but signOut is client-side — the
  // cached / redirect can replay to /home within 30s, where the
  // session re-check bounces anonymous viewers back out.
  experimental: {
    staleTimes: { dynamic: 30 },
  },
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
    // No Content-Security-Policy here: src/proxy.ts sends it per request
    // with a nonce (src/lib/security/csp.ts, TECH-803). On Vercel these
    // static headers also reach the page render as request headers, where
    // a nonce-less CSP would stop Next.js from stamping its scripts.
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
        // X-Frame-Options: DENY (the proxy's CSP adds frame-ancestors 'none').
        source: "/((?!embed/).*)",
        headers: [...commonHeaders, { key: "X-Frame-Options", value: "DENY" }],
      },
      {
        // `/embed/*` is the public, framable embed surface (the
        // contributor-board iframe creators paste onto their own sites).
        // Omit X-Frame-Options entirely — it has no allowlist form, so any
        // value would break cross-origin framing; the proxy's CSP opens
        // frame-ancestors so partner pages can embed it.
        source: "/embed/:path*",
        headers: commonHeaders,
      },
      {
        // API responses skip the proxy, so they get a static policy. They
        // are data, never pages: nothing may load or run if one is opened
        // directly.
        source: "/api/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'none'; frame-ancestors 'none'",
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
