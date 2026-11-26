import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/** Public indexable entry points and legal pages for search crawlers. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/welcome`,
      lastModified: new Date("2026-11-26"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/explore`,
      lastModified: new Date("2026-11-26"),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/apps`,
      lastModified: new Date("2026-11-26"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: new Date("2026-05-06"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: new Date("2026-11-10"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/imprint`,
      lastModified: new Date("2026-05-11"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/dsa`,
      lastModified: new Date("2026-05-06"),
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];
}
