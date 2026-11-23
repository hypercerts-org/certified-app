import type { MetadataRoute } from "next";

// Public pages may be indexed; signed-in and per-viewer routes say noindex in
// their own metadata. Served at /robots.txt (otherwise it would be read as an
// account handle by the [actor] route).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/oauth/"] },
  };
}
