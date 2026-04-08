import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://certified.app/welcome",
      lastModified: new Date("2026-04-07"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://certified.app/about",
      lastModified: new Date("2026-04-07"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: "https://certified.app/terms",
      lastModified: new Date("2026-04-01"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://certified.app/privacy",
      lastModified: new Date("2026-04-01"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://certified.app/dsa",
      lastModified: new Date("2026-03-15"),
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];
}
