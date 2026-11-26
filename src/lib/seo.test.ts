import { describe, expect, it } from "vitest";
import { DEFAULT_OG_IMAGE, pageMetadata, trimMetaDescription } from "./seo";

describe("trimMetaDescription", () => {
  it("falls back when text is blank", () => {
    expect(trimMetaDescription("   \n  ", "Fallback")).toBe("Fallback");
    expect(trimMetaDescription(null, "Fallback")).toBe("Fallback");
  });

  it("collapses whitespace and truncates cleanly on word boundary", () => {
    const long = `${"impact ".repeat(40)}end`;
    const result = trimMetaDescription(long, "Fallback");
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result.endsWith("…")).toBe(true);
    expect(result).not.toMatch(/\s…$/);
  });
});

describe("pageMetadata", () => {
  it("populates canonical, OpenGraph, and Twitter fields with default OG image", () => {
    const meta = pageMetadata({
      title: "Terms of Service",
      description: "Terms for Certified.",
      path: "/terms",
    });

    expect(meta.title).toBe("Terms of Service");
    expect(meta.alternates).toEqual({ canonical: "/terms" });
    expect(meta.openGraph).toMatchObject({
      title: "Terms of Service | Certified",
      description: "Terms for Certified.",
      siteName: "Certified",
      type: "website",
      url: "/terms",
      images: [DEFAULT_OG_IMAGE],
    });
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      images: [DEFAULT_OG_IMAGE.url],
    });
  });

  it("uses custom record image and respects summary card when requested", () => {
    const meta = pageMetadata({
      title: "Alice",
      description: "Bio",
      path: "/alice.bsky.social",
      image: "https://cdn.bsky.app/img/avatar/plain/did:plc:abc/cid@jpeg",
      card: "summary",
      type: "profile",
    });

    expect(meta.openGraph).toMatchObject({
      type: "profile",
      images: [
        {
          url: "https://cdn.bsky.app/img/avatar/plain/did:plc:abc/cid@jpeg",
          alt: "Alice | Certified",
        },
      ],
    });
    expect(meta.twitter).toMatchObject({
      card: "summary",
      images: ["https://cdn.bsky.app/img/avatar/plain/did:plc:abc/cid@jpeg"],
    });
  });
});
