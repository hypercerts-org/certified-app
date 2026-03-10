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
        destination: "/settings/account",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
