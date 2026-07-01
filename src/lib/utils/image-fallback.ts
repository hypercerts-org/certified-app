/**
 * Graceful-degradation helper for bare `<img>` thumbnails in the feed
 * and explore surfaces.
 *
 * These thumbnails render inside a styled container whose background is
 * a neutral token (e.g. `--bg-sunken`). When a blob URL 404s or fails
 * to decode, the browser would otherwise paint a broken-image glyph on
 * top of that container. Hiding the `<img>` lets the neutral container
 * show through instead, so a failed thumbnail degrades to a clean empty
 * tile rather than a broken-image icon.
 *
 * Use on `<img>` elements that are NOT backed by component state (the
 * shared `Avatar` primitive already manages its own `onError` via
 * React state and should keep doing so). This is for the lightweight
 * inline thumbnails that conditionally render off a URL string.
 */
export function hideBrokenThumb(
  event: React.SyntheticEvent<HTMLImageElement>,
): void {
  const img = event.currentTarget
  // Guard against an error loop if a fallback also fails.
  if (img.dataset.fallbackApplied === "true") return
  img.dataset.fallbackApplied = "true"
  img.style.display = "none"
}
