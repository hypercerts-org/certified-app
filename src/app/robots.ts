import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/welcome",
          "/apps",
          "/help",
          "/terms",
          "/privacy",
          "/dsa",
          "/imprint",
        ],
        disallow: [
          "/home",
          "/explore",
          "/activity",
          "/activity/*",
          "/settings",
          "/settings/*",
          "/create",
          "/endorsements",
          "/endorsement-graph",
          "/groups",
          "/groups/*",
          "/oauth",
          "/oauth/*",
          "/workspace",
          "/profile",
          "/api",
          "/api/*",
        ],
      },
    ],
    sitemap: "https://certified.app/sitemap.xml",
  };
}
