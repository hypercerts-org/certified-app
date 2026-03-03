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
};

export default nextConfig;
