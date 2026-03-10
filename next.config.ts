import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@atproto/oauth-client-node"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.certified.app",
      },
    ],
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
      {
        source: "/settings/connected-apps",
        destination: "/connected-apps",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
