import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@atproto/oauth-client-node"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.certified.app",
      },
      {
        protocol: "https",
        hostname: "**.certified.is",
      },
    ],
  },
};

export default nextConfig;
