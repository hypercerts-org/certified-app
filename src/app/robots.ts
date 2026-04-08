import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/welcome", "/about", "/terms", "/privacy", "/dsa"],
        disallow: [
          "/settings",
          "/settings/*",
          "/groups",
          "/groups/*",
          "/connected-apps",
          "/oauth/*",
          "/api/*",
        ],
      },
    ],
    sitemap: "https://certified.app/sitemap.xml",
  };
}
