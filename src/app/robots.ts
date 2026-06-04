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
          "/about",
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
          "/notifications",
          "/groups",
          "/groups/*",
          "/oauth",
          "/oauth/*",
          "/api",
          "/api/*",
        ],
      },
    ],
    sitemap: "https://certified.app/sitemap.xml",
  };
}
