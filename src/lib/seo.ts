import type { Metadata } from "next";

export const SITE_URL = "https://certified.app";
export const SITE_NAME = "Certified";

/**
 * Default social sharing image (1200×630) used when a page does not have a
 * dedicated hero/banner image of its own.
 */
export const DEFAULT_OG_IMAGE = {
  url: "/assets/certs-hero-1200x630.png",
  width: 1200,
  height: 630,
  alt: "Certified — One account. Your work. Recognized everywhere.",
} as const;

const MAX_DESCRIPTION = 200;

/** Normalizes whitespace and trims a description to a clean social preview length. */
export function trimMetaDescription(text: string | null | undefined, fallback: string): string {
  const clean = text?.replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  if (clean.length <= MAX_DESCRIPTION) return clean;
  const cut = clean.slice(0, MAX_DESCRIPTION - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export type OgImageInput =
  | { url: string; width?: number; height?: number; alt?: string }
  | string
  | null
  | undefined;

function normalizeImage(image: OgImageInput, fallbackAlt: string) {
  if (!image) return DEFAULT_OG_IMAGE;
  if (typeof image === "string") {
    return image.trim() ? { url: image.trim(), alt: fallbackAlt } : DEFAULT_OG_IMAGE;
  }
  return image.url.trim() ? { ...image, alt: image.alt ?? fallbackAlt } : DEFAULT_OG_IMAGE;
}

/**
 * Builds consistent Next.js Metadata with canonical URL, OpenGraph, and Twitter
 * card fields so link previews render cleanly on Facebook, LinkedIn, X, and
 * messaging apps.
 */
export function pageMetadata({
  title,
  absoluteTitle,
  description,
  path,
  image,
  card = "summary_large_image",
  type = "website",
  noIndex = false,
}: {
  title?: string;
  absoluteTitle?: string;
  description: string;
  /** Path starting with `/` for canonical and OpenGraph URL. */
  path?: string;
  /** Custom hero/banner/avatar image; falls back to `DEFAULT_OG_IMAGE`. */
  image?: OgImageInput;
  card?: "summary_large_image" | "summary";
  type?: "website" | "article" | "profile";
  noIndex?: boolean;
}): Metadata {
  const displayTitle = absoluteTitle ?? (title ? `${title} | ${SITE_NAME}` : SITE_NAME);
  const ogImage = normalizeImage(image, displayTitle);
  const canonicalPath = path ? (path.startsWith("/") ? path : `/${path}`) : undefined;

  return {
    title: absoluteTitle ? { absolute: absoluteTitle } : title,
    description,
    ...(canonicalPath ? { alternates: { canonical: canonicalPath } } : {}),
    ...(noIndex ? { robots: { index: false } } : {}),
    openGraph: {
      title: displayTitle,
      description,
      siteName: SITE_NAME,
      type,
      ...(canonicalPath ? { url: canonicalPath } : {}),
      images: [ogImage],
    },
    twitter: {
      card,
      title: displayTitle,
      description,
      images: [ogImage.url],
    },
  };
}
